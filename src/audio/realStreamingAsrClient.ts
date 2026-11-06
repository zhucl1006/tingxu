/**
 * 听序（Tingxu）— 流式 ASR WebSocket 双向推流客户端
 */

export interface FinalSentence {
  text: string;
  speaker?: string;
  speakerId?: string | null;
  timestamp: string;
  beginTimeMs?: number | null;
  endTimeMs?: number | null;
}

export function streamingAsrUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('网关地址需使用HTTP或HTTPS');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/gateway/v1/asr/stream`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

export type AsrFinishOutcome = 'complete' | 'timeout' | 'error';

export interface AsrTranscriptEvent {
  type: 'INTERIM' | 'FINAL';
  taskId: string;
  utteranceId: string;
  revision: number;
  source: 'mic' | 'system';
  beginTimeMs: number | null;
  endTimeMs: number | null;
  text: string;
  sentence?: FinalSentence;
}

export interface RealStreamingAsrClientOptions {
  wsUrl?: string;
  meetingId?: string;
  onInterimText?: (text: string) => void;
  onFinalSentence?: (sentence: FinalSentence) => void;
  onTranscriptEvent?: (event: AsrTranscriptEvent) => void;
  onStatus?: (status: { type: string; status?: string; message?: string }) => void;
  onError?: (err: Error) => void;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function audioTime(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}
function finalSentence(value: unknown): value is FinalSentence {
  return record(value) && typeof value.text === 'string' && value.text.length <= 100000 &&
    typeof value.timestamp === 'string' &&
    (value.beginTimeMs === undefined || audioTime(value.beginTimeMs)) &&
    (value.endTimeMs === undefined || audioTime(value.endTimeMs)) &&
    (value.speaker === undefined || typeof value.speaker === 'string') &&
    (value.speakerId == null || typeof value.speakerId === 'string');
}

export class RealStreamingAsrClient {
  private ws: WebSocket | null = null;
  private connected = false;
  private finishPromise: Promise<AsrFinishOutcome> | null = null;
  private resolveFinish: ((outcome: AsrFinishOutcome) => void) | null = null;
  private finishTimer: ReturnType<typeof setTimeout> | undefined;
  private rejectConnect: ((error: Error) => void) | null = null;

  constructor(private options: RealStreamingAsrClientOptions = {}) {}

  public connect(): Promise<void> {
    this.disconnect();
    this.finishPromise = null;
    return new Promise((resolve, reject) => {
      this.rejectConnect = reject;
      try {
        const baseUrl = this.options.wsUrl || 'ws://localhost:3201/gateway/v1/asr/stream';
        let targetUrl = baseUrl;
        if (this.options.meetingId) {
          const parsed = new URL(baseUrl);
          parsed.searchParams.set('meetingId', this.options.meetingId);
          targetUrl = parsed.toString();
        }
        const socket = new WebSocket(targetUrl);
        this.ws = socket;
        socket.binaryType = 'arraybuffer';
        socket.onopen = () => {
          if (this.ws !== socket) return;
          this.connected = true;
          this.rejectConnect = null;
          resolve();
        };
        socket.onmessage = event => {
          if (this.ws !== socket || typeof event.data !== 'string' || event.data.length > 1000000) return;
          let data: unknown;
          try { data = JSON.parse(event.data); } catch { return; }
          if (!record(data)) return;
          if (data.type === 'FINISHED') {
            if (['complete', 'timeout', 'error'].includes(String(data.outcome))) {
              if (!this.resolveFinish) this.options.onError?.(new Error('语音识别连接已结束，请暂停后重新开始'));
              this.settleFinish(data.outcome as AsrFinishOutcome);
              this.disconnect();
            }
          } else if (data.type === 'ERROR') {
            this.options.onError?.(new Error('语音识别服务异常，请检查连接与服务配置'));
          } else if (data.type === 'STATUS' && typeof data.status === 'string') {
            this.options.onStatus?.({ type: 'STATUS', status: data.status });
          } else if (data.type === 'INTERIM' || data.type === 'FINAL') {
            const isFinal = data.type === 'FINAL';
            if ((isFinal && !finalSentence(data.sentence)) || (!isFinal && typeof data.text !== 'string')) return;
            const sentence = isFinal ? data.sentence as FinalSentence : undefined;
            if (this.options.onTranscriptEvent) {
              if (data.protocolVersion !== 2) {
                this.options.onError?.(new Error('语音识别协议版本不兼容，请更新网关'));
                return;
              }
              if (typeof data.taskId !== 'string' || !data.taskId || data.taskId.length > 128 ||
                  typeof data.utteranceId !== 'string' || !data.utteranceId || data.utteranceId.length > 128 ||
                  !Number.isSafeInteger(data.revision) || (data.revision as number) <= 0 ||
                  (data.source !== 'mic' && data.source !== 'system') ||
                  !audioTime(data.beginTimeMs) || !audioTime(data.endTimeMs) ||
                  (typeof data.beginTimeMs === 'number' && typeof data.endTimeMs === 'number' && data.endTimeMs < data.beginTimeMs)) return;
              this.options.onTranscriptEvent({ type: data.type, taskId: data.taskId, utteranceId: data.utteranceId,
                revision: data.revision as number, source: data.source, beginTimeMs: data.beginTimeMs,
                endTimeMs: data.endTimeMs, text: sentence?.text ?? data.text as string, sentence });
            }
            // 保留旧消费方；工作台只订阅上方关联事件，不重复消费。
            if (sentence) this.options.onFinalSentence?.(sentence);
            else this.options.onInterimText?.(data.text as string);
          }
        };
        socket.onerror = () => {
          if (this.ws !== socket) return;
          this.options.onError?.(new Error('WebSocket connection error'));
          this.disconnect();
        };
        socket.onclose = () => { if (this.ws === socket) this.disconnect(); };
      } catch {
        this.disconnect();
        reject(new Error('无法建立语音识别连接'));
      }
    });
  }

  public sendPcmChunk(pcmData: ArrayBuffer): void {
    if (this.connected && this.ws?.readyState === 1 && !this.finishPromise) this.ws.send(pcmData);
  }

  /** 有界等待尾句；只有上游确认才视为完整结束。 */
  public finish(timeoutMs = 6000): Promise<AsrFinishOutcome> {
    if (this.finishPromise) return this.finishPromise;
    if (!this.connected || !this.ws || this.ws.readyState !== 1) {
      this.disconnect();
      return Promise.resolve('error');
    }
    this.finishPromise = new Promise(resolve => { this.resolveFinish = resolve; });
    this.finishTimer = setTimeout(() => { this.settleFinish('timeout'); this.disconnect(); }, timeoutMs);
    try { this.ws.send(JSON.stringify({ type: 'FINISH' })); }
    catch { this.settleFinish('error'); this.disconnect(); }
    return this.finishPromise;
  }

  private settleFinish(outcome: AsrFinishOutcome): void {
    if (this.finishTimer) clearTimeout(this.finishTimer);
    this.finishTimer = undefined;
    const resolve = this.resolveFinish;
    this.resolveFinish = null;
    resolve?.(outcome);
  }

  public disconnect(): void {
    this.connected = false;
    const socket = this.ws;
    this.ws = null;
    this.settleFinish('error');
    this.rejectConnect?.(new Error('语音识别连接已关闭'));
    this.rejectConnect = null;
    try { socket?.close(); } catch { /* 释放幂等 */ }
  }

  public isConnected(): boolean { return this.connected; }
}
