import { describe, it, expect } from 'vitest';
import { StatefulAudioResampler, downsampleTo16kHz } from '../realAudioCapture';

describe('音频质量与连续重采样抗混叠测试 (TDD: Audio Quality & Anti-Glitch)', () => {
  it('StatefulAudioResampler 连续跨 chunk 处理时应保持时间相位平滑，杜绝边界跳变与丢点', () => {
    const fromRate = 48000;
    const toRate = 16000;
    const chunkSize = 4096;
    const totalChunks = 5;
    const freq = 440; // 440Hz 标准音

    const resampler = new StatefulAudioResampler(fromRate, toRate);
    const outputChunks: Float32Array[] = [];

    for (let c = 0; c < totalChunks; c++) {
      const chunk = new Float32Array(chunkSize);
      for (let i = 0; i < chunkSize; i++) {
        const t = (c * chunkSize + i) / fromRate;
        chunk[i] = Math.sin(2 * Math.PI * freq * t);
      }
      outputChunks.push(resampler.process(chunk));
    }

    // 验证总输出样本数符合理论期望 (5 * 4096 / 3 = 6826.67 => 6826 或 6827 样点)
    const totalOutSamples = outputChunks.reduce((acc, ch) => acc + ch.length, 0);
    const expectedSamples = Math.round((totalChunks * chunkSize * toRate) / fromRate);
    expect(Math.abs(totalOutSamples - expectedSamples)).toBeLessThanOrEqual(1);

    // 验证每一个 chunk 边界处的波形连续性（跨块首尾差分必须小于理论最大步长）
    // 在 16000Hz 下，440Hz 正弦波相邻样点的最大理论差分约为: 2 * sin(pi * 440 / 16000) ≈ 0.172
    const maxAllowedStep = 0.20;
    for (let c = 0; c < totalChunks - 1; c++) {
      const currentChunk = outputChunks[c];
      const nextChunk = outputChunks[c + 1];
      const lastSample = currentChunk[currentChunk.length - 1];
      const firstSample = nextChunk[0];

      const boundaryDiff = Math.abs(firstSample - lastSample);
      expect(boundaryDiff).toBeLessThan(maxAllowedStep);
      // 绝不出现掉入 0 的坏点
      expect(Math.abs(lastSample)).toBeGreaterThan(0.001);
      expect(Math.abs(firstSample)).toBeGreaterThan(0.001);
    }
  });

  it('StatefulAudioResampler 在 44100Hz（非整倍数降采样）时也应保证无跳变与无累积时钟漂移', () => {
    const fromRate = 44100;
    const toRate = 16000;
    const chunkSize = 4096;
    const totalChunks = 6;
    const freq = 300;

    const resampler = new StatefulAudioResampler(fromRate, toRate);
    let totalOut = 0;

    for (let c = 0; c < totalChunks; c++) {
      const chunk = new Float32Array(chunkSize);
      for (let i = 0; i < chunkSize; i++) {
        chunk[i] = Math.sin(2 * Math.PI * freq * ((c * chunkSize + i) / fromRate));
      }
      const out = resampler.process(chunk);
      totalOut += out.length;
    }

    const expectedTotal = Math.round((totalChunks * chunkSize * toRate) / fromRate);
    expect(Math.abs(totalOut - expectedTotal)).toBeLessThanOrEqual(2);
  });

  it('单次与状态重采样对比：downsampleTo16kHz 快捷导出与 StatefulAudioResampler 全程平滑无坏点', () => {
    const resampler = new StatefulAudioResampler(48000, 16000);
    const chunk = new Float32Array(4096);
    chunk.fill(0.8); // 恒定幅值

    const outStateful = resampler.process(chunk);
    const outDirect = downsampleTo16kHz(chunk, 48000);

    expect(outDirect.length).toBe(outStateful.length);
    for (let i = 0; i < outStateful.length; i++) {
      expect(outStateful[i]).toBeCloseTo(0.8, 3);
      expect(outDirect[i]).toBeCloseTo(0.8, 3);
    }
  });
});
