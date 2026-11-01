import { describe, it, expect } from 'vitest';
import { OnlineSpeakerClusterer } from '../speakerClusterer';
import { l2Normalize } from '../../audio/speakerEmbeddingEngine';

function makeBasisEmbedding(primaryIndex: number, noise = 0.02): number[] {
  const vec = new Array<number>(192).fill(0);
  vec[primaryIndex] = 1.0;
  vec[(primaryIndex + 1) % 192] = noise;
  return l2Normalize(vec);
}

describe('OnlineSpeakerClusterer 会内在线声纹聚类测试 (T06)', () => {
  it('应能将不同声纹向量自动聚类为 发言人 1、发言人 2、发言人 3，且同一人后续发言归入同一 speakerId', () => {
    const clusterer = new OnlineSpeakerClusterer({ similarityThreshold: 0.65 });

    // 第 1 位发言人 (spk_1)
    const r1 = clusterer.assign({
      embedding: makeBasisEmbedding(0, 0.01),
      durationMs: 2400,
    });
    expect(r1.speakerId).toBe('spk_1');
    expect(r1.displayName).toBe('发言人 1');
    expect(r1.colorIndex).toBe(0);
    expect(r1.isNewSpeaker).toBe(true);

    // 第 2 位发言人 (spk_2)
    const r2 = clusterer.assign({
      embedding: makeBasisEmbedding(40, 0.02),
      durationMs: 2000,
    });
    expect(r2.speakerId).toBe('spk_2');
    expect(r2.displayName).toBe('发言人 2');
    expect(r2.colorIndex).toBe(1);
    expect(r2.isNewSpeaker).toBe(true);

    // 第 1 位发言人再次发言 -> 应归入 spk_1
    const r3 = clusterer.assign({
      embedding: makeBasisEmbedding(0, 0.05),
      durationMs: 1800,
    });
    expect(r3.speakerId).toBe('spk_1');
    expect(r3.displayName).toBe('发言人 1');
    expect(r3.isNewSpeaker).toBe(false);
    expect(r3.confidence).toBeGreaterThan(0.95);

    // 第 3 位发言人 (spk_3)
    const r4 = clusterer.assign({
      embedding: makeBasisEmbedding(90, 0.01),
      durationMs: 2200,
    });
    expect(r4.speakerId).toBe('spk_3');
    expect(r4.displayName).toBe('发言人 3');
    expect(r4.colorIndex).toBe(2);
    expect(r4.isNewSpeaker).toBe(true);

    expect(clusterer.getSpeakers()).toHaveLength(3);
  });

  it('当句子过短 (< 1.2s) 或无有效 embedding 时，应继承上一位说话人而不错误新建聚类', () => {
    const clusterer = new OnlineSpeakerClusterer({
      similarityThreshold: 0.65,
      minClusterDurationMs: 1200,
    });

    // 先由 spk_1 正常发言
    const first = clusterer.assign({
      embedding: makeBasisEmbedding(10, 0.01),
      durationMs: 2500,
    });
    expect(first.speakerId).toBe('spk_1');

    // 紧接着一句极短应答 ("好的" 600ms)，即使声纹有波动也继承上一位说话人
    const shortReply = clusterer.assign({
      embedding: makeBasisEmbedding(70, 0.01),
      durationMs: 600,
    });
    expect(shortReply.speakerId).toBe('spk_1');
    expect(shortReply.isNewSpeaker).toBe(false);
    expect(clusterer.getSpeakers()).toHaveLength(1);
  });

  it('重命名说话人后，后续再次命中该说话人聚类时应直接返回更新后的真实姓名', () => {
    const clusterer = new OnlineSpeakerClusterer({ similarityThreshold: 0.65 });

    clusterer.assign({
      embedding: makeBasisEmbedding(5, 0.01),
      durationMs: 2000,
    });
    clusterer.assign({
      embedding: makeBasisEmbedding(55, 0.01),
      durationMs: 2000,
    });

    // 用户将 spk_2 重命名为 "李架构师"
    clusterer.renameSpeaker('spk_2', '李架构师');

    // spk_2 再次发言
    const next = clusterer.assign({
      embedding: makeBasisEmbedding(55, 0.04),
      durationMs: 2100,
    });
    expect(next.speakerId).toBe('spk_2');
    expect(next.displayName).toBe('李架构师');
  });

  it('当上游 ASR 已显式提供 upstreamSpeakerId 时应优先绑定并维护对应说话人条目', () => {
    const clusterer = new OnlineSpeakerClusterer();
    const res1 = clusterer.assign({
      upstreamSpeakerId: 'spk_2',
      embedding: null,
      durationMs: 1500,
    });
    expect(res1.speakerId).toBe('spk_2');
    expect(res1.displayName).toBe('发言人 2');
  });
});
