import { describe, it, expect, beforeEach } from 'vitest';
import { useMeetingStore } from '../useMeetingStore';
import { HistoryMeeting, MeetingChatMessage, SummaryRevisionProposal } from '../../types/meeting';

describe('Post-Meeting Copilot and Summary Editor Store Actions (TDD)', () => {
  const dummyMeeting: HistoryMeeting = {
    id: 'meet_test_01',
    title: '架构评审会',
    date: '2026-11-03 10:00',
    durationSeconds: 1800,
    summary: '讨论微服务改造方案',
    decisionsCount: 1,
    tasksCount: 1,
    speakers: ['张工', '李工'],
    structuredSummary: {
      suggestedTitle: '架构评审会',
      overview: '微服务架构初审，讨论分库分表与网关选型。',
      decisions: [
        {
          title: '采用 PostgreSQL',
          content: '全量替换旧系统 MySQL',
          evidenceQuote: '(02:15)',
          evidenceSegmentId: 'seg_1',
        },
      ],
      actions: [
        {
          title: '输出网关改造方案',
          assignee: '张工',
          dueDate: '周五',
          evidenceQuote: '(05:30)',
          evidenceSegmentId: 'seg_2',
        },
      ],
      risks: [
        {
          title: '数据迁移窗口不足',
          content: '预计迁移需耗时 6 小时',
        },
      ],
      facts: [
        {
          title: '当前 QPS 为 12000',
          content: '现有单机承载已达瓶颈',
        },
      ],
    },
    transcripts: [
      { id: 'seg_1', speaker: '李工', text: '我们决定全量替换为 PostgreSQL。', timestamp: '02:15', channel: 'system' },
      { id: 'seg_2', speaker: '张工', text: '行，我周五前输出网关改造方案。', timestamp: '05:30', channel: 'system' },
    ],
  };

  beforeEach(() => {
    // 重置并灌入测试数据
    useMeetingStore.setState({
      historyMeetings: [JSON.parse(JSON.stringify(dummyMeeting))],
      activeSummaryMeeting: JSON.parse(JSON.stringify(dummyMeeting)),
    });
  });

  it('1. 支持直接就地更新主旨综述 (updateMeetingOverview)', () => {
    const store = useMeetingStore.getState();
    expect(typeof store.updateMeetingOverview).toBe('function');

    store.updateMeetingOverview('meet_test_01', '更新后的全局主旨：全面拥抱云原生。');

    const updated = useMeetingStore.getState().activeSummaryMeeting;
    expect(updated?.structuredSummary?.overview).toBe('更新后的全局主旨：全面拥抱云原生。');
    expect(useMeetingStore.getState().historyMeetings[0].structuredSummary?.overview).toBe(
      '更新后的全局主旨：全面拥抱云原生。'
    );
  });

  it('2. 支持决策项的修改、添加与删除 (Decision Actions)', () => {
    const store = useMeetingStore.getState();

    // 2.1 修改决策
    store.updateMeetingDecision('meet_test_01', 0, {
      title: '采用 TiDB 分布式数据库',
      content: '综合考虑高可用性与水平扩展能力',
    });
    let meeting = useMeetingStore.getState().activeSummaryMeeting;
    expect(meeting?.structuredSummary?.decisions[0].title).toBe('采用 TiDB 分布式数据库');

    // 2.2 添加决策
    store.addMeetingDecision('meet_test_01', {
      title: '引入 Redis 缓存层',
      content: '高频读接口增加 Redis 缓存',
    });
    meeting = useMeetingStore.getState().activeSummaryMeeting;
    expect(meeting?.structuredSummary?.decisions.length).toBe(2);
    expect(meeting?.structuredSummary?.decisions[1].title).toBe('引入 Redis 缓存层');

    // 2.3 删除决策
    store.deleteMeetingDecision('meet_test_01', 0);
    meeting = useMeetingStore.getState().activeSummaryMeeting;
    expect(meeting?.structuredSummary?.decisions.length).toBe(1);
    expect(meeting?.structuredSummary?.decisions[0].title).toBe('引入 Redis 缓存层');
  });

  it('3. 支持待办行动项的修改、添加与删除 (Action Actions)', () => {
    const store = useMeetingStore.getState();

    // 3.1 修改待办负责人与截止时间
    store.updateMeetingAction('meet_test_01', 0, {
      assignee: '李工',
      dueDate: '下周一前',
    });
    let meeting = useMeetingStore.getState().activeSummaryMeeting;
    expect(meeting?.structuredSummary?.actions[0].assignee).toBe('李工');
    expect(meeting?.structuredSummary?.actions[0].dueDate).toBe('下周一前');

    // 3.2 添加待办
    store.addMeetingAction('meet_test_01', {
      title: '压力测试基准建立',
      assignee: '测试团队',
      dueDate: '下周三',
    });
    meeting = useMeetingStore.getState().activeSummaryMeeting;
    expect(meeting?.structuredSummary?.actions.length).toBe(2);

    // 3.3 删除待办
    store.deleteMeetingAction('meet_test_01', 0);
    meeting = useMeetingStore.getState().activeSummaryMeeting;
    expect(meeting?.structuredSummary?.actions.length).toBe(1);
    expect(meeting?.structuredSummary?.actions[0].title).toBe('压力测试基准建立');
  });

  it('4. 支持逐字稿句子的直接纠错修改 (updateMeetingTranscriptText)', () => {
    const store = useMeetingStore.getState();
    store.updateMeetingTranscriptText('meet_test_01', 'seg_1', '我们决定全面替换为 TiDB 分布式数据库。');

    const meeting = useMeetingStore.getState().activeSummaryMeeting;
    const seg = meeting?.transcripts?.find((t) => t.id === 'seg_1');
    expect(seg?.text).toBe('我们决定全面替换为 TiDB 分布式数据库。');
  });

  it('5. 支持会后 Copilot 问答消息的追加与留存 (addMeetingChatMessage)', () => {
    const store = useMeetingStore.getState();
    const chatMsg: MeetingChatMessage = {
      id: 'chat_msg_01',
      sender: 'user',
      content: '数据库最终选型是哪个？',
      timestamp: '10:35',
    };
    store.addMeetingChatMessage('meet_test_01', chatMsg);

    const meeting = useMeetingStore.getState().activeSummaryMeeting;
    expect(meeting?.chatHistory?.length).toBe(1);
    expect(meeting?.chatHistory?.[0].content).toBe('数据库最终选型是哪个？');
  });

  it('6. 支持采纳 AI 修订提案并自动更新纪要 (applySummaryProposal)', () => {
    const store = useMeetingStore.getState();

    // 模拟 AI 生成针对 overview 的修订提案
    const overviewProposal: SummaryRevisionProposal = {
      id: 'prop_01',
      targetSection: 'overview',
      action: 'replace',
      originalText: '微服务架构初审，讨论分库分表与网关选型。',
      proposedText: '架构初审已定稿：确定全面采用云原生微服务架构并引入 TiDB。',
      reason: '根据会后用户澄清修正',
    };

    store.applySummaryProposal('meet_test_01', overviewProposal);
    let meeting = useMeetingStore.getState().activeSummaryMeeting;
    expect(meeting?.structuredSummary?.overview).toBe(
      '架构初审已定稿：确定全面采用云原生微服务架构并引入 TiDB。'
    );

    // 模拟 AI 生成针对 actions 的添加提案
    const addActionProposal: SummaryRevisionProposal = {
      id: 'prop_02',
      targetSection: 'actions',
      action: 'add',
      proposedText: '完成灾备演练 [负责人: 张工] [期限: 本月底]',
    };

    store.applySummaryProposal('meet_test_01', addActionProposal);
    meeting = useMeetingStore.getState().activeSummaryMeeting;
    const addedAction = meeting?.structuredSummary?.actions.find((a) =>
      a.title.includes('完成灾备演练')
    );
    expect(addedAction).toBeDefined();
    expect(addedAction?.assignee).toBe('张工');
  });
});
