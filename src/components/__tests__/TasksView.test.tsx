import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TasksView } from '../views/TasksView';
import { useMeetingStore } from '../../store/useMeetingStore';
import { HistoryMeeting, TaskItem } from '../../types/meeting';

describe('TasksView - 我的待办任务视图 (TDD)', () => {
  const mockMeeting: HistoryMeeting = {
    id: 'mtg_001',
    title: '听序 1.0 架构技术选型评审',
    date: '2026-11-01 10:00',
    durationSeconds: 300,
    summary: '确认本地优先与隐私合规基准。',
    decisionsCount: 1,
    tasksCount: 1,
    transcripts: [
      { id: 'seg_target_1', speaker: '李工', channel: 'mic', timestamp: '00:02:10', text: '周五完成门禁测试' },
    ],
  };

  const mockTask: TaskItem = {
    id: 'task_001',
    title: '周五完成自动化门禁联调测试',
    meetingId: 'mtg_001',
    meetingTitle: '听序 1.0 架构技术选型评审',
    assignee: '李工',
    completed: false,
    createdAt: '2026-11-01',
    evidenceSegmentId: 'seg_target_1',
  };

  it('正确渲染待办列表项并支持状态切换', () => {
    act(() => {
      useMeetingStore.setState({
        tasks: [mockTask],
        historyMeetings: [mockMeeting],
      });
    });

    render(<TasksView />);

    expect(screen.getByTestId('tasks-page-container')).toBeInTheDocument();
    expect(screen.getByText('周五完成自动化门禁联调测试')).toBeInTheDocument();
    expect(screen.getByText('👤 李工')).toBeInTheDocument();

    const checkbox = screen.getByTestId('tasks-page-checkbox-task_001');
    fireEvent.click(checkbox);
    expect(useMeetingStore.getState().tasks[0].completed).toBe(true);
  });

  it('点击【📍 定位会议记录】能够唤出对应历史会议纪要并定位到当时发言段落', () => {
    act(() => {
      useMeetingStore.setState({
        tasks: [mockTask],
        historyMeetings: [mockMeeting],
        activeSummaryMeeting: null,
        activeTargetSegmentId: null,
      });
    });

    render(<TasksView />);

    const locateBtn = screen.getByTestId('tasks-page-btn-locate-meeting-task_001');
    expect(locateBtn).toBeInTheDocument();

    fireEvent.click(locateBtn);

    const state = useMeetingStore.getState();
    expect(state.activeSummaryMeeting).not.toBeNull();
    expect(state.activeSummaryMeeting?.id).toBe('mtg_001');
    expect(state.activeTargetSegmentId).toBe('seg_target_1');
  });
});
