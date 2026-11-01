import React from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import { NavRoute } from '../types/meeting';

export const Sidebar: React.FC = () => {
  const {
    currentRoute,
    setCurrentRoute,
    status,
    currentUser,
    setIsLoginModalOpen,
    logoutUser,
    quotaMinutes,
    totalQuotaMinutes,
  } = useMeetingStore();

  const navItems: Array<{ id: NavRoute; label: string; icon: string }> = [
    { id: 'home', label: '会议工作台', icon: '▦' },
    { id: 'record', label: '会中实时记录', icon: '◉' },
    { id: 'tasks', label: '我的待办', icon: '☑' },
    { id: 'search', label: '历史检索', icon: '⌕' },
    { id: 'billing', label: '时长与用量', icon: '◇' },
    { id: 'settings', label: '系统设置', icon: '⚙' },
  ];

  const quotaPercent = Math.min(100, Math.round((quotaMinutes / totalQuotaMinutes) * 100));

  return (
    <aside
      data-testid="app-sidebar-container"
      className="w-64 h-screen bg-subtle border-r border-border-subtle flex flex-col justify-between p-3 select-none shrink-0"
    >
      {/* 顶部 Logo 品牌区 */}
      <div>
        <div
          data-testid="app-sidebar-div-brand"
          className="flex items-center gap-2.5 px-3 py-2.5 mb-4 rounded-lg bg-panel border border-border-subtle"
        >
          <div
            data-testid="app-sidebar-div-logo"
            className="w-8 h-8 rounded-lg bg-brand-blue flex items-center justify-center text-white font-bold text-sm shadow-sm"
          >
            听
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-text-primary">听序</div>
            <div className="text-[10px] font-mono tracking-wider text-text-tertiary">TINGXU · AI</div>
          </div>
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
        {/* 会议时长账户用量卡片 */}
        <div
          data-testid="app-sidebar-card-quota"
          className="p-3 rounded-lg bg-panel border border-border-subtle space-y-2"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-text-primary">会议时长额度</span>
            <span className="text-[10px] text-text-tertiary">
              按时长计费
            </span>
          </div>

          <div className="w-full h-1.5 rounded-full bg-subtle overflow-hidden">
            <div
              className="h-full bg-brand-blue transition-all duration-300"
              style={{ width: `${quotaPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-text-secondary">
            <span>剩余 {quotaMinutes} 分钟</span>
            <button
              type="button"
              data-testid="app-sidebar-btn-view-billing"
              onClick={() => setCurrentRoute('billing')}
              className="text-brand-blue hover:underline"
            >
              充值时长 →
            </button>
          </div>
        </div>

        {/* 用户 Profile */}
        <div
          data-testid="app-sidebar-div-user"
          className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-panel transition-colors"
        >
          {currentUser ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                data-testid="app-sidebar-avatar-user"
                className="w-7 h-7 rounded-full bg-brand-blue/20 text-brand-blue font-bold flex items-center justify-center text-xs shrink-0"
              >
                {currentUser.phone.slice(-2)}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-text-primary truncate">
                  {currentUser.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}
                </div>
                <div className="text-[10px] text-text-tertiary">已登录</div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              data-testid="app-sidebar-btn-trigger-login"
              onClick={() => setIsLoginModalOpen(true)}
              className="flex items-center gap-2 text-xs font-semibold text-brand-blue hover:underline"
            >
              <span>👤</span>
              <span>立即登录账号</span>
            </button>
          )}

          {currentUser && (
            <button
              type="button"
              data-testid="app-sidebar-btn-logout"
              onClick={() => {
                logoutUser();
                setIsLoginModalOpen(true);
              }}
              title="退出登录"
              className="text-[11px] text-text-tertiary hover:text-status-danger px-1.5 py-0.5 rounded"
            >
              登出
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
