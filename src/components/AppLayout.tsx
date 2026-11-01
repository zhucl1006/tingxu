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
  const { currentRoute, currentUser, isLoginModalOpen, setIsLoginModalOpen, refreshUserBalance } = useMeetingStore();

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
        className="flex h-screen w-screen bg-canvas text-text-primary overflow-hidden font-sans"
      >
        {/* 左侧统一侧边栏导航 */}
        <Sidebar />

        {/* 右侧主业务工作区 */}
        <main data-testid="app-layout-main-viewport" className="flex-1 h-screen overflow-hidden flex flex-col">
          {renderActiveView()}
        </main>

        {/* 全局登录弹窗 */}
        <LoginModal />
      </div>
    </GatewayConnectionGuard>
  );
};
