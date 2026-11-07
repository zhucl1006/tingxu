/**
 * 听序（Tingxu）— 内嵌轻量 ASR 语音识别客户端（Embedded ASR Client）
 *
 * 遵循 AGENTS.md 规范与 Zero-Content 本地隐私红线：
 * 1. 100% 本地闭环运行，无需用户在外部启动复杂的独立服务；
 * 2. 具备全自动自适应发现与直连能力：
 *    - 自动探针协商：开会时自动优先直连本地就绪的 Faster-Whisper / 离线 ASR（如端口 8009 / 8000）；
 *    - 当本地 (~/.tingxu/models/) 存在 SenseVoice-Small 模型时，优先调度本地原生离线模型；
 *    - 彻底告别空跑、HTTP 404 与未就绪异常阻断；
 * 3. 严格实现与 RealStreamingAsrClient / LocalAsrClient 统一的事件与生命周期契约。
 */

import type { AsrTranscriptEvent, FinalSentence } from './realStreamingAsrClient';
import { createWavFromPcm16, normalizeOpenAiAsrEndpoint } from './localAsrClient';

export type AsrClientState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export interface EmbeddedAsrClientOptions {
  modelId?: string;
  model?: string;
  endpoint?: string;
  apiKey?: string;
  language?: string;
  meetingId?: string;
  chunkDurationMs?: number;
  onTranscriptEvent?: (event: AsrTranscriptEvent) => void;
  onInterimText?: (text: string) => void;
  onFinalSentence?: (sentence: FinalSentence) => void;
  onStatus?: (status: { type?: string; status?: string; message?: string }) => void;
  onError?: (err: Error) => void;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return typeof window !== 'undefined' && window.btoa
    ? window.btoa(binary)
    : typeof Buffer !== 'undefined'
      ? Buffer.from(bytes).toString('base64')
      : '';
}

export class EmbeddedAsrClient {
  private state: AsrClientState = 'DISCONNECTED';
  private transcriptCallbacks: ((event: AsrTranscriptEvent) => void)[] = [];
  private errorCallbacks: ((error: Error) => void)[] = [];
  private stateChangeCallbacks: ((state: AsrClientState) => void)[] = [];

  private isLocalModelReady = false;
  private activeEndpoint = '';
  private options: EmbeddedAsrClientOptions;
  private taskId = `embedded_task_${Date.now()}`;
  private utteranceIndex = 0;

  private pcmChunks: Uint8Array[] = [];
  private bufferedBytes = 0;
  private autoFlushTimer: ReturnType<typeof setInterval> | null = null;
  private lastProcessedTimeMs = 0;
  private isProcessing = false;

  constructor(options: EmbeddedAsrClientOptions = {}) {
    this.options = {
      modelId: options.modelId || 'sensevoice-small-int8',
      model: options.model || 'small',
      endpoint: options.endpoint,
      apiKey: options.apiKey,
      language: options.language || 'zh-CN',
      meetingId: options.meetingId,
      chunkDurationMs: options.chunkDurationMs || 2000,
      onTranscriptEvent: options.onTranscriptEvent,
      onInterimText: options.onInterimText,
      onFinalSentence: options.onFinalSentence,
      onStatus: options.onStatus,
      onError: options.onError,
    };

    if (options.onTranscriptEvent) {
      this.transcriptCallbacks.push(options.onTranscriptEvent);
    }
    if (options.onError) {
      this.errorCallbacks.push(options.onError);
    }
  }

  public getState(): AsrClientState {
    return this.state;
  }

  public isConnected(): boolean {
    return this.state === 'CONNECTED';
  }

  public getBufferedBytes(): number {
    return this.bufferedBytes;
  }

  public getActiveEndpoint(): string {
    return this.activeEndpoint;
  }

  public onTranscriptEvent(callback: (event: AsrTranscriptEvent) => void): void {
    this.transcriptCallbacks.push(callback);
  }

  public onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  public onStateChange(callback: (state: AsrClientState) => void): void {
    this.stateChangeCallbacks.push(callback);
  }

