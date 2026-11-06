import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useMeetingStore } from '../useMeetingStore';

describe('Meeting AI Cost Store & Local Persistence (T03)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useMeetingStore.setState({
      historyMeetings: [
        {
          id: 'mtg_cost_test_1',
          title: '费用测试会议',
          date: '2026-11-06 08:00',
          durationSeconds: 1800,
          summary: '测试摘要',
          decisionsCount: 1,
          tasksCount: 1,
        },
      ],
      activeSummaryMeeting: {
        id: 'mtg_cost_test_1',
        title: '费用测试会议',
        date: '2026-11-06 08:00',
        durationSeconds: 1800,
        summary: '测试摘要',
        decisionsCount: 1,
        tasksCount: 1,
      },
      aiCost: null,
      gatewayUrl: 'http://127.0.0.1:3201',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchMeetingAiCost 成功获取网关数据后，应更新 state.aiCost、历史会议与 activeSummaryMeeting 并持久化', async () => {
    const mockResponse = {
      code: 0,
      data: {
        meetingId: 'mtg_cost_test_1',
        totalCostYuan: 1.8938,
        totalTokens: 286898,
        totalAudioSeconds: 3049.6,
        recordsCount: 140,
        breakdown: {
          asrCostYuan: 1.0064,
          asrAudioSeconds: 3049.6,
          insightsCostYuan: 0.5446,
          insightsTokens: 136614,
          summaryCostYuan: 0.0634,
          summaryTokens: 16832,
          chatCostYuan: 0.2889,
          chatTokens: 133452,
        },
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as any);

    const cost = await useMeetingStore.getState().fetchMeetingAiCost('mtg_cost_test_1');

    expect(cost).not.toBeNull();
    expect(cost?.totalCostYuan).toBe(1.8938);
    expect(cost?.breakdown.asrCostYuan).toBe(1.0064);
    expect(cost?.breakdown.chatTokens).toBe(133452);

    const state = useMeetingStore.getState();
    const updatedHistory = state.historyMeetings.find((m) => m.id === 'mtg_cost_test_1');
    expect(updatedHistory?.aiCost?.totalCostYuan).toBe(1.8938);
    expect(state.activeSummaryMeeting?.aiCost?.totalCostYuan).toBe(1.8938);
  });

  it('网关请求失败或离线时，fetchMeetingAiCost 应优雅容错并返回 null，不破坏现有状态', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const cost = await useMeetingStore.getState().fetchMeetingAiCost('mtg_cost_test_1');
    expect(cost).toBeNull();
    expect(useMeetingStore.getState().aiCost).toBeNull();
  });
});
