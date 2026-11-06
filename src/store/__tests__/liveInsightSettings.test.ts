import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMeetingStore } from '../useMeetingStore';
import { resetMeetingRepository } from '../../storage/meetingRepository';
import { DEFAULT_LIVE_INSIGHT_SETTINGS } from '../../types/meeting';
import { setByokLlmClient, ByokLlmClient } from '../../api/byokLlmClient';

describe('useMeetingStore 实时洞察控频与手动触发 (Plan 026 TDD)', () => {
  beforeEach(() => {
    resetMeetingRepository();
    localStorage.clear();
    useMeetingStore.getState().resetLiveInsightSettings();
    useMeetingStore.setState({
      transcripts: [],
      insights: [],
      isExtractingInsights: false,
      insightError: null,
    });
  });

  it('初始状态应为手动模式 (manual)，默认间隔 120 秒', () => {
    const { liveInsightSettings } = useMeetingStore.getState();
    expect(liveInsightSettings).toEqual(DEFAULT_LIVE_INSIGHT_SETTINGS);
    expect(liveInsightSettings.mode).toBe('manual');
    expect(liveInsightSettings.intervalSeconds).toBe(120);
  });

  it('updateLiveInsightSettings 应能更新模式与配置，并支持持久化', () => {
    const store = useMeetingStore.getState();
    store.updateLiveInsightSettings({
      mode: 'disabled',
      intervalSeconds: 180,
    });

    const current = useMeetingStore.getState().liveInsightSettings;
    expect(current.mode).toBe('disabled');
    expect(current.intervalSeconds).toBe(180);

    // 验证重置
    store.resetLiveInsightSettings();
    expect(useMeetingStore.getState().liveInsightSettings).toEqual(DEFAULT_LIVE_INSIGHT_SETTINGS);
  });

  it('triggerManualInsight: 无逐字稿时应返回 false 且不发起抽取', async () => {
    const success = await useMeetingStore.getState().triggerManualInsight();
    expect(success).toBe(false);
  });

  it('triggerManualInsight: 有逐字稿时应调用 ByokLlmClient 并将提炼结果写入 insights', async () => {
    const mockClient = new ByokLlmClient();
    vi.spyOn(mockClient, 'extractLiveInsights').mockResolvedValueOnce({
      action: 'UPDATE_TOPIC',
      topicId: 'topic_manual_1',
      patch: {
        title: '手动提炼的决策',
        type: 'decision',
        content: '经过讨论确认采用纯单机免登录方案。',
        status: 'RESOLVED',
        decisions: ['采用纯单机免登录架构'],
        evidenceRefs: [{ segmentId: 'seg_manual_1', quote: '采用单机方案' }],
      },
    });
    setByokLlmClient(mockClient);

    const store = useMeetingStore.getState();
    store.addTranscriptSegment({
      id: 'seg_manual_1',
      speaker: '张总',
      channel: 'mic',
      timestamp: '00:01:00',
      text: '我们最终决定采用单机方案。',
    });

    const success = await store.triggerManualInsight();
    expect(success).toBe(true);

    const currentInsights = useMeetingStore.getState().insights;
    expect(currentInsights.length).toBeGreaterThan(0);
    const added = currentInsights.find((ins) => ins.title === '手动提炼的决策');
    expect(added).toBeDefined();
    expect(added?.content).toContain('纯单机免登录');
  });
});
