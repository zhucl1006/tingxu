import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SearchView } from '../views/SearchView';
import { useMeetingStore } from '../../store/useMeetingStore';
import { HistoryMeeting } from '../../types/meeting';

describe('SearchView - 历史会议与全文检索视图 (TDD)', () => {
  const mockMeetings: HistoryMeeting[] = [
    {
      id: 'mtg_search_1',
      title: '产品迭代周例会',
      date: '2026-11-01 10:00',
      durationSeconds: 600,
      summary: '全员对齐了版本交付节点，讨论了门禁自动化。',
      decisionsCount: 3,
      tasksCount: 2,
      speakers: ['张三', '李四'],
      transcripts: [
        { id: 's1', speaker: '张三', channel: 'mic', timestamp: '00:01:00', text: '大家好今天开周会' },
        { id: 's2', speaker: '李四', channel: 'mic', timestamp: '00:02:00', text: '我们要保障门禁 100% 通过' },
      ],
    },
    {
      id: 'mtg_search_2',
      title: '财务与用量预算评审会',
      date: '2026-11-01 14:00',
      durationSeconds: 1200,
      summary: '核算 AI Token 消耗与微信支付成本。',
      decisionsCount: 1,
      tasksCount: 1,
      speakers: ['王五'],
      transcripts: [
        { id: 's3', speaker: '王五', channel: 'mic', timestamp: '00:01:00', text: '核算成本' },
      ],
    },
  ];

  it('展示核心统计看板（总场次、总时长、结论数、待办数）与归档会议列表', () => {
    act(() => {
      useMeetingStore.setState({
        historyMeetings: mockMeetings,
        activeSummaryMeeting: null,
      });
    });

    render(<SearchView />);

    // 1. 指标看板
    expect(screen.getByTestId('search-page-metrics-grid')).toBeInTheDocument();
    expect(screen.getByText('已归档会议')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // 2 场会议

    // 2. 默认展示全部历史会议卡片（含参会人与时间）
    expect(screen.getByTestId('search-page-result-mtg_search_1')).toBeInTheDocument();
    expect(screen.getByTestId('search-page-result-mtg_search_2')).toBeInTheDocument();
    expect(screen.getByText('👤 张三')).toBeInTheDocument();
    expect(screen.getByText('👤 李四')).toBeInTheDocument();
    expect(screen.getByText('👤 王五')).toBeInTheDocument();
  });

  it('点击【📑 总结报告与脑图】能够打开详情模态框', () => {
    act(() => {
      useMeetingStore.setState({
        historyMeetings: mockMeetings,
        activeSummaryMeeting: null,
      });
    });

    render(<SearchView />);

    const viewBtn = screen.getByTestId('search-page-btn-view-summary-mtg_search_1');
    fireEvent.click(viewBtn);

    const state = useMeetingStore.getState();
    expect(state.activeSummaryMeeting).not.toBeNull();
    expect(state.activeSummaryMeeting?.title).toBe('产品迭代周例会');
  });

  it('搜索关键词过滤并正确呈现命中结果', () => {
    act(() => {
      useMeetingStore.setState({
        historyMeetings: mockMeetings,
      });
    });

    render(<SearchView />);

    const input = screen.getByTestId('search-page-input-query');
    fireEvent.change(input, { target: { value: '预算' } });

    // 应当只显示命中“预算”的会议
    expect(screen.getByTestId('search-page-result-mtg_search_2')).toBeInTheDocument();
    expect(screen.queryByTestId('search-page-result-mtg_search_1')).toBeNull();
  });
});
