import { TranscriptSegment } from '../types/meeting';

export interface SlidingWindowConfig {
  minCharsThreshold: number; // 默认 300 字
  maxSilenceSeconds: number; // 默认 45 秒
}

export interface WindowPayload {
  segments: TranscriptSegment[];
  combinedText: string;
  endTimestampSeconds: number;
}

export class SlidingWindowAccumulator {
  private buffer: TranscriptSegment[] = [];
  private lastTriggerSeconds: number = 0;
  private config: SlidingWindowConfig;

  constructor(config: Partial<SlidingWindowConfig> = {}) {
    this.config = {
      minCharsThreshold: config.minCharsThreshold ?? 300,
      maxSilenceSeconds: config.maxSilenceSeconds ?? 45,
    };
  }

  public getPendingCharCount(): number {
    return this.buffer.reduce((acc, s) => acc + s.text.length, 0);
  }

  public appendSegment(
    segment: TranscriptSegment,
    currentMeetingSeconds: number
  ): WindowPayload | null {
    this.buffer.push(segment);

    const totalChars = this.getPendingCharCount();
    const silenceDuration = currentMeetingSeconds - this.lastTriggerSeconds;

    const charTriggered = totalChars >= this.config.minCharsThreshold;
    const silenceTriggered =
      totalChars > 30 && silenceDuration >= this.config.maxSilenceSeconds;

    if (charTriggered || silenceTriggered) {
      const combinedText = this.buffer
        .map((s) => `${s.speaker}: ${s.text}`)
        .join('\n');

      const payload: WindowPayload = {
        segments: [...this.buffer],
        combinedText,
        endTimestampSeconds: currentMeetingSeconds,
      };

      // 若有多段发言，保留末尾最后 1 个片段作为重叠上下文；若单段已超阈值，则全量刷盘清空
      const overlap = this.buffer.length > 1 ? this.buffer.slice(-1) : [];
      this.buffer = overlap;
      this.lastTriggerSeconds = currentMeetingSeconds;

      return payload;
    }

    return null;
  }

  /**
   * 周期性时间窗口或静音兜底触发：主动刷出当前缓冲区中的待处理发言
   * @param currentMeetingSeconds 会议当前秒数
   * @param minChars 触发刷盘的最小字符数（默认 20 字）
   */
  public flush(
    currentMeetingSeconds: number,
    minChars: number = 20
  ): WindowPayload | null {
    const totalChars = this.getPendingCharCount();
    if (this.buffer.length === 0 || totalChars < minChars) {
      return null;
    }

    const combinedText = this.buffer
      .map((s) => `${s.speaker}: ${s.text}`)
      .join('\n');

    const payload: WindowPayload = {
      segments: [...this.buffer],
      combinedText,
      endTimestampSeconds: currentMeetingSeconds,
    };

    const overlap = this.buffer.length > 1 ? this.buffer.slice(-1) : [];
    this.buffer = overlap;
    this.lastTriggerSeconds = currentMeetingSeconds;

    return payload;
  }

  public clear(): void {
    this.buffer = [];
    this.lastTriggerSeconds = 0;
  }
}
