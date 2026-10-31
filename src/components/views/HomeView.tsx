import React, { useState } from 'react';
import { useMeetingStore } from '../../store/useMeetingStore';
import { formatSeconds } from '../../utils/formatTime';

export const HomeView: React.FC = () => {
  const { startMeeting, setCurrentRoute, historyMeetings, tasks, toggleTask } = useMeetingStore();
  const [newTitle, setNewTitle] = useState('季度业务复盘与 AI 工具链规划');

  const pendingTasks = tasks.filter((t) => !t.completed);

  const handleStartNewMeeting = () => {
    startMeeting(newTitle);
    setCurrentRoute('record');
  };

  return (
    <div data-testid="home-page-container" className="flex-1 h-screen overflow-y-auto p-6 space-y-6">
      {/* 顶部欢迎区 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">会议工作台</h1>
          <p className="text-xs text-text-secondary mt-1">
            极简无感录制 · 本地优先存储 · 增量洞察自动提炼
          </p>
        </div>

        <button
          type="button"
          data-testid="home-page-btn-quick-start"
          onClick={handleStartNewMeeting}
          className="px-4 py-2 rounded-lg bg-brand-blue hover:bg-brand-blue-hover text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-all"
        >
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span>立即开启新会议</span>
        </button>
      </div>

      {/* 快捷发起卡片 */}
      <div
        data-testid="home-page-card-launch"
        className="p-5 rounded-xl bg-panel border border-border-subtle shadow-xs space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🎙️</span>
            <span className="text-xs font-semibold text-text-primary">快速开始会议</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-status-success" />
              麦克风就绪
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-status-success" />
              扬声器内录就绪
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            data-testid="home-page-input-meeting-title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="输入会议主题（例如：产品迭代周例会）"
            className="flex-1 px-3.5 py-2.5 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-brand-blue"
          />
          <button
            type="button"
            data-testid="home-page-btn-submit-start"
            onClick={handleStartNewMeeting}
            className="px-5 py-2.5 rounded-lg bg-brand-blue hover:bg-brand-blue-hover text-white text-xs font-semibold whitespace-nowrap shadow-xs transition-all"
          >
            进入会中双栏看板 →
          </button>
        </div>
      </div>

      {/* 双栏内容：近期历史会议 + 近期待办 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧 2 栏：近期历史会议列表 */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <span>📚 近期会议归档</span>
              <span className="text-xs font-normal text-text-tertiary">({historyMeetings.length})</span>
            </h2>
            <button
              type="button"
              data-testid="home-page-btn-view-all-history"
              onClick={() => setCurrentRoute('search')}
              className="text-xs text-brand-blue hover:underline"
            >
              全文检索所有历史 →
            </button>
          </div>

          <div className="space-y-3">
            {historyMeetings.map((m) => (
              <div
                key={m.id}
                data-testid={`home-page-card-history-${m.id}`}
                className="p-4 rounded-xl bg-panel border border-border-subtle hover:border-brand-blue/40 transition-all space-y-2.5 cursor-pointer"
                onClick={() => setCurrentRoute('search')}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-text-primary">{m.title}</h3>
                  <span className="text-[11px] text-text-tertiary font-mono">{m.date}</span>
                </div>

                <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">
                  {m.summary}
                </p>

                <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-[11px] text-text-tertiary">
                  <div className="flex items-center gap-3">
                    <span className="font-mono tabular-nums">⏱ {formatSeconds(m.durationSeconds)}</span>
                    <span>✓ {m.decisionsCount} 项结论</span>
                    <span>☑ {m.tasksCount} 项待办</span>
                  </div>
                  <span className="text-brand-blue font-medium">查看纪要全文 →</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧 1 栏：待办事项卡片 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <span>☑ 待办任务</span>
              <span className="text-xs font-normal text-text-tertiary">({pendingTasks.length})</span>
            </h2>
            <button
              type="button"
              data-testid="home-page-btn-view-all-tasks"
              onClick={() => setCurrentRoute('tasks')}
              className="text-xs text-brand-blue hover:underline"
            >
              管理全部 →
            </button>
          </div>

          <div className="p-4 rounded-xl bg-panel border border-border-subtle space-y-3">
            {pendingTasks.slice(0, 4).map((task) => (
              <div
                key={task.id}
                data-testid={`home-page-task-item-${task.id}`}
                className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-subtle transition-colors group"
              >
                <input
                  type="checkbox"
                  data-testid={`home-page-task-checkbox-${task.id}`}
                  checked={task.completed}
                  onChange={() => toggleTask(task.id)}
                  className="mt-0.5 rounded text-brand-blue focus:ring-0 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-primary leading-snug line-clamp-2">
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-text-tertiary">
                    <span className="px-1.5 py-0.2 rounded bg-subtle">{task.assignee}</span>
                    <span className="truncate">{task.meetingTitle}</span>
                  </div>
                </div>
              </div>
            ))}

            {pendingTasks.length === 0 && (
              <div className="py-6 text-center text-xs text-text-tertiary">
                🎉 太棒了，当前暂无未完成待办！
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
