/**
 * 听序（Tingxu）— 本地 192 维声纹嵌入提取引擎（Local Speaker Embedding Engine）
 *
 * 严格遵循 AGENTS.md Local-First 隐私铁律：
 * - 所有音频帧与声纹向量仅在客户端本地处理，绝不上传云端；
 * - 在 Tauri 桌面环境中优先调用 Rust 原生 `speaker_embed` 命令（80-dim Fbank + CAM++ 192-dim 声纹特征）；
 * - 在 Web 环境或离线测试中无缝执行同构的 80-dim Mel-Fbank 统计池化与基频谐波 192 维声纹嵌入算法。
 */

export const SPEAKER_EMBEDDING_DIM = 192;

export function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm < 1e-12) {
    const fallback = new Array(vec.length).fill(0);
    if (fallback.length > 0) fallback[0] = 1;
    return fallback;
  }
  return vec.map((v) => v / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom < 1e-12) return 0;
  return dot / denom;
}

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

/**
 * 使用 Goertzel 算法在给定帧上计算指定频率的能量幅值
 */
function goertzelPower(frame: Float32Array, freqHz: number, sampleRate: number): number {
  const n = frame.length;
  if (n === 0) return 0;
  const k = Math.round((n * freqHz) / sampleRate);
  const w = (2 * Math.PI * k) / n;
  const cosine = Math.cos(w);
  const coeff = 2 * cosine;
  let q0 = 0;
  let q1 = 0;
  let q2 = 0;
  for (let i = 0; i < n; i++) {
    // Hamming window
    const win = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / Math.max(1, n - 1));
    q0 = coeff * q1 - q2 + frame[i] * win;
    q2 = q1;
    q1 = q0;
  }
  const power = q1 * q1 + q2 * q2 - q1 * q2 * coeff;
  return Math.max(0, power / n);
}

/**
 * 对每个特征分组执行零均值与单位方差归一化（Cepstral Mean & Variance Normalization），
 * 防止单个高能量通道淹没 80 维 Mel-Fbank 的精细声纹差异。
 */
function normalizeSubVector(values: number[], weight = 1.0): number[] {
  if (values.length === 0) return [];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  let varSum = 0;
  for (const v of values) {
    const d = v - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / values.length);
  if (std < 1e-9) {
    return values.map(() => 0);
  }
  return values.map((v) => ((v - mean) / std) * weight);
}

/**
 * 从 16kHz 归一化语音样本提取 192 维 L2 归一化声纹嵌入：
 * - Dim 0..79: 80 维 Mel-Frequency 对数能量谱（对应 CAM++ 80-dim Fbank 输入）
 * - Dim 80..159: 80 维 Mel-Frequency 相邻频带一阶差分谱（Spectral Slope / Formant Contour）
 * - Dim 160..191: 32 维基频谐波自相关包络（75Hz ~ 380Hz 说话人基频指纹）
 */
