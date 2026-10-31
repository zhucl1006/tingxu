/**
 * 听序（Tingxu）— 流式 ASR WebSocket 双向推流客户端
 */

export interface FinalSentence {
  text: string;
  speaker?: string;
  timestamp: string;
}

export interface RealStreamingAsrClientOptions {
  wsUrl?: string;
  onInterimText?: (text: string) => void;
  onFinalSentence?: (sentence: FinalSentence) => void;
  onError?: (err: Error) => void;
}

export class RealStreamingAsrClient {
  private wsUrl: string;
  private ws: WebSocket | null = null;
  private connected: boolean = false;
  private options: RealStreamingAsrClientOptions;

  constructor(options?: RealStreamingAsrClientOptions) {
    this.options = options || {};
    this.wsUrl = options?.wsUrl || 'ws://localhost:3201/gateway/v1/asr/stream';
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
          this.connected = true;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) : null;
            if (!data) return;

            if (data.type === 'INTERIM' && this.options.onInterimText) {
              this.options.onInterimText(data.text || '');
            } else if (data.type === 'FINAL' && this.options.onFinalSentence && data.sentence) {
              this.options.onFinalSentence(data.sentence);
            }
          } catch (e) {
            console.warn('[RealStreamingAsrClient] Parse message error:', e);
          }
        };

        this.ws.onerror = (err) => {
          this.connected = false;
          if (this.options.onError) {
            this.options.onError(new Error('WebSocket connection error'));
          }
          reject(err);
        };

        this.ws.onclose = () => {
          this.connected = false;
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  public sendPcmChunk(pcmData: ArrayBuffer): void {
    if (!this.connected || !this.ws) {
      return;
    }
    const isOpen = this.ws.readyState === 1 || (typeof WebSocket !== 'undefined' && this.ws.readyState === WebSocket.OPEN);
    if (!isOpen) {
      return;
    }
    this.ws.send(pcmData);
  }

  public disconnect(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.connected = false;
  }

  public isConnected(): boolean {
    return this.connected;
  }
}
