import { describe, it, expect } from 'vitest';
import { SentenceAudioBuffer } from '../sentenceAudioBuffer';

function makeInt16Pcm(samples: number[]): ArrayBuffer {
  const buf = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(i * 2, samples[i], true);
  }
  return buf;
}

describe('SentenceAudioBuffer 音频环形切片缓冲测试 (T04)', () => {
  it('应能追加 16kHz 16-bit PCM 分片并按毫秒时间轴精准切片', () => {
    const ring = new SentenceAudioBuffer({ sampleRate: 16000, maxDurationSeconds: 10 });

    // 追加 2 秒音频 (32000 样本)，前 1 秒值为 1000，后 1 秒值为 -2000
    const sec1 = new Array(16000).fill(1000);
    const sec2 = new Array(16000).fill(-2000);
    ring.appendPcm16Chunk(makeInt16Pcm(sec1));
    ring.appendPcm16Chunk(makeInt16Pcm(sec2));

    expect(ring.getTotalElapsedMs()).toBe(2000);

    // 切取 500ms ~ 1500ms (共 1 秒 = 16000 样本)
    const slice = ring.sliceByTimeMs(500, 1500);
    expect(slice.length).toBe(16000);
    // 前半段接近 1000 / 32768，后半段接近 -2000 / 32768
    expect(slice[0]).toBeCloseTo(1000 / 32768, 3);
    expect(slice[15999]).toBeCloseTo(-2000 / 32768, 3);
  });

  it('当音频超过环形缓冲最大容量时，应自动覆盖最老数据并保持单调时间轴切片不越界', () => {
    const ring = new SentenceAudioBuffer({ sampleRate: 16000, maxDurationSeconds: 2 });

    // 连续写入 3 秒，容量只有 2 秒 (保留 1000ms ~ 3000ms)
    for (let s = 1; s <= 3; s++) {
      ring.appendPcm16Chunk(makeInt16Pcm(new Array(16000).fill(s * 1000)));
    }

    expect(ring.getTotalElapsedMs()).toBe(3000);

    // 请求 0ms ~ 2000ms，其中 0~1000ms 已被覆盖，应安全返回可用的 1000ms~2000ms
    const slice = ring.sliceByTimeMs(0, 2000);
    expect(slice.length).toBe(16000);
    expect(slice[0]).toBeCloseTo(2000 / 32768, 3);

    // 请求最近 1 秒 (getRecentSamples)
    const recent = ring.getRecentSamples(1000);
    expect(recent.length).toBe(16000);
    expect(recent[0]).toBeCloseTo(3000 / 32768, 3);
  });

  it('clear() 后应重置时间轴与缓冲区', () => {
    const ring = new SentenceAudioBuffer({ sampleRate: 16000, maxDurationSeconds: 5 });
    ring.appendPcm16Chunk(makeInt16Pcm(new Array(8000).fill(500)));
    expect(ring.getTotalElapsedMs()).toBe(500);

    ring.clear();
    expect(ring.getTotalElapsedMs()).toBe(0);
    expect(ring.getRecentSamples(500).length).toBe(0);
  });
});
