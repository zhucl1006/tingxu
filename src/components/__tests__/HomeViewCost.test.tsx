import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HomeView } from '../views/HomeView';
import { useMeetingStore } from '../../store/useMeetingStore';

describe('HomeView AI Meeting Cost Badges (T06)', () => {
  const mockMeetings = [
    {
      id: 'mtg_home_cost_1',
      title: '产品周会',
      date: '2026-11-05 10:00',
      durationSeconds: 1800,
      summary: '周会纪要',
      decisionsCount: 2,
      tasksCount: 1,
      aiCost: {
        totalCostYuan: 1.80,
        totalTokens: 150000,
        audioSeconds: 1800,
        recordsCount: 20,
        updatedAt: '2026-11-05T11:00:00.000Z',
      },
    },
    {
      id: 'mtg_home_cost_2',
      title: '线下技术对齐',
      date: '2026-11-05 15:00',
      durationSeconds: 600,
      summary: '技术对齐',
      decisionsCount: 1,
      tasksCount: 0,
      // 无 aiCost 字段
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    useMeetingStore.setState({
      historyMeetings: mockMeetings as any,
      tasks: [],
    });
  });

  it('有 aiCost 的会议卡片应展示费用徽章，无 aiCost 则不展示', () => {
    render(<HomeView />);

    const badge1 = screen.getByTestId('home-page-history-badge-cost-mtg_home_cost_1');
    expect(badge1).toBeInTheDocument();
    expect(badge1.textContent).toContain('1.80');

    expect(screen.queryByTestId('home-page-history-badge-cost-mtg_home_cost_2')).not.toBeInTheDocument();

    // 点击该卡片应激活该会议
    const card1 = screen.getByTestId('home-page-card-history-mtg_home_cost_1');
    fireEvent.click(card1);
    expect(useMeetingStore.getState().activeSummaryMeeting?.id).toBe('mtg_home_cost_1');
  });
});
