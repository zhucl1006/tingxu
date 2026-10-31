import React from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import { Sidebar } from './Sidebar';
import { HomeView } from './views/HomeView';
import { InMeetingWorkbench } from './InMeetingWorkbench';
import { TasksView } from './views/TasksView';
import { SearchView } from './views/SearchView';
import { BillingView } from './views/BillingView';
import { SettingsView } from './views/SettingsView';
import { LoginModal } from './LoginModal';
import { GatewayConnectionGuard } from './guards/GatewayConnectionGuard';

export const AppLayout: React.FC = () => {
  const { currentRoute } = useMeetingStore();

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
