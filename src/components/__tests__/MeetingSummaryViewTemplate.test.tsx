import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MeetingSummaryView } from '../views/MeetingSummaryView';
import { useMeetingStore } from '../../store/useMeetingStore';
import type { HistoryMeeting } from '../../types/meeting';

describe('MeetingSummaryView 10 大会议模板切换与多态渲染 (T05 TDD)', () => {
  const mockMeeting: HistoryMeeting = {
    id: 'mtg_ui_tmpl_1',
    title: '高校人工智能研讨会',
    date: '2026-11-16 14:00',
    durationSeconds: 2400,
    summary: '讨论图文大模型进展。',
    decisionsCount: 1,
    tasksCount: 1,
    speakers: ['导师', '张同学'],
    templateId: 'academic',
    structuredSummary: {
      suggestedTitle: '高校人工智能研讨会',
      overview: '本次组会导师对多模态实验给予了详细指导。',
      decisions: [{ title: '选定方向', content: '集中精力攻克多模态' }],
      actions: [{ title: '文献检索', assignee: '张同学', dueDate: '周五' }],
      risks: [],
      facts: [],
      templateId: 'academic',
      templatePayload: {
        researchProgress: [
          { topic: '图文检索指标评测', progress: '指标提升 4.2%，但推理有延迟', speaker: '张同学', evidenceSegmentId: 'seg_2' },
        ],
        advisorGuidance: [
          { advisorName: '李教授', feedback: '建议使用剪枝技术并阅读新论文', suggestedReadings: ['DeepSeek论文'], evidenceSegmentId: 'seg_3' },
        ],
        academicDebates: [
          { point: '多语言能力是否会退化', discussions: '张同学认为通过 MoE 架构可解' },
        ],
        nextExperiments: [
          { task: '完成 MoE 架构消融实验', owner: '张同学', targetDeadline: '周五' },
        ],
      },
    },
    transcripts: [
      { id: 'seg_1', speaker: '导师', text: '张同学，请汇报本周进展。', timestamp: '00:01', channel: 'mic' },
      { id: 'seg_2', speaker: '张同学', text: '图文检索指标有提升，但推理较慢。', timestamp: '00:15', channel: 'mic' },
      { id: 'seg_3', speaker: '李教授', text: '建议使用剪枝技术。', timestamp: '00:30', channel: 'mic' },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    useMeetingStore.setState({
      activeSummaryMeeting: mockMeeting,
      historyMeetings: [mockMeeting],
    });
  });

  it('应渲染模板选择器，且包含全部 10 个模板选项与角色标记', () => {
    render(<MeetingSummaryView />);

    const selector = screen.getByTestId('summary-page-template-selector') as HTMLSelectElement;
    expect(selector).toBeInTheDocument();
    expect(selector.options).toHaveLength(10);

    // 默认选中当前会议的模板 academic
    expect(selector.value).toBe('academic');

    // 检查是否包含德鲁克、GRAI、康奈尔等关键选项
    const optionTexts = Array.from(selector.options).map((o) => o.text);
    expect(optionTexts.some((t) => t.includes('高校会议纪要') && t.includes('科研'))).toBe(true);
    expect(optionTexts.some((t) => t.includes('德鲁克有效会议') && t.includes('管理'))).toBe(true);
    expect(optionTexts.some((t) => t.includes('GRAI 模板') && t.includes('Leader'))).toBe(true);
    expect(optionTexts.some((t) => t.includes('康奈尔笔记') && t.includes('受训'))).toBe(true);
    expect(optionTexts.some((t) => t.includes('客户拜访纪要') && t.includes('销售'))).toBe(true);
  });

  it('应正确渲染当前高校学术模板专属的多态区块', () => {
    render(<MeetingSummaryView />);

    expect(screen.getByTestId('summary-page-template-content-academic')).toBeInTheDocument();
    expect(screen.getByText('图文检索指标评测')).toBeInTheDocument();
    expect(screen.getByText('建议使用剪枝技术并阅读新论文')).toBeInTheDocument();
    expect(screen.getByText('完成 MoE 架构消融实验')).toBeInTheDocument();
  });

  it('切换模板并点击“重新按此模板总结”时应调用 regenerateSummaryWithTemplate', async () => {
    const regenMock = vi.fn().mockResolvedValue(true);
    useMeetingStore.setState({
      regenerateSummaryWithTemplate: regenMock,
    });

    render(<MeetingSummaryView />);

    const selector = screen.getByTestId('summary-page-template-selector');
    fireEvent.change(selector, { target: { value: 'drucker' } });

    const switchBtn = screen.getByTestId('summary-page-btn-switch-template');
    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(regenMock).toHaveBeenCalledWith('mtg_ui_tmpl_1', 'drucker');
    });
  });
});
