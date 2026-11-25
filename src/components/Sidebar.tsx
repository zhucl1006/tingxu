import React, { useEffect, useState } from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import { NavRoute } from '../types/meeting';
import { TingxuLogo } from './TingxuLogo';
import { WindowControls } from './WindowControls';

const DUAL_PANE_ROUTES: ReadonlySet<NavRoute> = new Set(['record', 'summary']);
const AUTO_COLLAPSE_DUAL_PANE_WIDTH = 1120;
const AUTO_COLLAPSE_NARROW_WIDTH = 900;

function computeAutoCollapsed(route: NavRoute, width: number): boolean {
  if (width < AUTO_COLLAPSE_NARROW_WIDTH) return true;
  if (DUAL_PANE_ROUTES.has(route) && width < AUTO_COLLAPSE_DUAL_PANE_WIDTH) return true;
  return false;
}

export const Sidebar: React.FC = () => {
  const {
    currentRoute,
    setCurrentRoute,
    status,
    historyMeetings,
    toggleFloatingPill,
  } = useMeetingStore();

  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );
  const [manualCollapsed, setManualCollapsed] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 路由切换时清除一次性手动覆盖，确保进入双栏窄窗能自动让出空间
  useEffect(() => {
    setManualCollapsed(null);
  }, [currentRoute]);

  const autoCollapsed = computeAutoCollapsed(currentRoute, viewportWidth);
  const isCollapsed = manualCollapsed !== null ? manualCollapsed : autoCollapsed;

  const handleToggleCollapse = () => {
    setManualCollapsed(!isCollapsed);
  };

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
      data-collapsed={isCollapsed ? 'true' : 'false'}
      className={`${
        isCollapsed ? 'w-[60px] px-[8px]' : 'w-[220px] px-[12px]'
      } h-full bg-subtle border-r border-border-subtle flex flex-col justify-between py-[12px] select-none shrink-0 transition-[width] duration-200 overflow-hidden`}
    >
      {/* 顶部 Logo 品牌区、原生沉浸窗口控制栏与折叠开关 */}
      <div className="min-w-0">
        <div
          className={`flex ${
            isCollapsed ? 'flex-col items-center gap-1 mb-2' : 'flex-row items-center justify-between gap-1'
          }`}
        >
          <WindowControls />
          <button
            type="button"
            data-testid="app-sidebar-btn-toggle-collapse"
            aria-expanded={!isCollapsed}
            onClick={handleToggleCollapse}
            className={
              isCollapsed
                ? 'w-8 h-6 rounded flex items-center justify-center text-[11px] text-text-secondary hover:text-brand-blue bg-panel border border-border-subtle transition-colors shrink-0'
                : 'mb-2 px-1.5 py-0.5 rounded text-[11px] text-text-tertiary hover:text-text-primary hover:bg-panel border border-transparent hover:border-border-subtle transition-colors shrink-0'
            }
            title={isCollapsed ? '展开侧边栏导航' : '收起侧边栏以释放更多工作台空间'}
          >
            {isCollapsed ? '⇥' : '⇤'}
          </button>
        </div>

        <div
          data-testid="app-sidebar-div-brand"
          className={`flex items-center ${
            isCollapsed ? 'justify-center px-1 py-2' : 'gap-2.5 px-2.5 py-2'
          } mb-3 rounded-lg bg-panel border border-border-subtle`}
          title="听序 AI 会议助手"
        >
          <div
            data-testid="app-sidebar-div-logo"
            className="shrink-0 flex items-center justify-center"
          >
            <TingxuLogo size={isCollapsed ? 26 : 30} />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-tight text-text-primary flex items-center gap-1.5 whitespace-nowrap">
                <span>听序</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded font-sans font-medium bg-brand-blue-subtle text-brand-blue border border-brand-blue/20">
                  AI
                </span>
              </div>
              <div className="text-[10px] font-sans tracking-wide text-text-tertiary truncate">
                会议助手
              </div>
            </div>
          )}
        </div>

        {/* 桌面悬浮条快捷模式切换 */}
        <div className="mb-3">
          <button
            type="button"
            data-testid="app-sidebar-btn-toggle-floating-pill"
            onClick={() => toggleFloatingPill(true)}
            className={`w-full flex items-center ${
              isCollapsed ? 'justify-center px-1.5 py-2' : 'justify-between px-2.5 py-1.5'
            } rounded-lg text-xs font-medium text-text-secondary hover:text-brand-blue bg-panel hover:bg-hover border border-border-subtle transition-all shadow-xs`}
            title="将窗口切换为桌面常驻悬浮药丸，置顶并支持在桌面任意位置自由拖拽"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0">💊</span>
              {!isCollapsed && <span className="truncate">桌面悬浮胶囊</span>}
            </div>
            {!isCollapsed && <span className="text-[10px] text-text-tertiary shrink-0">↗</span>}
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
                title={item.label}
                className={`relative w-full flex items-center ${
                  isCollapsed ? 'justify-center px-1.5 py-2' : 'justify-between px-2.5 py-2'
                } rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-panel text-brand-blue font-semibold border border-border-subtle shadow-xs'
                    : 'text-text-secondary hover:text-text-primary hover:bg-hover'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-base leading-none shrink-0">{item.icon}</span>
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </div>

                {isRecording && (
                  <span
                    className={`w-2 h-2 rounded-full bg-status-danger animate-pulse shrink-0 ${
                      isCollapsed ? 'absolute top-1.5 right-1.5' : ''
                    }`}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 底部用量与用户中心 */}
      <div className="space-y-2.5 pt-2.5 border-t border-border-subtle min-w-0">
        {/* 本地会议时长与用量卡片 */}
        <div
          data-testid="app-sidebar-card-quota"
          className={`${
            isCollapsed ? 'p-1.5 flex items-center justify-center' : 'p-2.5 space-y-1.5'
          } rounded-lg bg-panel border border-border-subtle`}
          title={`已记录 ${totalHours > 0 ? `${totalHours}小时` : ''}${totalMins}分钟 (${allMeetings.length} 场会议)`}
        >
          {isCollapsed ? (
            <button
              type="button"
              data-testid="app-sidebar-btn-view-billing"
              onClick={() => setCurrentRoute('billing')}
              className="w-full py-1 text-xs text-brand-blue hover:opacity-80 flex items-center justify-center"
              title="查看开会时长与用量统计"
            >
              <span>📊</span>
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs gap-1">
                <span className="font-semibold text-text-primary truncate">开会时长与用量</span>
                <span className="text-[10px] text-text-tertiary shrink-0">本地统计</span>
              </div>

              <div className="text-xs text-text-secondary truncate">
                <span>
                  已记录{' '}
                  <strong className="text-text-primary font-mono tabular-nums">
                    {totalHours > 0 ? `${totalHours}小时` : ''}
                    {totalMins}分钟
                  </strong>
                </span>
                <span className="text-text-tertiary ml-1">({allMeetings.length} 场)</span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-text-secondary pt-0.5 gap-1">
                <span className="text-[10px] text-text-tertiary truncate">Token 自备密钥</span>
                <button
                  type="button"
                  data-testid="app-sidebar-btn-view-billing"
                  onClick={() => setCurrentRoute('billing')}
                  className="text-brand-blue hover:underline whitespace-nowrap shrink-0"
                >
                  用量透视 →
                </button>
              </div>
            </>
          )}
        </div>

        {/* 用户 Profile - 单机免登录 */}
        <div
          data-testid="app-sidebar-div-user"
          className={`flex items-center ${
            isCollapsed ? 'justify-center px-1.5 py-2' : 'justify-between px-2.5 py-2'
          } rounded-lg bg-panel border border-border-subtle`}
          title="单机免登录 · 100% 数据本地留存"
        >
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2 min-w-0'}`}>
            <div
              data-testid="app-sidebar-avatar-user"
              className="w-7 h-7 rounded-full bg-status-success/15 text-status-success flex items-center justify-center text-xs shrink-0 font-mono"
            >
              🛡️
            </div>
            {isCollapsed ? (
              <span className="sr-only">单机免登录</span>
            ) : (
              <div className="min-w-0">
                <div className="text-xs font-medium text-text-primary truncate flex items-center gap-1">
                  <span className="truncate">单机免登录</span>
                  <span className="text-[9px] px-1 py-0.2 rounded font-mono bg-status-success/10 text-status-success border border-status-success/20 shrink-0">
                    Local
                  </span>
                </div>
                <div className="text-[10px] text-text-tertiary truncate">
                  100% 数据本地留存
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
