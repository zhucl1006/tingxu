import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TasksView } from '../views/TasksView';
import { useMeetingStore } from '../../store/useMeetingStore';
import { HistoryMeeting, TaskItem } from '../../types/meeting';

describe('TasksView - 全新待办任务工作台 UI/UX (TDD)', () => {
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

  const mockTask1: TaskItem = {
    id: 'task_001',
    title: '周五完成自动化门禁联调测试',
    meetingId: 'mtg_001',
    meetingTitle: '听序 1.0 架构技术选型评审',
    assignee: '李工',
    completed: false,
    status: 'todo',
    priority: 'high',
    dueDate: '2026-11-06',
    description: '核心门禁回归覆盖',
    createdAt: '2026-11-01',
    evidenceSegmentId: 'seg_target_1',
  };

  const mockTask2: TaskItem = {
    id: 'task_002',
    title: '对齐微信支付进件材料',
    meetingTitle: '独立待办任务',
    assignee: '王经理',
    completed: true,
    status: 'done',
    priority: 'medium',
    createdAt: '2026-11-02',
  };

  beforeEach(() => {
    act(() => {
      useMeetingStore.setState({
        tasks: [mockTask1, mockTask2],
        historyMeetings: [mockMeeting],
        activeSummaryMeeting: null,
        activeTargetSegmentId: null,
      });
    });
    localStorage.clear();
  });

  it('正确渲染待办列表项、统计指示器及状态切换', () => {
    render(<TasksView />);

    expect(screen.getByTestId('tasks-page-container')).toBeInTheDocument();
    expect(screen.getByText('周五完成自动化门禁联调测试')).toBeInTheDocument();
    expect(screen.getByText('👤 李工')).toBeInTheDocument();
    expect(screen.getByText('P1 高')).toBeInTheDocument();

    // 勾选复选框流转状态
    const checkbox = screen.getByTestId('tasks-page-checkbox-task_001');
    fireEvent.click(checkbox);
    expect(useMeetingStore.getState().tasks.find((t) => t.id === 'task_001')?.completed).toBe(true);
  });

  it('显式提供【推进到进行中】操作按钮，一键推进任务状态', () => {
    render(<TasksView />);

    // 待办任务应显式展示“推进到进行中”按钮
    const advanceBtn = screen.getByTestId('tasks-page-btn-advance-progress-task_001');
    expect(advanceBtn).toBeInTheDocument();
    expect(advanceBtn.textContent).toContain('推进到进行中');

    fireEvent.click(advanceBtn);
    const updated = useMeetingStore.getState().tasks.find((t) => t.id === 'task_001');
    expect(updated?.status).toBe('in_progress');
    expect(updated?.completed).toBe(false);

    // 此时按钮文案应变为“标记完成”
    const markDoneBtn = screen.getByTestId('tasks-page-btn-advance-done-task_001');
    expect(markDoneBtn).toBeInTheDocument();
    expect(markDoneBtn.textContent).toContain('标记完成');
  });

  it('支持快速添加新待办任务（直选优先级胶囊与日期控件）', () => {
    render(<TasksView />);

    const quickInput = screen.getByTestId('tasks-page-input-quick-title');
    const priorityHighBtn = screen.getByTestId('tasks-page-btn-quick-priority-high');
    const addBtn = screen.getByTestId('tasks-page-btn-quick-add');

    fireEvent.change(quickInput, { target: { value: '配置生产环境 Nginx 证书' } });
    fireEvent.click(priorityHighBtn);

    // 快捷填充今天
    const quickTodayBtn = screen.getByTestId('tasks-page-btn-quick-date-today');
    fireEvent.click(quickTodayBtn);

    fireEvent.click(addBtn);

    const tasks = useMeetingStore.getState().tasks;
    expect(tasks).toHaveLength(3);
    expect(tasks[0].title).toBe('配置生产环境 Nginx 证书');
    expect(tasks[0].priority).toBe('high');
    expect(tasks[0].status).toBe('todo');
    expect(tasks[0].dueDate).toBeDefined();
  });

  it('支持多行编辑修改待办（多行描述Textarea、优先级直接胶囊选择、日期时间控件）', () => {
    render(<TasksView />);

    const editBtn = screen.getByTestId('tasks-page-btn-edit-task_001');
    fireEvent.click(editBtn);

    // 此时展开行内编辑控件（包含多行描述 Textarea）
    const titleInput = screen.getByTestId('tasks-page-input-edit-title-task_001');
    const descTextarea = screen.getByTestId('tasks-page-textarea-edit-description-task_001');
    const priorityLowBtn = screen.getByTestId('tasks-page-btn-edit-priority-low-task_001');
    const dateInput = screen.getByTestId('tasks-page-input-edit-duedate-task_001');
    const saveBtn = screen.getByTestId('tasks-page-btn-save-edit-task_001');

    fireEvent.change(titleInput, { target: { value: '修改后的紧急性能优化待办' } });
    fireEvent.change(descTextarea, { target: { value: '第一行细节\n第二行执行要点\n第三行验收基准' } });
    fireEvent.click(priorityLowBtn);
    fireEvent.change(dateInput, { target: { value: '2026-11-20' } });
    fireEvent.click(saveBtn);

    const updated = useMeetingStore.getState().tasks.find((t) => t.id === 'task_001');
    expect(updated?.title).toBe('修改后的紧急性能优化待办');
    expect(updated?.description).toBe('第一行细节\n第二行执行要点\n第三行验收基准');
    expect(updated?.priority).toBe('low');
    expect(updated?.dueDate).toBe('2026-11-20');
  });

  it('支持多选待办任务与批量悬浮操作条（批量推进进行中、批量删除等）', () => {
    render(<TasksView />);

    // 1. 勾选 task_001 多选框
    const select1 = screen.getByTestId('tasks-page-checkbox-select-task_001');
    fireEvent.click(select1);

    // 2. 检查批量悬浮操作条出现
    expect(screen.getByTestId('tasks-page-toolbar-batch-actions')).toBeInTheDocument();
    expect(screen.getByText(/已选择 1 项/)).toBeInTheDocument();

    // 3. 勾选 task_002 多选框
    const select2 = screen.getByTestId('tasks-page-checkbox-select-task_002');
    fireEvent.click(select2);
    expect(screen.getByText(/已选择 2 项/)).toBeInTheDocument();

    // 4. 批量推进至进行中
    const batchInProgressBtn = screen.getByTestId('tasks-page-btn-batch-in-progress');
    fireEvent.click(batchInProgressBtn);

    const tasks = useMeetingStore.getState().tasks;
    expect(tasks.every((t) => t.status === 'in_progress')).toBe(true);

    // 5. 批量删除
    // 重新勾选全选
    const selectAllCheckbox = screen.getByTestId('tasks-page-checkbox-select-all');
    fireEvent.click(selectAllCheckbox);

    const batchDeleteBtn = screen.getByTestId('tasks-page-btn-batch-delete');
    fireEvent.click(batchDeleteBtn);

    expect(useMeetingStore.getState().tasks).toHaveLength(0);
  });

  it('支持删除单条待办任务（带确认）', () => {
    render(<TasksView />);

    const deleteBtn = screen.getByTestId('tasks-page-btn-delete-task_001');
    fireEvent.click(deleteBtn);

    expect(useMeetingStore.getState().tasks.map((t) => t.id)).toEqual(['task_002']);
  });

  it('支持一键清理所有已完成任务', () => {
    render(<TasksView />);

    const clearBtn = screen.getByTestId('tasks-page-btn-clear-completed');
    expect(clearBtn).toBeInTheDocument();
    fireEvent.click(clearBtn);

    const tasks = useMeetingStore.getState().tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('task_001');
  });

  it('支持状态 Tab 过滤（全部 / 待办 / 进行中 / 已完成）与搜索', () => {
    render(<TasksView />);

    // 切换到进行中
    const inProgressTab = screen.getByTestId('tasks-page-tab-in_progress');
    fireEvent.click(inProgressTab);
    expect(screen.queryByText('周五完成自动化门禁联调测试')).not.toBeInTheDocument();

    // 切换到已完成
    const completedTab = screen.getByTestId('tasks-page-tab-completed');
    fireEvent.click(completedTab);
    expect(screen.getByText('对齐微信支付进件材料')).toBeInTheDocument();

    // 搜索过滤
    const allTab = screen.getByTestId('tasks-page-tab-all');
    fireEvent.click(allTab);
    const searchInput = screen.getByTestId('tasks-page-input-search');
    fireEvent.change(searchInput, { target: { value: '微信' } });
    expect(screen.getByText('对齐微信支付进件材料')).toBeInTheDocument();
    expect(screen.queryByText('周五完成自动化门禁联调测试')).not.toBeInTheDocument();
  });

  it('点击【📍 定位会议记录】能够唤出对应历史会议纪要并定位到当时发言段落', () => {
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
