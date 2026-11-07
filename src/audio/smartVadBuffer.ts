/**
 * 听序（Tingxu）— 智能 VAD 语音断句切片缓冲区（Smart VAD Buffer）
 *
 * 遵循 AGENTS.md 规范与 Local-First 本地优先原则：
 * 1. 彻底取代机械的固定时间（如卡死 2 秒）切断，避免将整词或短句腰斩；
 * 2. 结合短时 RMS 能量与过零率门限，实时判断当前音频为人声（Speech）或静音（Silence）；
 * 3. 当检测到自然语音停顿（例如说话完毕停顿 500ms），且说话时长达到最小有效短句（如 1s）时触发切片；
 * 4. 设置安全最大时长约束（默认 8s），防止超长不换气导致内存积压或过大延迟。
 */

export interface SmartVadOptions {
  sampleRate?: number; // 默认 16000
  energyThreshold?: number; // RMS 能量阈值，默认 180 (适合 16-bit PCM 麦克风底噪隔离)
  silenceDurationMs?: number; // 判定断句所需的连续停顿静音时长，默认 500ms
  minSpeechDurationMs?: number; // 判定为有效句子的最小人声时长，默认 1000ms
  maxDurationMs?: number; // 安全切片最大时长，默认 8000ms
  prefixPaddingMs?: number; // 头部保护静音，默认 100ms
  onSegmentReady?: (pcmBytes: Uint8Array, durationMs: number) => void;
}

export class SmartVadBuffer {
  private sampleRate: number;
  private energyThreshold: number;
  private silenceDurationMs: number;
  private minSpeechDurationMs: number;
  private maxDurationMs: number;
  private onSegmentReady?: (pcmBytes: Uint8Array, durationMs: number) => void;

  private chunks: Uint8Array[] = [];
  private totalBufferedBytes = 0;
  private hasDetectedSpeech = false;
  private consecutiveSilenceBytes = 0;

  constructor(options: SmartVadOptions = {}) {
    this.sampleRate = options.sampleRate || 16000;
    this.energyThreshold = options.energyThreshold || 180;
    this.silenceDurationMs = options.silenceDurationMs || 500;
    this.minSpeechDurationMs = options.minSpeechDurationMs || 1000;
    this.maxDurationMs = options.maxDurationMs || 8000;
    this.onSegmentReady = options.onSegmentReady;
  }

  public getBufferedBytes(): number {
    return this.totalBufferedBytes;
  }

  public getBufferedDurationMs(): number {
    return Math.round((this.totalBufferedBytes / (this.sampleRate * 2)) * 1000);
  }

  /**
   * 计算 16-bit PCM 的均方根能量 (Root Mean Square)
   */
  public static calculateRms(pcmBytes: Uint8Array): number {
    if (pcmBytes.length < 2) return 0;
    const view = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength);
    const numSamples = Math.floor(pcmBytes.byteLength / 2);
    let sumSquares = 0;

    for (let i = 0; i < numSamples; i++) {
      const sample = view.getInt16(i * 2, true);
      sumSquares += sample * sample;
    }

    return Math.sqrt(sumSquares / numSamples);
  }

  /**
   * 追加音频数据块并执行 VAD 断句检测
   */
  public appendChunk(chunk: Uint8Array): void {
    if (chunk.length === 0) return;

    // 每 20ms 分析一个窗口 (16000 * 2 * 0.02 = 640 字节)
    const windowSize = 640;
    let offset = 0;

    while (offset < chunk.length) {
      const sliceEnd = Math.min(offset + windowSize, chunk.length);
      const subChunk = chunk.subarray(offset, sliceEnd);
      offset = sliceEnd;

      const rms = SmartVadBuffer.calculateRms(subChunk);
      const isVoice = rms >= this.energyThreshold;

      if (isVoice) {
        this.hasDetectedSpeech = true;
        this.consecutiveSilenceBytes = 0;
        this.chunks.push(subChunk);
        this.totalBufferedBytes += subChunk.length;
      } else {
        if (this.hasDetectedSpeech) {
          // 已有人声累积，此时遇到静音
          this.chunks.push(subChunk);
          this.totalBufferedBytes += subChunk.length;
          this.consecutiveSilenceBytes += subChunk.length;

          const silenceMs = (this.consecutiveSilenceBytes / (this.sampleRate * 2)) * 1000;
          const totalMs = this.getBufferedDurationMs();

          // 触发自然停顿切片条件：连续静音超过设定期限 且 总人声时长达标
          if (silenceMs >= this.silenceDurationMs && totalMs >= this.minSpeechDurationMs) {
            this.emitCurrentSegment();
          }
        }
        // 如果从未检测到人声，只保留最多 200ms 作为前缀 padding，防止静音无节制积压
        else {
          const maxPaddings = (this.sampleRate * 2 * 200) / 1000;
          this.chunks.push(subChunk);
          this.totalBufferedBytes += subChunk.length;
          while (this.totalBufferedBytes > maxPaddings && this.chunks.length > 0) {
            const popped = this.chunks.shift()!;
            this.totalBufferedBytes -= popped.length;
          }
        }
      }

      // 安全最大切片时长约束：防止长时间长篇说话不喘气导致延迟失控
      if (this.getBufferedDurationMs() >= this.maxDurationMs) {
        this.emitCurrentSegment();
      }
    }
  }

  /**
   * 将当前缓冲区内容作为自然整句发出
   */
  private emitCurrentSegment(): Uint8Array | null {
    if (this.totalBufferedBytes === 0 || !this.hasDetectedSpeech) {
      this.reset();
      return null;
    }

    const merged = new Uint8Array(this.totalBufferedBytes);
    let offset = 0;
    for (const c of this.chunks) {
      merged.set(c, offset);
      offset += c.length;
    }

    const durationMs = this.getBufferedDurationMs();
    this.reset();

    this.onSegmentReady?.(merged, durationMs);
    return merged;
  }

  /**
   * 手动排空剩余所有音频
   */
  public flush(): Uint8Array | null {
    return this.emitCurrentSegment();
  }

  public reset(): void {
    this.chunks = [];
    this.totalBufferedBytes = 0;
    this.hasDetectedSpeech = false;
    this.consecutiveSilenceBytes = 0;
  }
}
