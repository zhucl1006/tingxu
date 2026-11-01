import { describe, it, expect, beforeEach } from 'vitest';
import { useMeetingStore } from '../useMeetingStore';

describe('useMeetingStore - 状态管理与人工保护逻辑 (TDD)', () => {
  beforeEach(() => {
    useMeetingStore.getState().resetMeeting();
  });

  it('初始状态应为 IDLE 且时间为 0', () => {
    const state = useMeetingStore.getState();
    expect(state.status).toBe('IDLE');
    expect(state.elapsedSeconds).toBe(0);
    expect(state.insights).toHaveLength(0);
    expect(state.transcripts).toHaveLength(0);
  });

  it('启动会议应流转至 RECORDING 状态并初始化标题', () => {
    const store = useMeetingStore.getState();
    store.startMeeting('2026-10-30 战略对齐会');
    
    const state = useMeetingStore.getState();
    expect(state.status).toBe('RECORDING');
    expect(state.title).toBe('2026-10-30 战略对齐会');
    expect(state.meetingId).not.toBeNull();
  });

  it('计时器 tickTimer 增加秒数', () => {
    const store = useMeetingStore.getState();
    store.startMeeting('测试会议');
    store.tickTimer();
    store.tickTimer();
    expect(useMeetingStore.getState().elapsedSeconds).toBe(2);
  });

  it('添加逐字稿片段与洞察卡片', () => {
    const store = useMeetingStore.getState();
    store.startMeeting('测试');
    store.addTranscriptSegment({
      id: 'seg-1',
      speaker: '朱工',
      channel: 'mic',
      timestamp: '00:01:15',
      text: '我们本周五前完成跨平台双栏工作台的骨架搭建。',
    });

    store.addInsight({
      id: 'ins-1',
      type: 'decision',
      title: '周五完成双栏骨架搭建',
      content: '确定本周五前完成 Tauri 跨平台骨架并打通窗口通讯',
      timestamp: '00:01:15',
      evidenceSegmentId: 'seg-1',
    });

    const state = useMeetingStore.getState();
    expect(state.transcripts).toHaveLength(1);
    expect(state.insights).toHaveLength(1);
    expect(state.insights[0].isConfirmed).toBe(false);
  });

  it('铁律测试：人工确认或编辑保护（Human Protection）机制', () => {
    const store = useMeetingStore.getState();
    store.startMeeting('保护测试');
    store.addInsight({
      id: 'ins-1',
      type: 'decision',
      title: '原定交付时间',
      content: '周五下班前全量提测',
      timestamp: '00:02:00',
      evidenceSegmentId: 'seg-1',
    });

    // 1. 用户手动点击“确认”该结论
    store.confirmInsight('ins-1');
    expect(useMeetingStore.getState().insights[0].isConfirmed).toBe(true);

    // 2. 后续算法产生冲突事实，尝试算法原地覆盖 -> 必须生成 Pending Revision 而非覆盖原内容！
    store.proposeInsightRevision('ins-1', {
      id: 'rev-1',
      proposedText: '因架构重构，推迟至下周二提测',
      reason: '后续发言第 45 段提到时间调整',
      timestamp: '00:04:30',
      evidenceSegmentId: 'seg-45',
    });

    const currentCard = useMeetingStore.getState().insights[0];
    // 原卡片内容绝不可被覆盖！
    expect(currentCard.content).toBe('周五下班前全量提测');
    expect(currentCard.pendingRevision).toBeDefined();
    expect(currentCard.pendingRevision?.proposedText).toBe('因架构重构，推迟至下周二提测');

    // 3. 用户裁决：若点击“保留当前版本”，修订建议被丢弃，原内容保留
    store.keepCurrentInsightVersion('ins-1');
    expect(useMeetingStore.getState().insights[0].content).toBe('周五下班前全量提测');
    expect(useMeetingStore.getState().insights[0].pendingRevision).toBeUndefined();

    // 4. 再次触发修订并选择“采用新版本”
    store.proposeInsightRevision('ins-1', {
      id: 'rev-2',
      proposedText: '协商一致延至周六上午',
      reason: '补充确认',
      timestamp: '00:05:00',
      evidenceSegmentId: 'seg-50',
    });
    store.acceptInsightRevision('ins-1');
    const updatedCard = useMeetingStore.getState().insights[0];
    expect(updatedCard.content).toBe('协商一致延至周六上午');
    expect(updatedCard.isEdited).toBe(true);
    expect(updatedCard.pendingRevision).toBeUndefined();
  });

  it('证据高亮定位状态与窗口切换', () => {
    const store = useMeetingStore.getState();
    store.setHighlightedTranscriptId('seg-12');
    expect(useMeetingStore.getState().highlightedTranscriptId).toBe('seg-12');

    store.setActiveWindow('floating-pill');
    expect(useMeetingStore.getState().activeWindow).toBe('floating-pill');
  });

  it('结束会议时应结合逐字稿自动生成切题标题与四维结构化纪要', async () => {
    const store = useMeetingStore.getState();
    // 初始标题为默认日期时间标题
    store.startMeeting('会议记录 11-01 10:30');
    store.tickTimer();
    store.addTranscriptSegment({
      id: 'seg_1',
      speaker: '朱工',
      channel: 'mic',
      timestamp: '00:01:00',
      text: '今天探讨 AI 工具链与双轨音频低延迟方案',
    });

    // 模拟 fetch 返回 meeting-summary
    const originalFetch = global.fetch;
    global.fetch = async (url: any) => {
      if (String(url).includes('/meeting-summary')) {
        return {
          ok: true,
          json: async () => ({
            code: 0,
            data: {
              suggestedTitle: 'AI 工具链与双轨音频方案探讨',
              overview: '讨论了双轨音频低延迟采集与 AI 增量提炼方案。',
              decisions: [{ title: '采用双轨音频方案', content: '确认低延迟管道', evidenceQuote: '今天探讨' }],
              actions: [{ title: '完成链路联调', assignee: '朱工', dueDate: '周五' }],
              risks: [{ title: '网络波动风险', content: '需增加重连' }],
              facts: [{ title: '本地沙箱存储', content: '完全保障数据主权' }],
            },
          }),
        } as any;
      }
      return { ok: true, json: async () => ({ code: 0, data: {} }) } as any;
    };

    try {
      await store.endMeeting();
      const state = useMeetingStore.getState();

      // 验证标题已升级为：切题主题 + 日期时间
      expect(state.title).toContain('AI 工具链与双轨音频方案探讨');
      expect(state.title).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);

      // 验证历史会议中包含四维结构化总结
      expect(state.historyMeetings).toHaveLength(1);
      const history = state.historyMeetings[0];
      expect(history.structuredSummary).toBeDefined();
      expect(history.structuredSummary?.suggestedTitle).toBe('AI 工具链与双轨音频方案探讨');
      expect(history.structuredSummary?.decisions).toHaveLength(1);
      expect(history.structuredSummary?.actions).toHaveLength(1);

      // 验证待办自动录入 tasks
      expect(state.tasks.some((t) => t.title.includes('完成链路联调'))).toBe(true);

      // 验证 activeSummaryMeeting 已激活
      expect(state.activeSummaryMeeting).toBe(history);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('会议进行中随着秒数增加实时动态递减 quotaMinutes，并在结束会议时结算扣减', async () => {
    const store = useMeetingStore.getState();
    store.loginUser({
      userId: 'usr_deduct_test',
      phone: '13811112222',
      token: 'jwt_mock_token',
    });
    store.setQuotaMinutes(60);

    store.startMeeting('时长扣减验证会议');
    expect(useMeetingStore.getState().quotaMinutes).toBe(60);

    // 开会进行了 65 秒 (超过 1 分钟)
    for (let i = 0; i < 65; i++) {
      useMeetingStore.getState().tickTimer();
    }

    // 应该动态递减为 58 或 59 分钟 (3600 - 65 = 3535 秒 -> 58 分钟)
    expect(useMeetingStore.getState().quotaMinutes).toBe(58);

    // 模拟 endMeeting 发起服务端核销
    let deductPayload: any = null;
    const originalFetch = global.fetch;
    global.fetch = async (url: any, init: any) => {
      if (String(url).includes('/v1/billing/deduct')) {
        deductPayload = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            code: 0,
            data: { totalAvailableSeconds: 3535, reservedSeconds: 0 },
          }),
        } as any;
      }
      return { ok: true, json: async () => ({ code: 0, data: {} }) } as any;
    };

    try {
      await store.endMeeting();
      expect(deductPayload).toBeDefined();
      expect(deductPayload.userId).toBe('usr_deduct_test');
      expect(deductPayload.seconds).toBe(65);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
