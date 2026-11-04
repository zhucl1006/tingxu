import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MeetingSummaryView } from '../views/MeetingSummaryView';
import { useMeetingStore } from '../../store/useMeetingStore';
import { HistoryMeeting } from '../../types/meeting';

const mediaRelease = vi.fn();
vi.mock('../../audio/localRecording', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../audio/localRecording')>()),
  openLocalMedia: vi.fn(async () => ({ url: 'tingxu-media://localhost/synthetic', release: mediaRelease })),
}));

describe('MeetingSummaryView - 会后 Copilot 助手与原地人工修订功能 (018 TDD)', () => {
  const mockMeeting: HistoryMeeting = {
    id: 'mtg_copilot_01',
    title: '听序架构评审 11-03',
    date: '2026-11-03 10:00',
    durationSeconds: 300,
    summary: '讨论架构选型与报告修订',
    decisionsCount: 1,
    tasksCount: 1,
    speakers: ['张总', '李工'],
    structuredSummary: {
      suggestedTitle: '听序架构评审',
      overview: '本次会议重点确认系统架构与待办排期。',
      decisions: [
        {
          title: '采用 TiDB 分布式数据库',
          content: '高可用方案评审通过',
          evidenceQuote: '(01:10)',
          evidenceSegmentId: 'seg_1',
        },
      ],
      actions: [
        {
          title: '完成数据迁移方案设计',
          assignee: '李工',
          dueDate: '周五',
          evidenceQuote: '(02:30)',
          evidenceSegmentId: 'seg_2',
        },
      ],
      risks: [],
      facts: [],
    },
    transcripts: [
      {
        id: 'seg_1',
        speaker: '张总',
        channel: 'mic',
        timestamp: '01:10',
        text: '经过评审，我们同意采用 TiDB 数据库。',
      },
      {
        id: 'seg_2',
        speaker: '李工',
        channel: 'system',
        timestamp: '02:30',
        text: '我会在周五前完成数据迁移方案设计。',
      },
    ],
    chatHistory: [],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    useMeetingStore.setState({
      historyMeetings: [JSON.parse(JSON.stringify(mockMeeting))],
      activeSummaryMeeting: JSON.parse(JSON.stringify(mockMeeting)),
      activeTargetSegmentId: null,
      currentRoute: 'summary',
      gatewayUrl: 'http://localhost:3201',
    });
  });

  it('1. 支持在右栏中切换【录音与逐字稿】与【会后 Copilot 助手】', () => {
    render(<MeetingSummaryView />);

    expect(screen.getByTestId('summary-page-btn-tab-right-transcripts')).toBeDefined();
    expect(screen.getByTestId('summary-page-btn-tab-right-copilot')).toBeDefined();

    // 默认展示逐字稿
    expect(screen.getByTestId('summary-page-list-transcripts')).toBeDefined();

    // 点击切换为 Copilot 助手
    fireEvent.click(screen.getByTestId('summary-page-btn-tab-right-copilot'));
    expect(screen.getByTestId('summary-page-copilot-container')).toBeDefined();
    expect(screen.getByTestId('summary-page-copilot-input-ask')).toBeDefined();
    expect(screen.getByTestId('summary-page-copilot-btn-send')).toBeDefined();

    // 再次点击可切回逐字稿
    fireEvent.click(screen.getByTestId('summary-page-btn-tab-right-transcripts'));
    expect(screen.getByTestId('summary-page-list-transcripts')).toBeDefined();
  });

  it('2. 顶部工具栏提供【会后 Copilot 助手】快捷呼出按钮', () => {
    render(<MeetingSummaryView />);
    const callBtn = screen.getByTestId('summary-page-btn-call-copilot');
    expect(callBtn.textContent).toContain('会后 Copilot 助手');

    fireEvent.click(callBtn);
    expect(screen.getByTestId('summary-page-copilot-container')).toBeDefined();
    expect(callBtn.textContent).toContain('Copilot 对话中');
  });

  it('3. 支持通过快捷预设提问胶囊向 Copilot 发问并展示回复与引证', async () => {
    // 模拟 Gateway 问答接口成功返回
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          answer: '本场会议最终确认采用 TiDB 数据库，由李工跟进迁移方案。',
          evidenceRefs: [{ segmentId: 'seg_1', timestamp: '01:10', quote: '同意采用 TiDB 数据库' }],
        },
      }),
    });
    global.fetch = mockFetch;

    render(<MeetingSummaryView />);

    // 切换到 Copilot 面板
    fireEvent.click(screen.getByTestId('summary-page-btn-tab-right-copilot'));

    // 点击第一个快捷胶囊：🎯 一句话核心总结
    const quickBtn = screen.getByTestId('summary-page-copilot-quick-prompt-0');
    fireEvent.click(quickBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // 验证渲染了用户问题与 AI 回复
    expect(screen.getByTestId('summary-page-copilot-msg-user-0')).toBeDefined();
    expect(screen.getByTestId('summary-page-copilot-msg-ai-1')).toBeDefined();
    expect(screen.getByText('本场会议最终确认采用 TiDB 数据库，由李工跟进迁移方案。')).toBeDefined();
  });

  it('4. 支持 AI 纪要修订提案展示与一键采纳应用 (Apply Proposal)', async () => {
    // 模拟带有修订提案的问答回复
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          answer: '已根据您的指示生成修订提案：将数据库方案调整为 TiDB 集群。',
          evidenceRefs: [],
          proposals: [
            {
              targetSection: 'decisions',
              action: 'replace',
              itemIndex: 0,
              originalText: '采用 TiDB 分布式数据库',
              proposedText: '全面采用 TiDB 分布式数据库高可用集群架构',
              reason: '根据会后指令精确指定集群架构',
            },
          ],
        },
      }),
    });
    global.fetch = mockFetch;

    render(<MeetingSummaryView />);

    fireEvent.click(screen.getByTestId('summary-page-btn-tab-right-copilot'));
    const input = screen.getByTestId('summary-page-copilot-input-ask');
    const sendBtn = screen.getByTestId('summary-page-copilot-btn-send');

    fireEvent.change(input, { target: { value: '把第1条决策改为全面采用 TiDB 高可用集群架构' } });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText('已根据您的指示生成修订提案：将数据库方案调整为 TiDB 集群。')).toBeDefined();
    });

    // 找到采纳按钮并点击
    const applyBtn = screen.getByText('✓ 采纳并更新报告');
    expect(applyBtn).toBeDefined();
    fireEvent.click(applyBtn);

    // 验证 store 中的结构化纪要已经更新
    const updatedMeeting = useMeetingStore.getState().activeSummaryMeeting;
    expect(updatedMeeting?.structuredSummary?.decisions[0].content).toBe(
      '全面采用 TiDB 分布式数据库高可用集群架构'
    );
  });

  it('5. 支持主旨综述的原地人工编辑与保存 (Inline Edit Overview)', () => {
    render(<MeetingSummaryView />);

    const editBtn = screen.getByTestId('summary-page-btn-edit-overview');
    fireEvent.click(editBtn);

    const textarea = screen.getByTestId('summary-page-textarea-edit-overview') as HTMLTextAreaElement;
    expect(textarea).toBeDefined();
    expect(textarea.value).toContain('本次会议重点确认系统架构与待办排期。');

    fireEvent.change(textarea, { target: { value: '人工编辑修改后的最新全局主旨综述。' } });

    const saveBtn = screen.getByTestId('summary-page-btn-save-overview');
    fireEvent.click(saveBtn);

    // 验证更新
    expect(screen.getByText('人工编辑修改后的最新全局主旨综述。')).toBeDefined();
    expect(useMeetingStore.getState().activeSummaryMeeting?.structuredSummary?.overview).toBe(
      '人工编辑修改后的最新全局主旨综述。'
    );
  });

  it('6. 支持关键决策卡片的原地人工编辑与新增', () => {
    render(<MeetingSummaryView />);

    // 6.1 原地修改决策
    const editDecisionBtn = screen.getByTestId('summary-page-btn-edit-decision-0');
    fireEvent.click(editDecisionBtn);

    const inputTitle = screen.getByTestId('summary-page-input-edit-decision-title-0');
    fireEvent.change(inputTitle, { target: { value: '手工修改的决策标题' } });

    const saveDecisionBtn = screen.getByTestId('summary-page-btn-save-decision-0');
    fireEvent.click(saveDecisionBtn);

    expect(screen.getByText('手工修改的决策标题')).toBeDefined();

    // 6.2 新增决策
    const addBtn = screen.getByTestId('summary-page-btn-add-decision');
    fireEvent.click(addBtn);

    const newTitleInput = screen.getByTestId('summary-page-input-new-decision-title');
    const newContentTextarea = screen.getByTestId('summary-page-textarea-new-decision-content');
    fireEvent.change(newTitleInput, { target: { value: '新增的Redis缓存决议' } });
    fireEvent.change(newContentTextarea, { target: { value: '针对核心热点数据增加缓存层' } });

    const confirmAddBtn = screen.getByTestId('summary-page-btn-confirm-add-decision');
    fireEvent.click(confirmAddBtn);

    expect(screen.getByText('新增的Redis缓存决议')).toBeDefined();
    expect(useMeetingStore.getState().activeSummaryMeeting?.structuredSummary?.decisions.length).toBe(2);
  });

  it('7. 支持行动待办卡片的原地人工编辑与新增', () => {
    render(<MeetingSummaryView />);

    // 7.1 原地修改待办
    const editActionBtn = screen.getByTestId('summary-page-btn-edit-action-0');
    fireEvent.click(editActionBtn);

    const inputTitle = screen.getByTestId('summary-page-input-edit-action-title-0');
    const inputAssignee = screen.getByTestId('summary-page-input-edit-action-assignee-0');
    fireEvent.change(inputTitle, { target: { value: '重构数据同步链路' } });
    fireEvent.change(inputAssignee, { target: { value: '王工' } });

    const saveActionBtn = screen.getByTestId('summary-page-btn-save-action-0');
    fireEvent.click(saveActionBtn);

    expect(screen.getAllByText(/重构数据同步链路/).length).toBeGreaterThanOrEqual(1);

    // 7.2 新增待办
    const addActionBtn = screen.getByTestId('summary-page-btn-add-action');
    fireEvent.click(addActionBtn);

    const newTitleInput = screen.getByTestId('summary-page-input-new-action-title');
    const newAssigneeInput = screen.getByTestId('summary-page-input-new-action-assignee');
    fireEvent.change(newTitleInput, { target: { value: '搭建监控告警看板' } });
    fireEvent.change(newAssigneeInput, { target: { value: '运维组' } });

    const confirmAddBtn = screen.getByTestId('summary-page-btn-confirm-add-action');
    fireEvent.click(confirmAddBtn);

    expect(screen.getAllByText(/搭建监控告警看板/).length).toBeGreaterThanOrEqual(1);
    expect(useMeetingStore.getState().activeSummaryMeeting?.structuredSummary?.actions.length).toBe(2);
  });

  it('8. 支持逐字稿句子的直接纠错修改', () => {
    render(<MeetingSummaryView />);

    // 在右栏逐字稿中点击编辑
    const editBtn = screen.getByTestId('summary-page-btn-edit-transcript-row-seg_1');
    fireEvent.click(editBtn);

    const input = screen.getByTestId('summary-page-input-edit-transcript-row-seg_1') as HTMLInputElement;
    expect(input.value).toBe('经过评审，我们同意采用 TiDB 数据库。');

    fireEvent.change(input, { target: { value: '经过评审，我们同意全面采用 TiDB 数据库分布式方案。' } });

    const saveBtn = screen.getByTestId('summary-page-btn-save-transcript-row-seg_1');
    fireEvent.click(saveBtn);

    expect(screen.getByText('经过评审，我们同意全面采用 TiDB 数据库分布式方案。')).toBeDefined();
    const updated = useMeetingStore.getState().activeSummaryMeeting;
    expect(updated?.transcripts?.[0].text).toBe('经过评审，我们同意全面采用 TiDB 数据库分布式方案。');
  });
});
