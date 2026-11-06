import React from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import { NavRoute } from '../types/meeting';
import { TingxuLogo } from './TingxuLogo';
import { WindowControls } from './WindowControls';

export const Sidebar: React.FC = () => {
  const {
    currentRoute,
    setCurrentRoute,
    status,
    historyMeetings,
    toggleFloatingPill,
  } = useMeetingStore();

  const navItems: Array<{ id: NavRoute; label: string; icon: string }> = [
    { id: 'home', label: '会议工作台', icon: '▦' },
    { id: 'record', label: '会中实时记录', icon: '◉' },
    { id: 'tasks', label: '我的待办', icon: '☑' },
    { id: 'search', label: '历史检索', icon: '⌕' },
    { id: 'billing', label: '时长与用量', icon: '◇' },
    { id: 'settings', label: '系统设置', icon: '⚙' },
  ];

  // 统计本地历史会议时长与场次
  const allMeetings = historyMeetings || [];
  const totalRecordedSeconds = allMeetings.reduce(
    (acc, m) => acc + (m.durationSeconds || 0),
    0
  );
  const totalHours = Math.floor(totalRecordedSeconds / 3600);
  const totalMins = Math.floor((totalRecordedSeconds % 3600) / 60);

  return (
    <aside
      data-testid="app-sidebar-container"
      className="w-64 h-screen bg-subtle border-r border-border-subtle flex flex-col justify-between p-3 select-none shrink-0"
    >
      {/* 顶部 Logo 品牌区与原生沉浸窗口控制栏 */}
      <div>
        <WindowControls />

        <div
          data-testid="app-sidebar-div-brand"
          className="flex items-center gap-2.5 px-3 py-2.5 mb-4 rounded-lg bg-panel border border-border-subtle"
        >
          <div
            data-testid="app-sidebar-div-logo"
            className="shrink-0 flex items-center justify-center"
          >
            <TingxuLogo size={32} />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-text-primary flex items-center gap-1.5">
              <span>听序</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-sans font-medium bg-brand-blue-subtle text-brand-blue border border-brand-blue/20">
                AI
              </span>
            </div>
            <div className="text-[10px] font-sans tracking-wide text-text-tertiary">会议助手</div>
          </div>
        </div>

        {/* 桌面悬浮条快捷模式切换 */}
        <div className="mb-3 px-1">
          <button
            type="button"
            data-testid="app-sidebar-btn-toggle-floating-pill"
            onClick={() => toggleFloatingPill(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-text-secondary hover:text-brand-blue bg-panel hover:bg-hover border border-border-subtle transition-all shadow-xs"
            title="将窗口切换为桌面常驻悬浮药丸，置顶并支持在桌面任意位置自由拖拽"
          >
            <div className="flex items-center gap-2">
              <span>💊</span>
              <span>切换为桌面悬浮胶囊</span>
            </div>
            <span className="text-[10px] text-text-tertiary">↗</span>
          </button>
        </div>

        {/* 导航菜单列表 */}
        <nav data-testid="app-sidebar-nav-list" className="space-y-1">
          {navItems.map((item) => {
            const isActive = currentRoute === item.id;
            const isRecording = item.id === 'record' && status === 'RECORDING';

            return (
              <button
                key={item.id}
                type="button"
                data-testid={`app-sidebar-btn-nav-${item.id}`}
                onClick={() => setCurrentRoute(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-panel text-brand-blue font-semibold border border-border-subtle shadow-xs'
                    : 'text-text-secondary hover:text-text-primary hover:bg-hover'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base leading-none">{item.icon}</span>
                  <span>{item.label}</span>
                </div>

                {isRecording && (
                  <span className="w-2 h-2 rounded-full bg-status-danger animate-pulse" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 底部用量与用户中心 */}
      <div className="space-y-3 pt-3 border-t border-border-subtle">
        {/* 本地会议时长与用量卡片 */}
        <div
          data-testid="app-sidebar-card-quota"
          className="p-3 rounded-lg bg-panel border border-border-subtle space-y-2"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-text-primary">开会时长与用量</span>
            <span className="text-[10px] text-text-tertiary">
              本地统计
            </span>
          </div>

          <div className="text-xs text-text-secondary">
            <span>
              已记录{' '}
              <strong className="text-text-primary font-mono tabular-nums">
                {totalHours > 0 ? `${totalHours}小时` : ''}{totalMins}分钟
              </strong>
            </span>
            <span className="text-text-tertiary ml-1.5">
              ({allMeetings.length} 场会议)
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-text-secondary pt-0.5">
            <span className="text-[10px] text-text-tertiary">Token 自备密钥</span>
            <button
              type="button"
              data-testid="app-sidebar-btn-view-billing"
              onClick={() => setCurrentRoute('billing')}
              className="text-brand-blue hover:underline"
            >
              用量透视 →
            </button>
          </div>
        </div>

        {/* 用户 Profile - 单机免登录 */}
        <div
          data-testid="app-sidebar-div-user"
          className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-panel border border-border-subtle"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              data-testid="app-sidebar-avatar-user"
              className="w-7 h-7 rounded-full bg-status-success/15 text-status-success flex items-center justify-center text-xs shrink-0 font-mono"
            >
              🛡️
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-text-primary truncate flex items-center gap-1">
                <span>单机免登录</span>
                <span className="text-[9px] px-1 py-0.2 rounded font-mono bg-status-success/10 text-status-success border border-status-success/20">
                  Local
                </span>
              </div>
              <div className="text-[10px] text-text-tertiary truncate">
                100% 数据本地留存
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