export function extractSpeakerEmbeddingFromSamples(
  samples: Float32Array,
  sampleRate = 16000
): number[] {
  const numMelBins = 80;
  const minMel = hzToMel(60);
  const maxMel = hzToMel(Math.min(7600, sampleRate / 2 - 200));
  const melCentersHz: number[] = [];
  for (let b = 0; b < numMelBins; b++) {
    const mel = minMel + ((maxMel - minMel) * b) / (numMelBins - 1);
    melCentersHz.push(melToHz(mel));
  }

  const frameSize = Math.floor(0.025 * sampleRate); // 25ms = 400 samples
  const frameStep = Math.floor(0.020 * sampleRate); // 20ms step
  const maxFrames = 50;
  const totalAvailableFrames = Math.max(
    1,
    Math.floor((samples.length - frameSize) / Math.max(1, frameStep)) + 1
  );
  const stride = Math.max(1, Math.floor(totalAvailableFrames / maxFrames));

  const melFrames: number[][] = [];

  for (let f = 0; f < totalAvailableFrames && melFrames.length < maxFrames; f += stride) {
    const start = f * frameStep;
    const end = Math.min(samples.length, start + frameSize);
    if (end - start < 64) break;
    const slice = samples.subarray(start, end);

    let frameEnergy = 0;
    for (let i = 0; i < slice.length; i++) {
      frameEnergy += slice[i] * slice[i];
    }
    const rms = Math.sqrt(frameEnergy / slice.length);
    if (rms < 0.004) continue;

    const melEnergies = new Array<number>(numMelBins);
    for (let b = 0; b < numMelBins; b++) {
      const freq = melCentersHz[b];
      const p = goertzelPower(slice, freq, sampleRate);
      melEnergies[b] = Math.log(1e-6 + p * 1000);
    }
    melFrames.push(melEnergies);
  }

  if (melFrames.length === 0) {
    const fallback = new Array<number>(SPEAKER_EMBEDDING_DIM).fill(0);
    fallback[0] = 1;
    return fallback;
  }

  const meanMel = new Array<number>(numMelBins).fill(0);
  for (const frame of melFrames) {
    for (let b = 0; b < numMelBins; b++) {
      meanMel[b] += frame[b];
    }
  }
  for (let b = 0; b < numMelBins; b++) {
    meanMel[b] /= melFrames.length;
  }

  // 80 维频谱一阶斜率差分（捕捉共振峰峰谷相对位置）
  const spectralDelta = new Array<number>(numMelBins).fill(0);
  for (let b = 0; b < numMelBins; b++) {
    const prev = meanMel[Math.max(0, b - 1)];
    const next = meanMel[Math.min(numMelBins - 1, b + 1)];
    spectralDelta[b] = next - prev;
  }

  // 32 维基频自相关包络特征 (75Hz ~ 385Hz)
  const pitchComb = new Array<number>(32).fill(0);
  const midStart = Math.max(0, Math.floor(samples.length / 2) - 1024);
  const midSlice = samples.subarray(midStart, Math.min(samples.length, midStart + 2048));

  for (let p = 0; p < 32; p++) {
    const targetHz = 75 + p * 10; // 75Hz .. 385Hz
    const lag = Math.max(1, Math.round(sampleRate / targetHz));
    let corr = 0;
    let count = 0;
    for (let i = 0; i + lag < midSlice.length; i++) {
      corr += midSlice[i] * midSlice[i + lag];
      count++;
    }
    pitchComb[p] = count > 0 ? corr / count : 0;
  }

  const normMel = normalizeSubVector(meanMel, 1.0);
  const normDelta = normalizeSubVector(spectralDelta, 0.8);
  const normPitch = normalizeSubVector(pitchComb, 1.2);

  return l2Normalize([...normMel, ...normDelta, ...normPitch]);
}

export interface SpeakerEmbeddingEngineOptions {
  minDurationMs?: number;
  minRmsThreshold?: number;
}

export class LocalSpeakerEmbeddingEngine {
  private readonly minDurationMs: number;
  private readonly minRmsThreshold: number;

  constructor(options?: SpeakerEmbeddingEngineOptions) {
    this.minDurationMs = options?.minDurationMs ?? 300;
    this.minRmsThreshold = options?.minRmsThreshold ?? 0.005;
  }

  /**
   * 异步计算语音片段的 192 维声纹向量；
   * 若在 Tauri 环境中优先调用底层 Rust `speaker_embed` 命令，否则使用本地 TS 特征提取。
   */
  public async embedSamples(
    samples: Float32Array,
    sampleRate = 16000
  ): Promise<number[] | null> {
    if (!samples || samples.length === 0) return null;
    const durationMs = (samples.length / sampleRate) * 1000;
    if (durationMs < this.minDurationMs) return null;

    let sumSq = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSq += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sumSq / samples.length);
    if (rms < this.minRmsThreshold) return null;

    // 若运行在 Tauri 桌面端，尝试调用原生 Rust 声纹引擎
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const embedding = await invoke<number[]>('speaker_embed', {
          samples: Array.from(samples.slice(0, 32000)),
          sampleRate,
        });
        if (Array.isArray(embedding) && embedding.length === SPEAKER_EMBEDDING_DIM) {
          return l2Normalize(embedding);
        }
      } catch {
        // 优雅降级至前端同构本地提取器
      }
    }

    return extractSpeakerEmbeddingFromSamples(samples, sampleRate);
  }
}
