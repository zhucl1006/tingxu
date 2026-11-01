import { describe, it, expect, beforeEach } from 'vitest';
import { SentenceAudioBuffer } from '../../src/audio/sentenceAudioBuffer';
import { extractSpeakerEmbeddingFromSamples } from '../../src/audio/speakerEmbeddingEngine';
import { OnlineSpeakerClusterer } from '../../src/engine/speakerClusterer';
import { useMeetingStore } from '../../src/store/useMeetingStore';

function synthesizePcm16(
  fundamentalFreqHz: number,
  formantFreqHz: number,
  durationSeconds = 2.0,
  sampleRate = 16000
): ArrayBuffer {
  const totalSamples = Math.floor(durationSeconds * sampleRate);
  const buf = new ArrayBuffer(totalSamples * 2);
  const view = new DataView(buf);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const wave =
      Math.sin(2 * Math.PI * fundamentalFreqHz * t) +
      0.5 * Math.sin(2 * Math.PI * fundamentalFreqHz * 2 * t) +
      0.25 * Math.sin(2 * Math.PI * fundamentalFreqHz * 3 * t) +
      0.4 * Math.sin(2 * Math.PI * formantFreqHz * t);
    const normalized = Math.max(-1, Math.min(1, 0.35 * wave));
    view.setInt16(i * 2, normalized < 0 ? normalized * 0x8000 : normalized * 0x7fff, true);
  }
  return buf;
}

