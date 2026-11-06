import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BillingView } from '../views/BillingView';
import { useMeetingStore } from '../../store/useMeetingStore';

describe('BillingView AI Meeting Costs & Transparency (T05)', () => {
  const mockMeetings = [
    {
      id: 'mtg_billing_1',
      title: '第一季度业务复盘',
      date: '2026-11-05 09:00',
      durationSeconds: 3000,
      summary: '复盘纪要',
      decisionsCount: 1,
      tasksCount: 1,
      aiCost: {
        totalCostYuan: 1.80,
        totalTokens: 200000,
        audioSeconds: 3000,
        breakdown: {
          asrCostYuan: 0.99,
          asrAudioSeconds: 3000,
          insightsCostYuan: 0.50,
          insightsTokens: 100000,
          summaryCostYuan: 0.05,
          summaryTokens: 20000,
          chatCostYuan: 0.26,
          chatTokens: 80000,
        },
        recordsCount: 50,
        updatedAt: '2026-11-05T10:00:00.000Z',
      },
    },
    {
      id: 'mtg_billing_2',
      title: '技术架构演进讨论',
      date: '2026-11-05 14:00',
      durationSeconds: 1800,
      summary: '架构讨论纪要',
      decisionsCount: 2,
      tasksCount: 0,
      aiCost: {
        totalCostYuan: 1.20,
        totalTokens: 120000,
        audioSeconds: 1800,
        breakdown: {
          asrCostYuan: 0.60,
          asrAudioSeconds: 1800,
          insightsCostYuan: 0.35,
          insightsTokens: 60000,
          summaryCostYuan: 0.05,
          summaryTokens: 20000,
          chatCostYuan: 0.20,
          chatTokens: 40000,
        },
        recordsCount: 30,
        updatedAt: '2026-11-05T14:30:00.000Z',
      },
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    useMeetingStore.setState({
      quotaMinutes: 120,
      historyMeetings: mockMeetings as any,
    });
  });

  it('应渲染单场会议 AI 实际成本明细面板与场均成本看板 (T05)', () => {
    render(<BillingView />);

    // 检查明细容器
    const section = screen.getByTestId('billing-page-section-meeting-costs');
    expect(section).toBeInTheDocument();

    // 场均成本计算：(1.80 + 1.20) / 2 = 1.50 元/场
    const avgText = screen.getByTestId('billing-page-text-average-cost');
    expect(avgText.textContent).toContain('1.50');

    // 会议明细流水行
    const row1 = screen.getByTestId('billing-page-row-meeting-cost-mtg_billing_1');
    expect(row1).toBeInTheDocument();
    expect(row1.textContent).toContain('第一季度业务复盘');
    expect(row1.textContent).toContain('1.80');

    const row2 = screen.getByTestId('billing-page-row-meeting-cost-mtg_billing_2');
    expect(row2).toBeInTheDocument();
    expect(row2.textContent).toContain('技术架构演进讨论');
    expect(row2.textContent).toContain('1.20');

    // 点击某一行应切换激活会议并跳转到 summary 纪要页
    fireEvent.click(row1);
    expect(useMeetingStore.getState().activeSummaryMeeting?.id).toBe('mtg_billing_1');
    expect(useMeetingStore.getState().currentRoute).toBe('summary');
  });

  it('当没有会议成本数据时应正常展示 0.00 且显示空态提示', () => {
    useMeetingStore.setState({
      quotaMinutes: 60,
      historyMeetings: [],
    });

    render(<BillingView />);
    const avgText = screen.getByTestId('billing-page-text-average-cost');
    expect(avgText.textContent).toContain('0.00');
    expect(screen.getByText('暂无已结算 AI 成本的会议记录')).toBeInTheDocument();
  });
});
