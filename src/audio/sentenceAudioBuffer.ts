/**
 * 听序（Tingxu）— 会中单调时间轴 PCM 环形缓冲与句子级音频切片器
 * 用于根据流式 ASR 返回的句子起止时间（beginTimeMs / endTimeMs）提取对应 16kHz 语音片段，
 * 供本地声纹嵌入引擎计算 192 维特征向量，全过程音频不出本机。
 */

export interface SentenceAudioBufferOptions {
  sampleRate?: number;
  maxDurationSeconds?: number;
}

export class SentenceAudioBuffer {
  private readonly sampleRate: number;
  private readonly capacitySamples: number;
  private readonly buffer: Float32Array;
  private writePos: number = 0;
  private totalSamplesWritten: number = 0;

  constructor(options?: SentenceAudioBufferOptions) {
    this.sampleRate = options?.sampleRate || 16000;
    const maxSec = options?.maxDurationSeconds || 60;
    this.capacitySamples = Math.max(this.sampleRate, Math.floor(this.sampleRate * maxSec));
    this.buffer = new Float32Array(this.capacitySamples);
  }

  /**
   * 追加 16-bit 小端 PCM 音频块（来自 RealAudioCapture）
   */
  public appendPcm16Chunk(pcmChunk: ArrayBuffer): void {
    if (!pcmChunk || pcmChunk.byteLength < 2) return;
    const sampleCount = Math.floor(pcmChunk.byteLength / 2);
    const view = new DataView(pcmChunk);

    for (let i = 0; i < sampleCount; i++) {
      const int16 = view.getInt16(i * 2, true);
      const floatSample = int16 / 32768;
      this.buffer[this.writePos] = floatSample;
      this.writePos = (this.writePos + 1) % this.capacitySamples;
    }
    this.totalSamplesWritten += sampleCount;
  }

  /**
   * 直接追加归一化 Float32 样本
   */
  public appendFloat32Samples(samples: Float32Array): void {
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.writePos] = samples[i];
      this.writePos = (this.writePos + 1) % this.capacitySamples;
    }
    this.totalSamplesWritten += samples.length;
  }

  /**
   * 当前累积写入的总毫秒数（单调递增时间轴）
   */
  public getTotalElapsedMs(): number {
    return Math.floor((this.totalSamplesWritten / this.sampleRate) * 1000);
  }

  /**
   * 按毫秒时间范围 [beginTimeMs, endTimeMs] 提取归一化 Float32 音频样本
   */
  public sliceByTimeMs(beginTimeMs: number, endTimeMs: number): Float32Array {
    if (endTimeMs <= beginTimeMs || this.totalSamplesWritten === 0) {
      return new Float32Array(0);
    }

    const earliestSampleIndex = Math.max(0, this.totalSamplesWritten - this.capacitySamples);
    const reqStartSample = Math.floor((Math.max(0, beginTimeMs) / 1000) * this.sampleRate);
    const reqEndSample = Math.floor((Math.max(0, endTimeMs) / 1000) * this.sampleRate);

    const actualStart = Math.max(earliestSampleIndex, Math.min(this.totalSamplesWritten, reqStartSample));
    const actualEnd = Math.max(actualStart, Math.min(this.totalSamplesWritten, reqEndSample));
    const length = actualEnd - actualStart;

    if (length <= 0) {
      return new Float32Array(0);
    }

    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const absIndex = actualStart + i;
      const ringIndex = absIndex % this.capacitySamples;
      out[i] = this.buffer[ringIndex];
    }
    return out;
  }

  /**
   * 获取最近 durationMs 毫秒的音频样本（当上游未提供精确时间戳时的回退切片）
   */
  public getRecentSamples(durationMs: number): Float32Array {
    const endMs = this.getTotalElapsedMs();
    const startMs = Math.max(0, endMs - Math.max(0, durationMs));
    return this.sliceByTimeMs(startMs, endMs);
  }

  /**
   * 清空环形缓冲区并重置时间轴
   */
  public clear(): void {
    this.buffer.fill(0);
    this.writePos = 0;
    this.totalSamplesWritten = 0;
  }
}
