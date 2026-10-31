import React, { useState } from 'react';
import { useMeetingStore } from '../../store/useMeetingStore';

export const TasksView: React.FC = () => {
  const { tasks, toggleTask } = useMeetingStore();
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [searchKw, setSearchKw] = useState('');

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'pending' && t.completed) return false;
    if (filter === 'completed' && !t.completed) return false;
    if (searchKw && !t.title.toLowerCase().includes(searchKw.toLowerCase())) return false;
    return true;
  });

  return (
    <div data-testid="tasks-page-container" className="flex-1 h-screen overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">我的待办任务</h1>
          <p className="text-xs text-text-secondary mt-1">
            由听序会中增量洞察引擎自动萃取，无遗漏追踪行动项
          </p>
        </div>

        <div className="flex gap-2">
          {(['all', 'pending', 'completed'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              data-testid={`tasks-page-tab-${tab}`}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === tab
                  ? 'bg-panel text-brand-blue font-semibold border border-border-subtle shadow-xs'
                  : 'text-text-secondary hover:text-text-primary hover:bg-hover'
              }`}
            >
              {tab === 'all' && `全部 (${tasks.length})`}
              {tab === 'pending' && `进行中 (${tasks.filter((t) => !t.completed).length})`}
              {tab === 'completed' && `已完成 (${tasks.filter((t) => t.completed).length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 rounded-xl bg-panel border border-border-subtle space-y-4">
        <input
          type="text"
          data-testid="tasks-page-input-search"
          value={searchKw}
          onChange={(e) => setSearchKw(e.target.value)}
          placeholder="搜索待办任务或关键词..."
          className="w-full px-3.5 py-2 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-brand-blue"
        />

        <div className="divide-y divide-border-subtle">
          {filteredTasks.map((t) => (
            <div
              key={t.id}
              data-testid={`tasks-page-item-${t.id}`}
              className="py-3 flex items-start gap-3 hover:bg-subtle/50 px-2 rounded-lg transition-colors"
            >
              <input
                type="checkbox"
                data-testid={`tasks-page-checkbox-${t.id}`}
                checked={t.completed}
                onChange={() => toggleTask(t.id)}
                className="mt-1 rounded text-brand-blue cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <p
                  className={`text-xs text-text-primary leading-relaxed ${
                    t.completed ? 'line-through text-text-tertiary' : 'font-medium'
                  }`}
                >
                  {t.title}
                </p>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-text-tertiary">
                  <span className="px-1.5 py-0.2 rounded bg-subtle text-text-secondary">
                    👤 {t.assignee}
                  </span>
                  <span>来自：{t.meetingTitle}</span>
                  <span>创建于：{t.createdAt}</span>
                </div>
              </div>
            </div>
          ))}

          {filteredTasks.length === 0 && (
            <div className="py-12 text-center text-xs text-text-tertiary">
              没有找到匹配的待办任务
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
