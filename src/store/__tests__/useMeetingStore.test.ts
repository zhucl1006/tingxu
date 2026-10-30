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
});
