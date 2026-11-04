import React from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import { Sidebar } from './Sidebar';
import { HomeView } from './views/HomeView';
import { InMeetingWorkbench } from './InMeetingWorkbench';
import { TasksView } from './views/TasksView';
import { SearchView } from './views/SearchView';
import { BillingView } from './views/BillingView';
import { SettingsView } from './views/SettingsView';
import { MeetingSummaryView } from './views/MeetingSummaryView';
import { LoginModal } from './LoginModal';
import { GatewayConnectionGuard } from './guards/GatewayConnectionGuard';

export const AppLayout: React.FC = () => {
  const {
    currentRoute,
    currentUser,
    isLoginModalOpen,
    setIsLoginModalOpen,
    refreshUserBalance,
    detectedMeetingApp,
    status,
    quickStartDetectedMeeting,
    dismissDetectedMeetingApp,
  } = useMeetingStore();

  // 未登录时强制弹出登录认证，杜绝未登录直接进入业务系统；若已登录则从服务端同步真实时长余额
  React.useEffect(() => {
    if (!currentUser && !isLoginModalOpen) {
      setIsLoginModalOpen(true);
    } else if (currentUser) {
      refreshUserBalance();
    }
  }, [currentUser, isLoginModalOpen, setIsLoginModalOpen, refreshUserBalance]);

  const renderActiveView = () => {
    switch (currentRoute) {
      case 'home':
        return <HomeView />;
      case 'record':
        return <InMeetingWorkbench />;
      case 'tasks':
        return <TasksView />;
      case 'search':
        return <SearchView />;
      case 'billing':
        return <BillingView />;
      case 'settings':
        return <SettingsView />;
      case 'summary':
        return <MeetingSummaryView />;
      default:
        return <HomeView />;
    }
  };

  return (
    <GatewayConnectionGuard>
      <div
        data-testid="app-layout-root"
        className="flex h-screen w-screen bg-canvas text-text-primary overflow-hidden font-sans rounded-xl border border-border-subtle"
      >
        {/* 左侧统一侧边栏导航 */}
        <Sidebar />

        {/* 右侧主业务工作区 */}
        <main data-testid="app-layout-main-viewport" className="flex-1 h-screen overflow-hidden flex flex-col">
          {/* 顶部通栏无感原生拖拽区：与左侧窗口控制条对齐，提供原生标题栏级别拖拽体验 */}
          <div
            data-tauri-drag-region
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            className="h-6 w-full shrink-0 select-none cursor-move"
          />

          {/* 第三方会议软件启动检测横幅 */}
          {status === 'IDLE' && detectedMeetingApp && (
            <div
              data-testid="app-layout-banner-detected-meeting"
              className="bg-status-warning-bg border-b border-status-warning-border px-4 py-2.5 flex items-center justify-between text-xs text-text-primary z-50 flex-shrink-0 animate-fadeIn"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-status-warning animate-pulse" />
                <span>
                  检测到系统已开启 <strong>{detectedMeetingApp.appName}</strong>，是否立即开启会议记录？
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="app-layout-banner-btn-start-detected-meeting"
                  onClick={() => void quickStartDetectedMeeting(detectedMeetingApp)}
                  className="px-3 py-1 bg-brand-blue text-white hover:bg-brand-blue-hover rounded font-medium transition-colors shadow-sm"
                >
                  立即开启会议
                </button>
                <button
                  type="button"
                  data-testid="app-layout-banner-btn-dismiss-detected-meeting"
                  onClick={() => dismissDetectedMeetingApp(detectedMeetingApp.appId)}
                  className="px-2.5 py-1 text-text-secondary hover:text-text-primary hover:bg-subtle rounded transition-colors"
                >
                  暂不记录
                </button>
              </div>
            </div>
          )}

          {renderActiveView()}
        </main>

        {/* 全局登录弹窗 */}
        <LoginModal />
      </div>
    </GatewayConnectionGuard>
  );
};
