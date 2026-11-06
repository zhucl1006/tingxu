import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MeetingSummaryView } from '../views/MeetingSummaryView';
import { useMeetingStore } from '../../store/useMeetingStore';

describe('MeetingSummaryView AI Cost Breakdown Component (T04)', () => {
  const mockMeeting = {
    id: 'mtg_summary_cost_001',
    title: '战略规划与 AI 成本对账会',
    date: '2026-11-06 08:30',
    durationSeconds: 3000,
    summary: '测试会议纪要',
    decisionsCount: 2,
    tasksCount: 1,
    speakers: ['张三', '李四'],
    structuredSummary: {
      overview: '全场速览',
      decisions: [{ title: '决策1', content: '内容1' }],
      actions: [{ title: '行动1', assignee: '张三', dueDate: '今天' }],
      risks: [],
      facts: [],
    },
    transcripts: [
      { id: 'seg_1', speaker: '张三', text: '大家早上好', timestamp: '00:01' },
    ],
    aiCost: {
      totalCostYuan: 1.8938,
      totalTokens: 286898,
      audioSeconds: 3049.6,
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
      recordsCount: 140,
      updatedAt: '2026-11-06T08:30:00.000Z',
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    useMeetingStore.setState({
      activeSummaryMeeting: mockMeeting as any,
      historyMeetings: [mockMeeting as any],
    });
  });

  it('顶部应渲染 AI 成本徽章并展示当前会议费用 (T04)', () => {
    render(<MeetingSummaryView />);
    const badge = screen.getByTestId('summary-page-header-badge-ai-cost');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain('1.89');
  });

  it('点击 AI 成本徽章应弹出费用明细卡片，呈现 ASR、洞察、问答与纪要四维构成，并可关闭 (T04)', async () => {
    render(<MeetingSummaryView />);
    const badge = screen.getByTestId('summary-page-header-badge-ai-cost');
    
    // 初始状态弹窗不存在
    expect(screen.queryByTestId('summary-page-modal-cost-breakdown')).not.toBeInTheDocument();

    // 点击徽章打开
    fireEvent.click(badge);
    const modal = screen.getByTestId('summary-page-modal-cost-breakdown');
    expect(modal).toBeInTheDocument();

    // 检查明细内容
    expect(modal.textContent).toContain('语音识别');
    expect(modal.textContent).toContain('实时洞察');
    expect(modal.textContent).toContain('会中问答');
    expect(modal.textContent).toContain('纪要总结');
    expect(modal.textContent).toContain('1.0064'); // ASR 花费
    expect(modal.textContent).toContain('0.5446'); // 洞察花费

    // 点击关闭按钮关闭弹窗
    const closeBtn = screen.getByTestId('summary-page-btn-close-cost-modal');
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId('summary-page-modal-cost-breakdown')).not.toBeInTheDocument();
  });
});
