import { describe, it, expect } from 'vitest';
import {
  extractSpeakerEmbeddingFromSamples,
  cosineSimilarity,
  LocalSpeakerEmbeddingEngine,
} from '../speakerEmbeddingEngine';

function synthesizeVoiceSamples(
  fundamentalFreqHz: number,
  formantFreqHz: number,
  durationSeconds = 1.6,
  sampleRate = 16000
): Float32Array {
  const totalSamples = Math.floor(durationSeconds * sampleRate);
  const out = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const f0 = Math.sin(2 * Math.PI * fundamentalFreqHz * t);
    const h2 = 0.5 * Math.sin(2 * Math.PI * fundamentalFreqHz * 2 * t);
    const h3 = 0.25 * Math.sin(2 * Math.PI * fundamentalFreqHz * 3 * t);
    const formant = 0.4 * Math.sin(2 * Math.PI * formantFreqHz * t);
    out[i] = 0.35 * (f0 + h2 + h3 + formant);
  }
  return out;
}

describe('LocalSpeakerEmbeddingEngine 192 维声纹特征提取测试 (T05)', () => {
  it('应输出标准 192 维且经过 L2 归一化的声纹嵌入向量', () => {
    const samples = synthesizeVoiceSamples(135, 1100, 1.5);
    const embedding = extractSpeakerEmbeddingFromSamples(samples, 16000);

    expect(embedding).toHaveLength(192);
    const normSq = embedding.reduce((acc, v) => acc + v * v, 0);
    expect(Math.sqrt(normSq)).toBeCloseTo(1.0, 3);
  });

  it('相同声学特征的语音片段余弦相似度应显著高于不同声学特征的说话人', () => {
    // 说话人 A（男低音特征：基频 120Hz，共振峰 950Hz）两段不同长度采样
    const spkA1 = extractSpeakerEmbeddingFromSamples(synthesizeVoiceSamples(120, 950, 1.5), 16000);
    const spkA2 = extractSpeakerEmbeddingFromSamples(synthesizeVoiceSamples(122, 960, 1.8), 16000);

    // 说话人 B（女高音特征：基频 245Hz，共振峰 2350Hz）
    const spkB1 = extractSpeakerEmbeddingFromSamples(synthesizeVoiceSamples(245, 2350, 1.6), 16000);

    const simSameSpeaker = cosineSimilarity(spkA1, spkA2);
    const simDiffSpeaker = cosineSimilarity(spkA1, spkB1);

    expect(simSameSpeaker).toBeGreaterThan(0.88);
    expect(simDiffSpeaker).toBeLessThan(0.65);
    expect(simSameSpeaker - simDiffSpeaker).toBeGreaterThan(0.25);
  });

  it('静音或过短样本应返回 null 以避免污染说话人聚类质心', async () => {
    const engine = new LocalSpeakerEmbeddingEngine();
    const silence = new Float32Array(16000); // 全 0 静音
    const resultSilence = await engine.embedSamples(silence, 16000);
    expect(resultSilence).toBeNull();

    const tooShort = synthesizeVoiceSamples(150, 1200, 0.15); // 仅 150ms
    const resultShort = await engine.embedSamples(tooShort, 16000);
    expect(resultShort).toBeNull();
  });
});
