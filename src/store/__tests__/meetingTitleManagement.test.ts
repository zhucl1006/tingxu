import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMeetingStore } from '../useMeetingStore';
import { HistoryMeeting, TaskItem } from '../../types/meeting';

describe('Meeting Title Management & Inline Editing Actions (TDD)', () => {
  const dummyMeeting: HistoryMeeting = {
    id: 'meet_title_test_01',
    title: '新会议讨论 2026-11-05 10:00',
    date: '2026-11-05 10:00',
    durationSeconds: 1200,
    summary: '讨论产品设计与双轨录音方案',
    decisionsCount: 1,
    tasksCount: 1,
    speakers: ['张三', '李四'],
    structuredSummary: {
      suggestedTitle: '新会议讨论',
      overview: '讨论核心架构与业务边界',
      decisions: [{ title: '采用双轨音频方案', content: '麦克风与系统内录混音' }],
      actions: [{ title: '输出设计稿', assignee: '张三' }],
      risks: [],
      facts: [],
    },
    transcripts: [
      { id: 'seg_1', speaker: '张三', text: '喂喂大家早上好能听到吗？', timestamp: '00:10', channel: 'system' },
      { id: 'seg_2', speaker: '李四', text: '今天主要讨论双轨音频录音方案与桌面悬浮药丸设计。', timestamp: '01:00', channel: 'system' },
    ],
  };

  const dummyTask: TaskItem = {
    id: 'task_01',
    title: '输出设计稿',
    meetingId: 'meet_title_test_01',
    meetingTitle: '新会议讨论 2026-11-05 10:00',
    assignee: '张三',
    status: 'todo',
    completed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    useMeetingStore.setState({
      historyMeetings: [JSON.parse(JSON.stringify(dummyMeeting))],
      activeSummaryMeeting: JSON.parse(JSON.stringify(dummyMeeting)),
      tasks: [JSON.parse(JSON.stringify(dummyTask))],
      gatewayUrl: 'http://127.0.0.1:3214',
    });
    vi.restoreAllMocks();
  });

  it('1. updateHistoryMeetingTitle 应正确更新指定会议标题并同步 activeSummaryMeeting 与关联 tasks', () => {
    const store = useMeetingStore.getState();
    const newTitle = '2026 双轨音频与桌面悬浮药丸架构评审';

    store.updateHistoryMeetingTitle('meet_title_test_01', newTitle);

    const updated = useMeetingStore.getState();
    const mtg = updated.historyMeetings.find((m) => m.id === 'meet_title_test_01');
    expect(mtg?.title).toBe(newTitle);
    expect(updated.activeSummaryMeeting?.title).toBe(newTitle);
    
    // 验证关联任务的 meetingTitle 同步更新
    const task = updated.tasks.find((t) => t.id === 'task_01');
    expect(task?.meetingTitle).toBe(newTitle);
  });

  it('2. updateHistoryMeetingTitle 当输入纯空格或空白时，应忽略无效更新', () => {
    const store = useMeetingStore.getState();
    store.updateHistoryMeetingTitle('meet_title_test_01', '   ');

    const updated = useMeetingStore.getState();
    const mtg = updated.historyMeetings.find((m) => m.id === 'meet_title_test_01');
    expect(mtg?.title).toBe('新会议讨论 2026-11-05 10:00');
  });

  it('3. regenerateMeetingTitle 应基于逐字稿请求网关重新提炼切题标题并更新会议', async () => {
    const mockSuggested = '双轨音频与桌面悬浮药丸设计评审';
    
    // Mock 网关响应
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          suggestedTitle: mockSuggested,
          overview: '讨论双轨音频录制与悬浮胶囊交互方案。',
        },
      }),
    } as any);

    const store = useMeetingStore.getState();
    const res = await store.regenerateMeetingTitle('meet_title_test_01');

    expect(res).toBe(mockSuggested);
    const updated = useMeetingStore.getState();
    const mtg = updated.historyMeetings.find((m) => m.id === 'meet_title_test_01');
    expect(mtg?.title).toBe(mockSuggested);
    expect(updated.activeSummaryMeeting?.title).toBe(mockSuggested);
  });

  it('4. regenerateMeetingTitle 在网关故障或无网络时，应自动根据已归纳决策或发言本地提炼切题主题而不直接失败', async () => {
    // 模拟网关网络中断
    global.fetch = vi.fn().mockRejectedValue(new Error('Network connection refused'));

    const store = useMeetingStore.getState();
    const res = await store.regenerateMeetingTitle('meet_title_test_01');

    // 应该从 dummyMeeting.structuredSummary.decisions[0].title ('采用双轨音频方案') 本地提炼切题主题
    expect(res).toBeTruthy();
    expect(res).toContain('双轨音频');
    const updated = useMeetingStore.getState();
    const mtg = updated.historyMeetings.find((m) => m.id === 'meet_title_test_01');
    expect(mtg?.title).toBe(res);
  });
});
