/**
 * 听序（Tingxu）— 本地离线 ASR 语音识别客户端 (Plan 027)
 * 支持 OpenAI 兼容 HTTP 分块提交与 Sherpa-ONNX 流式 WebSocket 双协议
 */

import type { LocalAsrProtocol } from '../types/meeting';
import type { AsrTranscriptEvent, AsrFinishOutcome, FinalSentence } from './realStreamingAsrClient';

/**
 * 将 16-bit 线性 PCM 单声道音频数据添加标准 44 字节 WAV 头部
 */
export function createWavFromPcm16(pcmData: Uint8Array, sampleRate = 16000, numChannels = 1): Uint8Array {
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataLen = pcmData.length;
  const buffer = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buffer);

  // 1. "RIFF" chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeString(view, 8, 'WAVE');

  // 2. "fmt " sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size for PCM
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bitsPerSample

  // 3. "data" sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLen, true);

  // 复制 PCM 字节
  const out = new Uint8Array(buffer);
  out.set(pcmData, 44);
  return out;
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export interface LocalAsrClientOptions {
  protocol: LocalAsrProtocol;
  endpoint: string;
  model?: string;
  apiKey?: string;
  chunkDurationMs?: number; // 默认 2500ms
  meetingId?: string;
  onTranscriptEvent?: (event: AsrTranscriptEvent) => void;
  onInterimText?: (text: string) => void;
  onFinalSentence?: (sentence: FinalSentence) => void;
  onStatus?: (status: { type: string; status?: string; message?: string }) => void;
  onError?: (err: Error) => void;
}

export class LocalAsrClient {
  private taskId = `local_task_${Date.now()}`;
  private utteranceIndex = 0;
  private ws: WebSocket | null = null;
  private pcmChunks: Uint8Array[] = [];
  private bufferedBytes = 0;
  private isRunning = false;
  private autoFlushTimer: ReturnType<typeof setInterval> | null = null;
  private lastProcessedTimeMs = 0;

  constructor(private options: LocalAsrClientOptions) {}

  public async start(): Promise<void> {
    this.isRunning = true;
    this.options.onStatus?.({ type: 'STATUS', status: 'connected', message: '本地 ASR 已就绪' });

    if (this.options.protocol === 'sherpa_ws') {
      await this.initWebSocket();
    } else {
      // HTTP 协议：设置定时自动提交窗口
      const intervalMs = Math.max(1500, this.options.chunkDurationMs || 2500);
      this.autoFlushTimer = setInterval(() => {
        if (this.bufferedBytes > 8000) {
          // 至少 0.25 秒音频才触发
          this.flush().catch((err) => {
            console.warn('[LocalAsrClient] 自动分块提交失败:', err);
          });
        }
      }, intervalMs);
    }
  }

  private async initWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(this.options.endpoint);
        ws.binaryType = 'arraybuffer';

        ws.addEventListener('open', () => {
          this.ws = ws;
          this.options.onStatus?.({ type: 'STATUS', status: 'connected' });
          resolve();
        });

        ws.addEventListener('message', (ev) => {
          const raw = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
          this.handleIncomingWsMessage(raw);
        });

        ws.addEventListener('error', (_err) => {
          const error = new Error(`WebSocket 连接异常: ${this.options.endpoint}`);
          this.options.onError?.(error);
          reject(error);
        });

        ws.addEventListener('close', () => {
          this.options.onStatus?.({ type: 'STATUS', status: 'disconnected' });
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  public sendAudioChunk(pcmBytes: Uint8Array, _source: 'mic' | 'system' = 'mic'): void {
    if (!this.isRunning || pcmBytes.length === 0) return;

    if (this.options.protocol === 'sherpa_ws') {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(pcmBytes.buffer.slice(pcmBytes.byteOffset, pcmBytes.byteOffset + pcmBytes.byteLength));
      }
    } else {
      // 累积到内存缓冲区
      this.pcmChunks.push(pcmBytes);
      this.bufferedBytes += pcmBytes.length;

      // 阈值触发：超过设定的字节数（例如 3 秒 = 96,000 字节）
      const maxBytes = Math.round((16000 * 2 * (this.options.chunkDurationMs || 2500)) / 1000);
      if (this.bufferedBytes >= maxBytes) {
        this.flush().catch((err) => {
          this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
        });
      }
    }
  }

  public handleIncomingWsMessage(rawJson: string): void {
    try {
      const data = JSON.parse(rawJson);
      const text = (data.text || data.result || '').trim();
      if (!text) return;

      const isFinal = Boolean(data.is_final || data.final || data.eof);

      const event: AsrTranscriptEvent = {
        type: isFinal ? 'FINAL' : 'INTERIM',
        taskId: this.taskId,
        utteranceId: `utt_${this.utteranceIndex}`,
        revision: isFinal ? 1 : 0,
        source: 'mic',
        beginTimeMs: null,
        endTimeMs: null,
        text,
        sentence: isFinal
          ? {
              text,
              timestamp: new Date().toISOString(),
            }
          : undefined,
      };

      this.options.onTranscriptEvent?.(event);
      if (isFinal) {
        this.utteranceIndex++;
        if (event.sentence) {
          this.options.onFinalSentence?.(event.sentence);
        }
      } else {
        this.options.onInterimText?.(text);
      }
    } catch {
      // 忽略无法解析的中间心跳包
    }
  }

  public async flush(): Promise<void> {
    if (this.options.protocol !== 'openai_http' || this.bufferedBytes === 0) {
      return;
    }

    // 拷贝并清空当前缓冲区
    const currentChunks = this.pcmChunks;
    const currentBytes = this.bufferedBytes;
    this.pcmChunks = [];
    this.bufferedBytes = 0;

    // 合并 PCM 字节数组
    const mergedPcm = new Uint8Array(currentBytes);
    let offset = 0;
    for (const chunk of currentChunks) {
      mergedPcm.set(chunk, offset);
      offset += chunk.length;
    }

    // 封装标准 16kHz WAV
    const wavBytes = createWavFromPcm16(mergedPcm, 16000, 1);
    const wavBlob = new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });

