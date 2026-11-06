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

describe('MeetingTitleEditing & CopilotCopy - 会议标题编辑、重新提炼与 Copilot 内容复制 (023 TDD)', () => {
  const writeTextMock = vi.fn().mockResolvedValue(undefined);

  const mockMeeting: HistoryMeeting = {
    id: 'mtg_edit_copy_01',
    title: '讨论事项 2026-11-05 10:00',
    date: '2026-11-05 10:00',
    durationSeconds: 600,
    summary: '测试会议讨论纪要',
    decisionsCount: 1,
    tasksCount: 1,
    speakers: ['张工'],
    structuredSummary: {
      suggestedTitle: '讨论事项',
      overview: '讨论了系统发布与用户反馈。',
      decisions: [{ title: '发布 Q4 新版本', content: '确认于周五发布' }],
      actions: [{ title: '编写测试报告', assignee: '张工' }],
      risks: [],
      facts: [],
    },
    chatHistory: [
      {
        id: 'chat_user_1',
        sender: 'user',
        content: '请梳理一下这次讨论的核心成果',
        timestamp: '10:05',
      },
      {
        id: 'chat_ai_1',
        sender: 'assistant',
        content: '本场会议主要确认了 Q4 新版本的发布排期，决定于本周五正式发布。',
        timestamp: '10:06',
        citations: [{ segmentId: 'seg_1', timestamp: '01:00', quote: '本周五正式发布' }],
        proposals: [
          {
            id: 'prop_1',
            targetSection: 'decisions',
            action: 'replace',
            proposedText: '确认于本周五下午 3 点全网发布',
            reason: '逐字稿强调了具体时间点',
            applied: false,
          },
        ],
      },
    ],
    transcripts: [
      { id: 'seg_1', speaker: '张工', text: '我们本周五正式发布新版本。', timestamp: '01:00', channel: 'mic' },
    ],
  };

  beforeEach(() => {
    writeTextMock.mockClear();
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    useMeetingStore.setState({
      activeSummaryMeeting: JSON.parse(JSON.stringify(mockMeeting)),
      historyMeetings: [JSON.parse(JSON.stringify(mockMeeting))],
      tasks: [],
      gatewayUrl: 'http://127.0.0.1:3214',
    });
  });

  it('1. 会后 Copilot 助手面板支持一键复制 AI 回答内容并给出复制反馈', async () => {
    render(<MeetingSummaryView />);

    // 切换到 Copilot 面板
    const copilotTabBtn = screen.getByTestId('summary-page-btn-tab-right-copilot');
    fireEvent.click(copilotTabBtn);

    // 验证 AI 消息气泡上存在复制按钮
    const copyAiBtn = screen.getByTestId('summary-page-copilot-btn-copy-msg-1');
    expect(copyAiBtn).toBeDefined();

    // 点击复制
    fireEvent.click(copyAiBtn);

    // 验证 clipboard.writeText 被正确调用
    expect(writeTextMock).toHaveBeenCalledWith('本场会议主要确认了 Q4 新版本的发布排期，决定于本周五正式发布。');

    // 验证按钮短暂展示已复制状态
    await waitFor(() => {
      expect(copyAiBtn.textContent).toContain('已复制');
    });
  });

  it('2. 会后 Copilot 助手支持复制用户提问与修订提案内容', async () => {
    render(<MeetingSummaryView />);

    // 切换到 Copilot 面板
    fireEvent.click(screen.getByTestId('summary-page-btn-tab-right-copilot'));

    // 验证用户消息复制按钮
    const copyUserBtn = screen.getByTestId('summary-page-copilot-btn-copy-user-msg-0');
    fireEvent.click(copyUserBtn);
    expect(writeTextMock).toHaveBeenCalledWith('请梳理一下这次讨论的核心成果');

    // 验证修订提案卡片复制按钮
    const copyPropBtn = screen.getByTestId('summary-page-copilot-btn-copy-proposal-prop_1');
    fireEvent.click(copyPropBtn);
    expect(writeTextMock).toHaveBeenCalledWith('确认于本周五下午 3 点全网发布');
  });

  it('3. 会议纪要页支持会议标题就地编辑 (Inline Editing) 与保存', async () => {
    render(<MeetingSummaryView />);

    // 初始标题展示
    const titleText = screen.getByTestId('summary-page-text-title');
    expect(titleText.textContent).toBe('讨论事项 2026-11-05 10:00');

    // 点击编辑标题按钮
    const editBtn = screen.getByTestId('summary-page-btn-edit-title');
    fireEvent.click(editBtn);

    // 出现输入框与保存/取消按钮
    const input = screen.getByTestId('summary-page-input-edit-title') as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe('讨论事项 2026-11-05 10:00');

    // 输入新标题并保存
    fireEvent.change(input, { target: { value: '听序 Q4 发布排期与上线评审' } });
    const saveBtn = screen.getByTestId('summary-page-btn-save-title');
    fireEvent.click(saveBtn);

    // 验证标题已更新且退出编辑状态
    await waitFor(() => {
      expect(screen.getByTestId('summary-page-text-title').textContent).toBe('听序 Q4 发布排期与上线评审');
    });

    const storeMtg = useMeetingStore.getState().historyMeetings.find((m) => m.id === 'mtg_edit_copy_01');
    expect(storeMtg?.title).toBe('听序 Q4 发布排期与上线评审');
  });

  it('4. 会议纪要页支持一键【重新提炼主题】并自动更新会议标题', async () => {
    const mockRefinedTitle = '听序 Q4 版本发布排期研讨';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        data: { suggestedTitle: mockRefinedTitle },
      }),
    } as any);

    render(<MeetingSummaryView />);

    // 重新提炼主题按钮
    const regenBtn = screen.getByTestId('summary-page-btn-regenerate-title');
    expect(regenBtn).toBeDefined();

    fireEvent.click(regenBtn);

    // 等待提炼完成
    await waitFor(() => {
      expect(screen.getByTestId('summary-page-text-title').textContent).toBe(mockRefinedTitle);
    });

    const storeMtg = useMeetingStore.getState().historyMeetings.find((m) => m.id === 'mtg_edit_copy_01');
    expect(storeMtg?.title).toBe(mockRefinedTitle);
  });
});
