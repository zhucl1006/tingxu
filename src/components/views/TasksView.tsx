import React, { useState } from 'react';
import { useMeetingStore } from '../../store/useMeetingStore';
import type { TaskItem, TaskPriority, TaskStatus, HistoryMeeting } from '../../types/meeting';

export const TasksView: React.FC = () => {
  const {
    tasks,
    toggleTask,
    createTask,
    updateTask,
    deleteTask,
    setTaskStatus,
    batchSetTaskStatus,
    batchDeleteTasks,
    clearCompletedTasks,
    historyMeetings,
    setActiveSummaryMeeting,
    status,
    meetingId,
    setCurrentRoute,
    setHighlightedTranscriptId,
  } = useMeetingStore();

  // 状态筛选 Tab：'all' | 'todo' | 'in_progress' | 'completed'
  const [filter, setFilter] = useState<'all' | 'todo' | 'in_progress' | 'completed'>('all');
  const [searchKw, setSearchKw] = useState('');

  // 多选选中的任务 ID 集合
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 快捷创建状态
  const [quickTitle, setQuickTitle] = useState('');
  const [quickPriority, setQuickPriority] = useState<TaskPriority>('medium');
  const [quickAssignee, setQuickAssignee] = useState('');
  const [quickDueDate, setQuickDueDate] = useState('');
  const [quickDescription, setQuickDescription] = useState('');
  const [showQuickDetails, setShowQuickDetails] = useState(false);

  // 行内编辑状态
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAssignee, setEditAssignee] = useState('');
  const [editPriority, setEditPriority] = useState<TaskPriority>('medium');
  const [editDueDate, setEditDueDate] = useState('');

  // 删除二次确认状态
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // 计算日期快捷填充
  const getRelativeDateStr = (days: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  // 统计数据
  const totalCount = tasks.length;
  const todoCount = tasks.filter((t) => (!t.status || t.status === 'todo') && !t.completed).length;
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;
  const completedCount = tasks.filter((t) => t.completed || t.status === 'done').length;

  const filteredTasks = tasks.filter((t) => {
    const isDone = t.completed || t.status === 'done';
    if (filter === 'todo' && (isDone || t.status === 'in_progress')) return false;
    if (filter === 'in_progress' && t.status !== 'in_progress') return false;
    if (filter === 'completed' && !isDone) return false;

    if (searchKw.trim()) {
      const kw = searchKw.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(kw);
      const matchDesc = t.description?.toLowerCase().includes(kw);
      const matchAssignee = t.assignee?.toLowerCase().includes(kw);
      const matchMeeting = t.meetingTitle?.toLowerCase().includes(kw);
      if (!matchTitle && !matchDesc && !matchAssignee && !matchMeeting) return false;
    }
    return true;
  });

  const isAllFilteredSelected =
    filteredTasks.length > 0 && filteredTasks.every((t) => selectedIds.includes(t.id));

  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      // 取消选择当前筛选的所有项
      const filteredIdSet = new Set(filteredTasks.map((t) => t.id));
      setSelectedIds((prev) => prev.filter((id) => !filteredIdSet.has(id)));
    } else {
      // 全选当前筛选的所有项
      const newSelected = new Set([...selectedIds, ...filteredTasks.map((t) => t.id)]);
      setSelectedIds(Array.from(newSelected));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleQuickAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!quickTitle.trim()) return;

    createTask({
      title: quickTitle,
      description: quickDescription.trim() || undefined,
      priority: quickPriority,
      assignee: quickAssignee.trim() || '本人',
      dueDate: quickDueDate || undefined,
    });

    setQuickTitle('');
    setQuickDescription('');
    setQuickAssignee('');
    setQuickDueDate('');
    setQuickPriority('medium');
    setShowQuickDetails(false);
  };

  const handleStartEdit = (t: TaskItem) => {
    setEditingTaskId(t.id);
    setEditTitle(t.title);
    setEditDescription(t.description || '');
    setEditAssignee(t.assignee || '');
    setEditPriority(t.priority || 'medium');
    setEditDueDate(t.dueDate || '');
  };

  const handleSaveEdit = (id: string) => {
    if (!editTitle.trim()) return;
    updateTask(id, {
      title: editTitle.trim(),
      description: editDescription.trim() || undefined,
      assignee: editAssignee.trim() || '待确认',
      priority: editPriority,
      dueDate: editDueDate || undefined,
    });
    setEditingTaskId(null);
  };

  // 批量操作
  const handleBatchSetStatus = (statusToSet: TaskStatus) => {
    if (selectedIds.length === 0) return;
    if (batchSetTaskStatus) {
      batchSetTaskStatus(selectedIds, statusToSet);
    } else {
      selectedIds.forEach((id) => setTaskStatus(id, statusToSet));
    }
    setSelectedIds([]);
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    if (batchDeleteTasks) {
      batchDeleteTasks(selectedIds);
    } else {
      selectedIds.forEach((id) => deleteTask(id));
    }
    setSelectedIds([]);
  };

  const handleLocateMeeting = (task: TaskItem) => {
    if (status === 'RECORDING' && task.meetingId && task.meetingId === meetingId) {
      if (task.evidenceSegmentId) {
        setHighlightedTranscriptId(task.evidenceSegmentId);
      }
      setCurrentRoute('record');
      return;
    }

    const targetMeeting = historyMeetings.find(
      (m) => (task.meetingId && m.id === task.meetingId) || m.title === task.meetingTitle
    );

    if (targetMeeting) {
      setActiveSummaryMeeting(targetMeeting, task.evidenceSegmentId);
    } else {
      const fallbackMeeting: HistoryMeeting = {
        id: task.meetingId || `mtg_task_${task.id}`,
        title: task.meetingTitle,
        date: task.createdAt,
        durationSeconds: 0,
        summary: `待办来源会议：「${task.meetingTitle}」`,
        decisionsCount: 0,
        tasksCount: 1,
        structuredSummary: {
          suggestedTitle: task.meetingTitle,
          overview: `本场会议提炼待办：“${task.title}”，负责人：${task.assignee}。`,
          decisions: [],
          actions: [{ title: task.title, assignee: task.assignee, dueDate: task.dueDate || '尽快跟进' }],
          risks: [],
          facts: [],
        },
      };
      setActiveSummaryMeeting(fallbackMeeting, task.evidenceSegmentId);
    }
  };

  return (
    <div data-testid="tasks-page-container" className="flex-1 h-screen overflow-y-auto p-6 space-y-5 bg-canvas select-none">
      {/* 顶部标题与仪表盘 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">我的待办任务</h1>
          <p className="text-xs text-text-secondary mt-1">
            智能提炼与人工复核相结合的高效任务工作台，支持多行备注、状态推进与批量多选流转
          </p>
        </div>

        {/* 统计指标胶囊 */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel border border-border-subtle text-xs shadow-2xs">
            <span className="text-text-secondary">待办</span>
            <span className="font-bold text-brand-blue font-mono tabular-nums">{todoCount}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel border border-border-subtle text-xs shadow-2xs">
            <span className="text-text-secondary">进行中</span>
            <span className="font-bold text-amber-600 dark:text-amber-400 font-mono tabular-nums">{inProgressCount}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel border border-border-subtle text-xs shadow-2xs">
            <span className="text-text-secondary">已完成</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">{completedCount}</span>
          </div>
          {completedCount > 0 && (
            <button
              type="button"
              data-testid="tasks-page-btn-clear-completed"
              onClick={clearCompletedTasks}
              className="px-2.5 py-1.5 rounded-lg border border-border-subtle hover:border-status-danger/40 text-text-tertiary hover:text-status-danger hover:bg-subtle text-xs font-medium transition-colors shadow-2xs flex items-center gap-1"
              title="清理所有已完成的待办事项"
            >
              <span>🧹 清理已完成</span>
            </button>
          )}
        </div>
      </div>

      {/* 批量操作悬浮条 (Batch Action Bar) */}
      {selectedIds.length > 0 && (
        <div
          data-testid="tasks-page-toolbar-batch-actions"
          className="sticky top-2 z-20 p-3 rounded-xl bg-panel border-2 border-brand-blue/60 shadow-lg flex flex-wrap items-center justify-between gap-3 animate-fadeIn"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
            <span className="w-2 h-2 rounded-full bg-brand-blue animate-pulse" />
            <span data-testid="tasks-page-text-batch-selected-count">已选择 {selectedIds.length} 项待办任务</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              data-testid="tasks-page-btn-batch-in-progress"
              onClick={() => handleBatchSetStatus('in_progress')}
              className="px-2.5 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-xs font-medium transition-colors flex items-center gap-1"
            >
              <span>▶ 推进至进行中</span>
            </button>
            <button
              type="button"
              data-testid="tasks-page-btn-batch-done"
              onClick={() => handleBatchSetStatus('done')}
              className="px-2.5 py-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-colors flex items-center gap-1"
            >
              <span>✓ 标记为已完成</span>
            </button>
            <button
              type="button"
              data-testid="tasks-page-btn-batch-todo"
              onClick={() => handleBatchSetStatus('todo')}
              className="px-2.5 py-1 rounded-md bg-subtle hover:bg-hover text-text-secondary text-xs font-medium transition-colors flex items-center gap-1"
            >
              <span>○ 设为待办</span>
            </button>
            <button
              type="button"
              data-testid="tasks-page-btn-batch-delete"
              onClick={handleBatchDelete}
              className="px-2.5 py-1 rounded-md bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors flex items-center gap-1"
            >
              <span>🗑️ 批量删除</span>
            </button>
            <button
              type="button"
              data-testid="tasks-page-btn-batch-deselect"
              onClick={() => setSelectedIds([])}
              className="px-2 py-1 rounded-md text-text-tertiary hover:text-text-primary text-xs transition-colors"
            >
              ✕ 取消
            </button>
          </div>
        </div>
      )}

      {/* 快速添加栏 (Quick Add) */}
      <form
        onSubmit={handleQuickAdd}
        className="p-4 rounded-xl bg-panel border border-border-subtle shadow-xs space-y-3"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-brand-blue text-sm">✦</span>
            <span className="text-xs font-semibold text-text-primary">快速记录新待办</span>
          </div>
          <button
            type="button"
            data-testid="tasks-page-btn-toggle-quick-details"
            onClick={() => setShowQuickDetails(!showQuickDetails)}
            className="text-[11px] text-text-tertiary hover:text-brand-blue transition-colors flex items-center gap-0.5"
          >
            <span>{showQuickDetails ? '收起详情 ▴' : '+ 补充多行备注 ▾'}</span>
          </button>
        </div>

        {/* 标题输入行 */}
        <div className="flex flex-col sm:flex-row items-center gap-2">
          <input
            type="text"
            data-testid="tasks-page-input-quick-title"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder="输入待办任务标题，按 Enter 快速创建..."
            className="flex-1 w-full px-3 py-2 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-brand-blue transition-colors"
          />

          <button
            type="submit"
            data-testid="tasks-page-btn-quick-add"
            disabled={!quickTitle.trim()}
            className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-medium shrink-0 transition-all ${
              quickTitle.trim()
                ? 'bg-brand-blue text-white shadow-2xs hover:bg-brand-blue/90'
                : 'bg-subtle text-text-tertiary cursor-not-allowed'
            }`}
          >
            + 添加待办
          </button>
        </div>

        {/* 属性选择栏：优先级直接胶囊直选 + 日期控件 + 负责人 */}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
          {/* 优先级直选胶囊 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-text-tertiary">优先级:</span>
            <div className="flex items-center gap-1 bg-subtle p-0.5 rounded-lg border border-border-subtle">
              <button
                type="button"
                data-testid="tasks-page-btn-quick-priority-high"
                onClick={() => setQuickPriority('high')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                  quickPriority === 'high'
                    ? 'bg-rose-500 text-white shadow-2xs'
                    : 'text-text-secondary hover:text-rose-600'
                }`}
              >
                🔴 P1 高
              </button>
              <button
                type="button"
                data-testid="tasks-page-btn-quick-priority-medium"
                onClick={() => setQuickPriority('medium')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                  quickPriority === 'medium'
                    ? 'bg-amber-500 text-white shadow-2xs'
                    : 'text-text-secondary hover:text-amber-600'
                }`}
              >
                🟡 P2 中
              </button>
              <button
                type="button"
                data-testid="tasks-page-btn-quick-priority-low"
                onClick={() => setQuickPriority('low')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                  quickPriority === 'low'
                    ? 'bg-text-secondary text-white shadow-2xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                ⚪ P3 低
              </button>
            </div>
          </div>

          {/* 截止时间原生日期控件与快捷填充 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-text-tertiary">截止日期:</span>
            <input
              type="date"
              data-testid="tasks-page-input-quick-duedate"
              value={quickDueDate}
              onChange={(e) => setQuickDueDate(e.target.value)}
              className="px-2 py-1 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-brand-blue"
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="tasks-page-btn-quick-date-today"
                onClick={() => setQuickDueDate(getRelativeDateStr(0))}
                className="px-1.5 py-0.5 rounded bg-subtle text-text-secondary hover:text-brand-blue hover:bg-hover text-[10px]"
              >
                今天
              </button>
              <button
                type="button"
                data-testid="tasks-page-btn-quick-date-tomorrow"
                onClick={() => setQuickDueDate(getRelativeDateStr(1))}
                className="px-1.5 py-0.5 rounded bg-subtle text-text-secondary hover:text-brand-blue hover:bg-hover text-[10px]"
              >
                明天
              </button>
              <button
                type="button"
                data-testid="tasks-page-btn-quick-date-nextweek"
                onClick={() => setQuickDueDate(getRelativeDateStr(7))}
                className="px-1.5 py-0.5 rounded bg-subtle text-text-secondary hover:text-brand-blue hover:bg-hover text-[10px]"
              >
                下周
              </button>
            </div>
          </div>

          {/* 负责人 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-text-tertiary">负责人:</span>
            <input
              type="text"
              data-testid="tasks-page-input-quick-assignee"
              value={quickAssignee}
              onChange={(e) => setQuickAssignee(e.target.value)}
              placeholder="默认本人"
              className="w-24 px-2 py-1 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-brand-blue"
            />
          </div>
        </div>

        {/* 展开多行备注 Textarea */}
        {showQuickDetails && (
          <div className="pt-1 animate-fadeIn">
            <textarea
              data-testid="tasks-page-textarea-quick-description"
              value={quickDescription}
              onChange={(e) => setQuickDescription(e.target.value)}
              rows={3}
              placeholder="补充执行要点、上下文或验收基准（支持多行输入与换行）..."
              className="w-full px-3 py-2 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-brand-blue transition-colors resize-y"
            />
          </div>
        )}
      </form>

      {/* 搜索与过滤 Tab */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-panel p-1 rounded-lg border border-border-subtle shadow-2xs">
          <button
            type="button"
            data-testid="tasks-page-tab-all"
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
              filter === 'all'
                ? 'bg-brand-blue text-white shadow-2xs font-semibold'
                : 'text-text-secondary hover:text-text-primary hover:bg-subtle'
            }`}
          >
            全部 ({totalCount})
          </button>
          <button
            type="button"
            data-testid="tasks-page-tab-todo"
            onClick={() => setFilter('todo')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
              filter === 'todo'
                ? 'bg-brand-blue text-white shadow-2xs font-semibold'
                : 'text-text-secondary hover:text-text-primary hover:bg-subtle'
            }`}
          >
            待办 ({todoCount})
          </button>
          <button
            type="button"
            data-testid="tasks-page-tab-in_progress"
            onClick={() => setFilter('in_progress')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
              filter === 'in_progress'
                ? 'bg-brand-blue text-white shadow-2xs font-semibold'
                : 'text-text-secondary hover:text-text-primary hover:bg-subtle'
            }`}
          >
            进行中 ({inProgressCount})
          </button>
          <button
            type="button"
            data-testid="tasks-page-tab-completed"
            onClick={() => setFilter('completed')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
              filter === 'completed'
                ? 'bg-brand-blue text-white shadow-2xs font-semibold'
                : 'text-text-secondary hover:text-text-primary hover:bg-subtle'
            }`}
          >
            已完成 ({completedCount})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {filteredTasks.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-panel border border-border-subtle text-xs text-text-secondary shadow-2xs">
              <input
                type="checkbox"
                data-testid="tasks-page-checkbox-select-all"
                checked={isAllFilteredSelected}
                onChange={handleToggleSelectAll}
                className="w-3.5 h-3.5 rounded text-brand-blue cursor-pointer"
                title="全选当前列表所有待办"
              />
              <span className="text-[11px]">全选本页</span>
            </div>
          )}

          <div className="w-full sm:w-64">
            <input
              type="text"
              data-testid="tasks-page-input-search"
              value={searchKw}
              onChange={(e) => setSearchKw(e.target.value)}
              placeholder="搜索待办任务、备注或来源..."
              className="w-full px-3 py-1.5 rounded-lg bg-panel border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-brand-blue transition-colors shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* 待办任务卡片列表 */}
      <div className="space-y-2.5">
        {filteredTasks.map((t) => {
          const isDone = t.completed || t.status === 'done';
          const isInProgress = t.status === 'in_progress';
          const isEditing = editingTaskId === t.id;
          const isSelected = selectedIds.includes(t.id);

          return (
            <div
              key={t.id}
              data-testid={`tasks-page-item-${t.id}`}
              className={`p-3.5 rounded-xl border transition-all ${
                isSelected
                  ? 'bg-brand-blue/5 border-brand-blue shadow-xs'
                  : isDone
                  ? 'bg-subtle/40 border-border-subtle/60 opacity-75'
                  : isInProgress
                  ? 'bg-panel border-amber-500/40 shadow-xs'
                  : 'bg-panel border-border-subtle hover:border-brand-blue/40 shadow-xs'
              }`}
            >
              {isEditing ? (
                /* 多行行内编辑模式 */
                <div className="space-y-3 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-brand-blue">✏️ 编辑待办事项</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        data-testid={`tasks-page-btn-cancel-edit-${t.id}`}
                        onClick={() => setEditingTaskId(null)}
                        className="px-2.5 py-1 rounded bg-subtle text-text-secondary hover:bg-hover text-xs"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        data-testid={`tasks-page-btn-save-edit-${t.id}`}
                        onClick={() => handleSaveEdit(t.id)}
                        className="px-3 py-1 rounded bg-brand-blue text-white text-xs font-medium shadow-2xs hover:bg-brand-blue/90"
                      >
                        保存更新
                      </button>
                    </div>
                  </div>

                  {/* 标题 */}
                  <input
                    type="text"
                    data-testid={`tasks-page-input-edit-title-${t.id}`}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-subtle border border-brand-blue text-xs text-text-primary focus:outline-none"
                    placeholder="待办任务标题"
                  />

                  {/* 多行备注 Textarea */}
                  <div>
                    <label className="text-[10px] text-text-tertiary block mb-1">
                      补充细节与执行要点（多行输入）:
                    </label>
                    <textarea
                      data-testid={`tasks-page-textarea-edit-description-${t.id}`}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={3}
                      placeholder="支持换行输入背景说明、负责人联系方式或执行备忘..."
                      className="w-full px-3 py-2 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-brand-blue resize-y"
                    />
                  </div>

                  {/* 属性：优先级直接胶囊直选 + 负责人 + 原生日期时间控件 */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="text-[10px] text-text-tertiary block mb-1">优先级:</label>
                      <div className="flex items-center gap-1 bg-subtle p-0.5 rounded-lg border border-border-subtle">
                        <button
                          type="button"
                          data-testid={`tasks-page-btn-edit-priority-high-${t.id}`}
                          onClick={() => setEditPriority('high')}
                          className={`flex-1 py-1 rounded text-[11px] font-semibold text-center transition-all ${
                            editPriority === 'high'
                              ? 'bg-rose-500 text-white shadow-2xs'
                              : 'text-text-secondary hover:text-rose-600'
                          }`}
                        >
                          🔴 高
                        </button>
                        <button
                          type="button"
                          data-testid={`tasks-page-btn-edit-priority-medium-${t.id}`}
                          onClick={() => setEditPriority('medium')}
                          className={`flex-1 py-1 rounded text-[11px] font-semibold text-center transition-all ${
                            editPriority === 'medium'
                              ? 'bg-amber-500 text-white shadow-2xs'
                              : 'text-text-secondary hover:text-amber-600'
                          }`}
                        >
                          🟡 中
                        </button>
                        <button
                          type="button"
                          data-testid={`tasks-page-btn-edit-priority-low-${t.id}`}
                          onClick={() => setEditPriority('low')}
                          className={`flex-1 py-1 rounded text-[11px] font-medium text-center transition-all ${
                            editPriority === 'low'
                              ? 'bg-text-secondary text-white shadow-2xs'
                              : 'text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          ⚪ 低
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-text-tertiary block mb-1">截止日期:</label>
                      <input
                        type="date"
                        data-testid={`tasks-page-input-edit-duedate-${t.id}`}
                        value={editDueDate}
                        onChange={(e) => setEditDueDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-brand-blue"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-text-tertiary block mb-1">负责人:</label>
                      <input
                        type="text"
                        data-testid={`tasks-page-input-edit-assignee-${t.id}`}
                        value={editAssignee}
                        onChange={(e) => setEditAssignee(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-brand-blue"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* 默认展示模式 */
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* 多选 Checkbox */}
                    <input
                      type="checkbox"
                      data-testid={`tasks-page-checkbox-select-${t.id}`}
                      checked={isSelected}
                      onChange={() => handleToggleSelectOne(t.id)}
                      className="mt-1 w-3.5 h-3.5 rounded text-brand-blue cursor-pointer shrink-0 border-border-subtle"
                      title="选中以便批量推进或删除"
                    />

                    {/* 状态复选框 */}
                    <input
                      type="checkbox"
                      data-testid={`tasks-page-checkbox-${t.id}`}
                      checked={isDone}
                      onChange={() => toggleTask(t.id)}
                      className="mt-1 w-4 h-4 rounded text-brand-blue cursor-pointer shrink-0 border-border-subtle"
                      title={isDone ? '标记为未完成' : '标记为已完成'}
                    />

                    {/* 标题与细节 */}
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* 优先级徽章 */}
                        {t.priority === 'high' ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            P1 高
                          </span>
                        ) : t.priority === 'low' ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-subtle text-text-tertiary border border-border-subtle">
                            P3 低
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            P2 中
                          </span>
                        )}

                        {/* 状态标识 */}
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                            isInProgress
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold border border-amber-500/30'
                              : isDone
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-500/30'
                              : 'bg-subtle text-text-secondary border border-border-subtle'
                          }`}
                        >
                          {isInProgress ? '⚡ 进行中' : isDone ? '✓ 已完成' : '○ 待办'}
                        </span>

                        <span
                          className={`text-xs leading-relaxed break-words font-medium ${
                            isDone ? 'line-through text-text-tertiary' : 'text-text-primary'
                          }`}
                        >
                          {t.title}
                        </span>
                      </div>

                      {/* 描述信息（多行文本展示） */}
                      {t.description && (
                        <p className="text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap bg-subtle/40 p-2 rounded-lg border border-border-subtle/50">
                          {t.description}
                        </p>
                      )}

                      {/* 元信息条目 */}
                      <div className="flex items-center gap-3 text-[11px] text-text-tertiary flex-wrap pt-0.5">
                        <span className="px-1.5 py-0.5 rounded bg-subtle text-text-secondary">
                          👤 {t.assignee || '待确认'}
                        </span>

                        {t.dueDate && (
                          <span className="px-1.5 py-0.5 rounded bg-subtle text-text-secondary font-mono">
                            📅 {t.dueDate}
                          </span>
                        )}

                        <span className="text-text-tertiary">
                          🎙️ {t.meetingTitle || '独立任务'}
                        </span>

                        <span className="text-text-tertiary font-mono text-[10px]">
                          {t.createdAt}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 右侧显式动作工具栏 */}
                  <div className="flex items-center gap-1.5 shrink-0 self-center">
                    {/* 显式推进状态按钮 (用户重点需求) */}
                    {!isDone && !isInProgress && (
                      <button
                        type="button"
                        data-testid={`tasks-page-btn-advance-progress-${t.id}`}
                        onClick={() => setTaskStatus(t.id, 'in_progress')}
                        className="px-2.5 py-1 text-xs rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-medium shrink-0 flex items-center gap-1 transition-colors shadow-2xs"
                        title="将此任务推进为进行中状态"
                      >
                        <span>▶ 推进到进行中</span>
                      </button>
                    )}

                    {isInProgress && (
                      <button
                        type="button"
                        data-testid={`tasks-page-btn-advance-done-${t.id}`}
                        onClick={() => setTaskStatus(t.id, 'done')}
                        className="px-2.5 py-1 text-xs rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-medium shrink-0 flex items-center gap-1 transition-colors shadow-2xs"
                        title="将此进行中任务标记为已完成"
                      >
                        <span>✓ 标记完成</span>
                      </button>
                    )}

                    {isDone && (
                      <button
                        type="button"
                        data-testid={`tasks-page-btn-reopen-${t.id}`}
                        onClick={() => setTaskStatus(t.id, 'todo')}
                        className="px-2.5 py-1 text-xs rounded-lg bg-subtle hover:bg-hover text-text-secondary border border-border-subtle font-medium shrink-0 flex items-center gap-1 transition-colors shadow-2xs"
                        title="重新开启此任务"
                      >
                        <span>↩ 重新开启</span>
                      </button>
                    )}

                    {/* 定位会议记录 */}
                    {t.meetingTitle && t.meetingTitle !== '独立待办任务' && (
                      <button
                        type="button"
                        data-testid={`tasks-page-btn-locate-meeting-${t.id}`}
                        onClick={() => handleLocateMeeting(t)}
                        className="px-2 py-1 text-xs rounded-lg bg-panel border border-border-subtle hover:bg-hover hover:border-brand-blue/30 text-brand-blue font-medium shrink-0 flex items-center gap-1 transition-colors shadow-2xs"
                        title="打开该待办来源会议记录，并定位到当时发言"
                      >
                        <span>📍 定位会议记录</span>
                      </button>
                    )}

                    {/* 编辑按钮 */}
                    <button
                      type="button"
                      data-testid={`tasks-page-btn-edit-${t.id}`}
                      onClick={() => handleStartEdit(t)}
                      className="p-1.5 rounded-lg text-text-tertiary hover:text-brand-blue hover:bg-hover text-xs transition-colors"
                      title="编辑修改此待办（包含多行备注、优先级与期限）"
                    >
                      ✏️
                    </button>

                    {/* 删除按钮 */}
                    {confirmDeleteId === t.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          data-testid={`tasks-page-btn-confirm-delete-${t.id}`}
                          onClick={() => {
                            deleteTask(t.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2 py-0.5 rounded bg-status-danger text-white text-[10px] font-medium"
                        >
                          确认删
                        </button>
                        <button
                          type="button"
                          data-testid={`tasks-page-btn-cancel-delete-${t.id}`}
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-1.5 py-0.5 rounded bg-subtle text-text-secondary text-[10px]"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        data-testid={`tasks-page-btn-delete-${t.id}`}
                        onClick={() => deleteTask(t.id)}
                        className="p-1.5 rounded-lg text-text-tertiary hover:text-status-danger hover:bg-rose-50 dark:hover:bg-rose-950/20 text-xs transition-colors"
                        title="删除该待办"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* 空状态 */}
        {filteredTasks.length === 0 && (
          <div className="py-16 text-center rounded-xl bg-panel border border-dashed border-border-subtle space-y-2">
            <span className="text-3xl block">📋</span>
            <p className="text-xs text-text-secondary font-medium">
              {searchKw ? '未搜索到匹配的待办任务' : '当前暂无待办任务'}
            </p>
            <p className="text-[11px] text-text-tertiary">
              在上方快速录入新任务，或在会议总结中一键采纳 AI 提炼的行动建议
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