    const formData = new FormData();
    formData.append('file', wavBlob, 'audio.wav');
    formData.append('model', this.options.model || 'whisper-1');
    formData.append('language', 'zh');
    formData.append('response_format', 'json');

    const headers: Record<string, string> = {};
    if (this.options.apiKey) {
      headers['Authorization'] = `Bearer ${this.options.apiKey}`;
    }

    const durationMs = Math.round((currentBytes / 32000) * 1000);

    try {
      const res = await fetch(this.options.endpoint, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`本地 ASR 端点响应异常: HTTP ${res.status}`);
      }

      const data = await res.json();
      const text = (data.text || '').trim();

      if (text) {
        const beginTimeMs = this.lastProcessedTimeMs;
        const endTimeMs = beginTimeMs + durationMs;
        this.lastProcessedTimeMs = endTimeMs;

        const sentence: FinalSentence = {
          text,
          timestamp: new Date().toISOString(),
          beginTimeMs,
          endTimeMs,
        };

        const event: AsrTranscriptEvent = {
          type: 'FINAL',
          taskId: this.taskId,
          utteranceId: `utt_${++this.utteranceIndex}`,
          revision: 1,
          source: 'mic',
          beginTimeMs,
          endTimeMs,
          text,
          sentence,
        };

        this.options.onTranscriptEvent?.(event);
        this.options.onFinalSentence?.(sentence);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.options.onError?.(error);
      throw error;
    }
  }

  public async stop(): Promise<AsrFinishOutcome> {
    this.isRunning = false;

    if (this.autoFlushTimer) {
      clearInterval(this.autoFlushTimer);
      this.autoFlushTimer = null;
    }

    if (this.options.protocol === 'openai_http') {
      try {
        await this.flush();
      } catch {
        // 允许静默忽略结束时的残留残段
      }
    } else if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    return 'complete';
  }

  // --- 适配统一 IAsrClient 契约方法 ---
  public connect(): Promise<void> {
    return this.start();
  }

  public isConnected(): boolean {
    return this.isRunning;
  }

  public sendPcmChunk(pcmData: ArrayBuffer | Uint8Array): void {
    const uint8 = pcmData instanceof Uint8Array ? pcmData : new Uint8Array(pcmData);
    this.sendAudioChunk(uint8);
  }

  public finish(_timeoutMs = 6000): Promise<AsrFinishOutcome> {
    return this.stop();
  }

  public disconnect(): void {
    void this.stop().catch(() => {});
  }

  /**
   * 静态连通性探测方法
   */
  public static async testConnection(options: {
    protocol: LocalAsrProtocol;
    endpoint: string;
    apiKey?: string;
    model?: string;
  }): Promise<{ success: boolean; latencyMs: number; message: string }> {
    const startTime = performance.now();
    try {
      if (options.protocol === 'openai_http') {
        // 构造极小的 0.1s 静音音频进行真实接口握手测试
        const silentPcm = new Uint8Array(3200); // 0.1s at 16kHz 16-bit
        const wavBytes = createWavFromPcm16(silentPcm, 16000, 1);
        const wavBlob = new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });

        const formData = new FormData();
        formData.append('file', wavBlob, 'probe.wav');
        formData.append('model', options.model || 'whisper-1');

        const headers: Record<string, string> = {};
        if (options.apiKey) {
          headers['Authorization'] = `Bearer ${options.apiKey}`;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(options.endpoint, {
          method: 'POST',
          headers,
          body: formData,
          signal: controller.signal,
        });
        clearTimeout(timer);

        const latencyMs = Math.round(performance.now() - startTime);

        if (res.ok) {
          return { success: true, latencyMs, message: `连接成功 (延迟: ${latencyMs}ms)` };
        }
        return { success: false, latencyMs, message: `端点返回异常状态: HTTP ${res.status}` };
      } else {
        // WebSocket 探测
        return new Promise((resolve) => {
          try {
            const ws = new WebSocket(options.endpoint);
            const timer = setTimeout(() => {
              ws.close();
              resolve({ success: false, latencyMs: 3000, message: '连接超时 (3000ms)' });
            }, 3000);

            ws.addEventListener('open', () => {
              clearTimeout(timer);
              const latencyMs = Math.round(performance.now() - startTime);
              ws.close();
              resolve({ success: true, latencyMs, message: `WebSocket 连接成功 (握手: ${latencyMs}ms)` });
            });

            ws.addEventListener('error', () => {
              clearTimeout(timer);
              resolve({ success: false, latencyMs: 0, message: '无法建立 WebSocket 连接，请确认服务已启动' });
            });
          } catch (err) {
            resolve({ success: false, latencyMs: 0, message: `连接失败: ${(err as Error).message}` });
          }
        });
      }
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startTime);
      return {
        success: false,
        latencyMs,
        message: `连接失败: ${(err as Error).message || '网络无法访问'}`,
      };
    }
  }
}
