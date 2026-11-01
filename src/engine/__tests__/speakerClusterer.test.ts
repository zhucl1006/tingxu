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

  it('支持跨会议本地声纹库比对：单句首次命中标记为待确认候选（可能是 X），连续 2 句命中后自动确认为真实姓名 (T10)', () => {
    const clusterer = new OnlineSpeakerClusterer({
      similarityThreshold: 0.65,
      profileMatchThreshold: 0.72,
      profileMarginThreshold: 0.06,
      requiredConsecutiveMatches: 2,
    });

    const knownProfiles = [
      {
        profileId: 'vp_zhang',
        displayName: '张总',
        embedding: makeBasisEmbedding(15, 0.01),
      },
      {
        profileId: 'vp_wang',
        displayName: '王总监',
        embedding: makeBasisEmbedding(110, 0.01),
      },
    ];

    // 1. 新会议第 1 句：命中张总声纹（top1 > 0.72, margin > 0.06），但仅第 1 句 -> 保持 "发言人 1" 并输出 tentativeProfileName = "张总"
    const s1 = clusterer.assign({
      embedding: makeBasisEmbedding(15, 0.03),
      durationMs: 2200,
      knownProfiles,
    });
    expect(s1.speakerId).toBe('spk_1');
    expect(s1.displayName).toBe('发言人 1');
    expect(s1.tentativeProfileId).toBe('vp_zhang');
    expect(s1.tentativeProfileName).toBe('张总');
    expect(s1.matchedProfileId).toBeNull();

    // 2. 同一说话人连续第 2 句再次命中张总声纹 -> 自动升级确认为 "张总"！
    const s2 = clusterer.assign({
      embedding: makeBasisEmbedding(15, 0.04),
      durationMs: 2400,
      knownProfiles,
    });
    expect(s2.speakerId).toBe('spk_1');
    expect(s2.displayName).toBe('张总');
    expect(s2.matchedProfileId).toBe('vp_zhang');
    expect(s2.tentativeProfileId).toBeNull();
    expect(s2.autoMatchedJustNow).toBe(true);
  });

  it('当用户手动拒绝声纹候选（rejectProfileMatch）后，后续同声纹句子不再自动匹配该档案 (T10)', () => {
    const clusterer = new OnlineSpeakerClusterer({
      similarityThreshold: 0.65,
      profileMatchThreshold: 0.72,
      profileMarginThreshold: 0.06,
      requiredConsecutiveMatches: 2,
    });

    const knownProfiles = [
      {
        profileId: 'vp_li',
        displayName: '李工',
        embedding: makeBasisEmbedding(30, 0.01),
      },
    ];

    // 第 1 句产生候选提示
    const s1 = clusterer.assign({
      embedding: makeBasisEmbedding(30, 0.02),
      durationMs: 2000,
      knownProfiles,
    });
    expect(s1.tentativeProfileId).toBe('vp_li');

    // 用户点击“不是李工”
    clusterer.rejectProfileMatch('spk_1', 'vp_li');

    // 第 2 句即便声纹接近，也绝不自动改成李工
    const s2 = clusterer.assign({
      embedding: makeBasisEmbedding(30, 0.02),
      durationMs: 2100,
      knownProfiles,
    });
    expect(s2.displayName).toBe('发言人 1');
    expect(s2.matchedProfileId).toBeNull();
    expect(s2.tentativeProfileId).toBeNull();
  });
});