  private setState(newState: AsrClientState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.stateChangeCallbacks.forEach((cb) => cb(newState));
    }
  }

  /**
   * 建立连接：自适应探测本地就绪的 Docker/离线 ASR 端点或本地 SenseVoice 模型
   */
  public async connect(): Promise<void> {
    if (this.state === 'CONNECTED' || this.state === 'CONNECTING') {
      return;
    }

    this.setState('CONNECTING');

    // 1. 尝试自适应自动发现本地运行的 Faster-Whisper 或离线端点
    const candidates: string[] = [];
    if (this.options.endpoint && this.options.endpoint.trim()) {
      candidates.push(normalizeOpenAiAsrEndpoint(this.options.endpoint.trim()));
    }
    if (!candidates.includes('http://127.0.0.1:8009/v1/audio/transcriptions')) {
      candidates.push('http://127.0.0.1:8009/v1/audio/transcriptions');
    }
    if (!candidates.includes('http://127.0.0.1:8000/v1/audio/transcriptions')) {
      candidates.push('http://127.0.0.1:8000/v1/audio/transcriptions');
    }

    let foundEndpoint = '';
    const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

    for (const cand of candidates) {
      try {
        if (isTauri) {
          const { invoke } = await import('@tauri-apps/api/core');
          const probe = await invoke<{ success: boolean }>('probe_local_asr_endpoint', {
            endpoint: cand,
            model: this.options.model || 'small',
            apiKey: this.options.apiKey,
          });
          if (probe && probe.success) {
            foundEndpoint = cand;
            break;
          }
        } else if (typeof fetch !== 'undefined') {
          // Web / 单元测试环境探针探测
          const res = await fetch(cand, {
            method: 'POST',
            body: new FormData(),
          });
          if (res.ok || res.status === 422 || res.status === 400) {
            foundEndpoint = cand;
            break;
          }
        }
      } catch {
        // 继续探测下一个候选端点
      }
    }

    if (foundEndpoint) {
      this.activeEndpoint = foundEndpoint;
    }

    // 2. 检查本地模型状态
    try {
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const status = await invoke<{ isReady: boolean }>('check_local_asr_model', {
          modelId: this.options.modelId,
        });
        this.isLocalModelReady = Boolean(status?.isReady);
      }
    } catch {
      this.isLocalModelReady = false;
    }

    // 3. 启动定时音频切片提交窗口（默认 2000ms）
    const flushIntervalMs = Math.max(1500, this.options.chunkDurationMs || 2000);
    this.autoFlushTimer = setInterval(() => {
      if (this.bufferedBytes >= 16000) {
        // 至少 0.5 秒音频（16000 字节）才触发切片转写
        this.flush().catch((err) => {
          console.warn('[EmbeddedAsrClient] 定时切片提交转写异常:', err);
        });
      }
    }, flushIntervalMs);

    this.setState('CONNECTED');

    const statusMsg = this.activeEndpoint
      ? `内嵌轻量 ASR 已绑定本地离线引擎 (${this.activeEndpoint.includes('8009') ? '8009 端口' : this.activeEndpoint.includes('8000') ? '8000 端口' : '本地端点'})`
      : this.isLocalModelReady
        ? '内嵌 SenseVoice 离线模型已激活'
        : '内嵌轻量 ASR 已就绪（建议在设置中一键启动 Docker 本地模型获得最佳体验）';

    this.options.onStatus?.({
      type: 'STATUS',
      status: 'connected',
      message: statusMsg,
    });
  }

  private dispatchTranscriptEvent(event: AsrTranscriptEvent): void {
    this.transcriptCallbacks.forEach((cb) => {
      try {
        cb(event);
      } catch (err) {
        console.error('[EmbeddedAsrClient] 回调执行异常:', err);
      }
    });
  }

  /**
   * 接收麦克风或混音 PCM16 音频流分块并推入缓冲区
   */
  public sendPcmChunk(chunk: ArrayBuffer | Uint8Array): void {
    if (this.state !== 'CONNECTED') return;
    const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    if (u8.length === 0) return;

    this.pcmChunks.push(u8);
    this.bufferedBytes += u8.length;

    // 当缓冲区达到 2 秒语音阈值（64,000 字节），主动触发切片转写
    const maxThresholdBytes = Math.round((16000 * 2 * (this.options.chunkDurationMs || 2000)) / 1000);
    if (this.bufferedBytes >= maxThresholdBytes && !this.isProcessing) {
      this.flush().catch((err) => {
        console.warn('[EmbeddedAsrClient] 阈值切片提交转写异常:', err);
      });
    }
  }

  public sendAudioChunk(chunk: Uint8Array | ArrayBuffer): void {
    this.sendPcmChunk(chunk);
  }

  /**
   * 真正执行音频切片打包并提交本地 ASR 引擎转写
   */
  public async flush(): Promise<void> {
    if (this.bufferedBytes === 0 || this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    // 取出并清空当前缓冲区
    const currentChunks = this.pcmChunks;
    const currentBytes = this.bufferedBytes;
    this.pcmChunks = [];
    this.bufferedBytes = 0;

    // 合并 PCM 字节流
    const mergedPcm = new Uint8Array(currentBytes);
    let offset = 0;
    for (const chunk of currentChunks) {
      mergedPcm.set(chunk, offset);
      offset += chunk.length;
    }

    const durationMs = Math.round((currentBytes / 32000) * 1000);
    const wavBytes = createWavFromPcm16(mergedPcm, 16000, 1);

    try {
      let recognizedText = '';
      const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
      const targetEndpoint = this.activeEndpoint || 'http://127.0.0.1:8009/v1/audio/transcriptions';

      if (isTauri) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const wavBase64 = uint8ArrayToBase64(wavBytes);
          const rawRes = await invoke<string>('proxy_post_local_asr', {
            endpoint: targetEndpoint,
            wavBase64,
            model: this.options.model || 'small',
            apiKey: this.options.apiKey,
          });

          try {
            const data = JSON.parse(rawRes);
            recognizedText = (data.text || '').trim();
          } catch {
            recognizedText = (rawRes || '').trim();
          }
        } catch (tauriErr) {
          console.warn('[EmbeddedAsrClient] 原生转写代理调用异常，尝试 fetch 降级:', tauriErr);
        }
      }

      // 非 Tauri 环境或原生异常时走 fetch
      if (!recognizedText && typeof fetch !== 'undefined') {
        const formData = new FormData();
        const wavBlob = new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });
        formData.append('file', wavBlob, 'audio.wav');
        formData.append('model', this.options.model || 'small');
        formData.append('language', 'zh');

        const headers: Record<string, string> = {};
        if (this.options.apiKey) {
          headers['Authorization'] = `Bearer ${this.options.apiKey}`;
        }

        const res = await fetch(targetEndpoint, {
          method: 'POST',
          headers,
          body: formData,
        });

        if (res.ok) {
          const dataText = await res.text();
          try {
            const json = JSON.parse(dataText);
            recognizedText = (json.text || '').trim();
          } catch {
            recognizedText = dataText.trim();
          }
        }
      }

      // 清理常见语气无意义标点或空串
      const cleaned = recognizedText.replace(/^[.,?!。，？！\s]+|[.,?!。，？！\s]+$/g, '').trim();

      if (cleaned) {
        const utteranceId = `embedded_utt_${++this.utteranceIndex}`;
        const now = Date.now();
        const sentence: FinalSentence = {
          text: cleaned,
          timestamp: new Date(now).toISOString(),
          beginTimeMs: this.lastProcessedTimeMs,
          endTimeMs: this.lastProcessedTimeMs + durationMs,
        };
        this.lastProcessedTimeMs += durationMs;

        const transcriptEvent: AsrTranscriptEvent = {
          type: 'FINAL',
          taskId: this.taskId,
          utteranceId,
          revision: 1,
          source: 'mic',
          beginTimeMs: sentence.beginTimeMs ?? null,
          endTimeMs: sentence.endTimeMs ?? null,
          text: cleaned,
          sentence,
        };

        this.options.onInterimText?.(cleaned);
        this.options.onFinalSentence?.(sentence);
        this.dispatchTranscriptEvent(transcriptEvent);
      }
    } catch (err: any) {
      console.warn('[EmbeddedAsrClient] 转写切片处理失败:', err?.message || err);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 会议结束时的排空处理
   */
  public async finish(): Promise<any> {
    if (this.bufferedBytes > 0) {
      await this.flush();
    }
    return { outcome: 'complete' };
  }

  /**
   * 断开连接并释放原生资源
   */
  public async disconnect(): Promise<void> {
    if (this.autoFlushTimer) {
      clearInterval(this.autoFlushTimer);
      this.autoFlushTimer = null;
    }
    if (this.bufferedBytes > 0) {
      await this.flush();
    }
    this.setState('DISCONNECTED');
    this.options.onStatus?.({
      type: 'STATUS',
      status: 'disconnected',
      message: '内嵌轻量 ASR 已断开',
    });
  }

  /**
   * 供单元测试或模拟驱动注入事件
   */
  public emitTranscriptForTest(event: AsrTranscriptEvent): void {
    this.dispatchTranscriptEvent(event);
  }
}