describe('端到端 3 人单麦克风声纹区分、命名授权与跨会议自动匹配验收套件 (T11, AC-01~AC-06)', () => {
  beforeEach(() => {
    const store = useMeetingStore.getState();
    store.clearAllHistory();
    store.clearSpeakerProfiles();
    store.resetMeeting();
  });

  it('第一场会议区分 3 位说话人并授权记忆声纹 -> 第二场会议自动匹配为真实姓名，删除档案后不再匹配', async () => {
    const store = useMeetingStore.getState();

    // =========================================================================
    // 第一场会议：3 位参会人共用单麦克风交替发言
    // =========================================================================
    store.startMeeting('第一场：Q4 架构评审会');
    const ring1 = new SentenceAudioBuffer({ sampleRate: 16000, maxDurationSeconds: 60 });
    const clusterer1 = new OnlineSpeakerClusterer({ similarityThreshold: 0.68 });

    // 定义 3 位不同声学特性的说话人：
    // Speaker A (男低音 115Hz / 920Hz)
    // Speaker B (男中音 165Hz / 1550Hz)
    // Speaker C (女高音 255Hz / 2450Hz)
    const utterancesMeeting1 = [
      { f0: 115, formant: 920, text: '大家好，我们先过一下网关架构。' },
      { f0: 165, formant: 1550, text: '收到，流式 ASR 延迟已经压到 200ms。' },
      { f0: 255, formant: 2450, text: '前端双栏工作台 QA 门禁也已经全部就绪。' },
      { f0: 117, formant: 930, text: '很好，那我们确认周五正式上线。' },
      { f0: 163, formant: 1540, text: '我来负责上线前的压测脚本。' },
      { f0: 252, formant: 2430, text: '我同步更新用户手册与验收清单。' },
    ];

    for (let i = 0; i < utterancesMeeting1.length; i++) {
      const u = utterancesMeeting1[i];
      const beginMs = ring1.getTotalElapsedMs();
      const pcm = synthesizePcm16(u.f0, u.formant, 2.0, 16000);
      ring1.appendPcm16Chunk(pcm);
      const endMs = ring1.getTotalElapsedMs();

      const slice = ring1.sliceByTimeMs(beginMs, endMs);
      const emb = extractSpeakerEmbeddingFromSamples(slice, 16000);
      const assigned = clusterer1.assign({
        embedding: emb,
        durationMs: endMs - beginMs,
      });

      useMeetingStore.getState().addTranscriptSegment({
        id: `m1_seg_${i + 1}`,
        channel: 'mic',
        speaker: assigned.displayName,
        speakerId: assigned.speakerId,
        speakerConfidence: assigned.confidence,
        speakerColorIndex: assigned.colorIndex,
        timestamp: `00:00:0${(i + 1) * 2}`,
        text: u.text,
      });
    }

    // 验证 3 位不同说话人被准确聚为 spk_1, spk_2, spk_3 (句子级归属准确率 100% >= 85% AC-01)
    const m1Segs = useMeetingStore.getState().transcripts;
    expect(m1Segs).toHaveLength(6);
    expect(m1Segs[0].speakerId).toBe('spk_1');
    expect(m1Segs[1].speakerId).toBe('spk_2');
    expect(m1Segs[2].speakerId).toBe('spk_3');
    expect(m1Segs[3].speakerId).toBe('spk_1');
    expect(m1Segs[4].speakerId).toBe('spk_2');
    expect(m1Segs[5].speakerId).toBe('spk_3');

    // 用户将 spk_2 命名为 "李架构师" 并勾选授权记住声纹 (AC-02, AC-03)
    clusterer1.renameSpeaker('spk_2', '李架构师');
    useMeetingStore.getState().renameSpeaker('spk_2', '李架构师');

    const vpSpk2 = clusterer1.getClusterVoiceprint('spk_2');
    expect(vpSpk2).not.toBeNull();
    const enrolledProfile = useMeetingStore.getState().registerSpeakerProfile({
      displayName: '李架构师',
      embedding: vpSpk2!.centroid,
      sampleDurationMs: vpSpk2!.totalDurationMs,
      consented: true,
    });
    expect(enrolledProfile).not.toBeNull();
    expect(useMeetingStore.getState().transcripts[1].speaker).toBe('李架构师');
    expect(useMeetingStore.getState().transcripts[4].speaker).toBe('李架构师');
    expect(useMeetingStore.getState().transcripts[0].speaker).toBe('发言人 1');

    // =========================================================================
    // 第二场会议：李架构师再次发言，验证单句候选提示 + 连续 2 句自动匹配为“李架构师”
    // =========================================================================
    useMeetingStore.getState().startMeeting('第二场：上线前复盘会');
    const ring2 = new SentenceAudioBuffer({ sampleRate: 16000, maxDurationSeconds: 60 });
    const clusterer2 = new OnlineSpeakerClusterer({
      similarityThreshold: 0.68,
      profileMatchThreshold: 0.72,
      profileMarginThreshold: 0.06,
      requiredConsecutiveMatches: 2,
    });

    const profilesForM2 = useMeetingStore.getState().speakerProfiles.map((p) => ({
      profileId: p.profileId,
      displayName: p.displayName,
      embedding: p.embedding,
    }));

    // 第 1 句：李架构师发言 -> 单句首次命中，标记 tentativeProfileName = '李架构师'
    const m2Pcm1 = synthesizePcm16(164, 1545, 2.0, 16000);
    ring2.appendPcm16Chunk(m2Pcm1);
    const m2Emb1 = extractSpeakerEmbeddingFromSamples(ring2.sliceByTimeMs(0, 2000), 16000);
    const m2Assign1 = clusterer2.assign({
      embedding: m2Emb1,
      durationMs: 2000,
      knownProfiles: profilesForM2,
    });
    expect(m2Assign1.tentativeProfileName).toBe('李架构师');
    expect(m2Assign1.matchedProfileId).toBeNull();

    // 第 2 句：李架构师继续发言 -> 连续 2 句命中，自动确认为“李架构师” (AC-03, AC-04)
    const m2Pcm2 = synthesizePcm16(166, 1555, 2.0, 16000);
    ring2.appendPcm16Chunk(m2Pcm2);
    const m2Emb2 = extractSpeakerEmbeddingFromSamples(ring2.sliceByTimeMs(2000, 4000), 16000);
    const m2Assign2 = clusterer2.assign({
      embedding: m2Emb2,
      durationMs: 2000,
      knownProfiles: profilesForM2,
    });
    expect(m2Assign2.displayName).toBe('李架构师');
    expect(m2Assign2.matchedProfileId).toBe(enrolledProfile!.profileId);
    expect(m2Assign2.autoMatchedJustNow).toBe(true);

    // =========================================================================
    // 隐私撤回验证 (AC-05)：删除李架构师声纹档案后，后续会议不再匹配
    // =========================================================================
    useMeetingStore.getState().deleteSpeakerProfile(enrolledProfile!.profileId);
    expect(useMeetingStore.getState().speakerProfiles).toHaveLength(0);

    const clusterer3 = new OnlineSpeakerClusterer({ similarityThreshold: 0.68 });
    const m3Assign = clusterer3.assign({
      embedding: m2Emb2,
      durationMs: 2000,
      knownProfiles: useMeetingStore.getState().speakerProfiles,
    });
    expect(m3Assign.displayName).toBe('发言人 1');
    expect(m3Assign.matchedProfileId).toBeNull();
    expect(m3Assign.tentativeProfileName).toBeNull();
  });
});
