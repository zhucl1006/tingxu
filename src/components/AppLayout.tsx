import React, { useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useMeetingStore } from '../store/useMeetingStore';
import { Sidebar } from './Sidebar';
import { HomeView } from './views/HomeView';
import { InMeetingWorkbench } from './InMeetingWorkbench';
import { TasksView } from './views/TasksView';
import { SearchView } from './views/SearchView';
import { BillingView } from './views/BillingView';
import { SettingsView } from './views/SettingsView';
import { MeetingSummaryView } from './views/MeetingSummaryView';

export const AppLayout: React.FC = () => {
  const {
    currentRoute,
    detectedMeetingApp,
    status,
    startMeeting,
    quickStartDetectedMeeting,
    dismissDetectedMeetingApp,
  } = useMeetingStore();

  const handleToggleMaximize = useCallback(() => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      invoke('toggle_maximize_window').catch(() => {
        getCurrentWebviewWindow().toggleMaximize().catch(() => {});
      });
    }
  }, []);

  const handleCloseWindow = useCallback(() => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      invoke('close_window').catch(() => {
        getCurrentWebviewWindow().hide().catch(() => {});
      });
    }
  }, []);

  const handleQuitApp = useCallback(() => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      invoke('quit_app').catch(() => {});
    }
  }, []);

  // 无边框窗口快捷键：Cmd/Ctrl+W 隐藏至托盘，Cmd+Q 退出应用，Cmd/Ctrl+Shift+R 极速开录
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && key === 'w') {
        event.preventDefault();
        handleCloseWindow();
        return;
      }
      if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && key === 'q') {
        event.preventDefault();
        handleQuitApp();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && key === 'r') {
        const target = event.target as HTMLElement | null;
        const isTyping =
          target &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (!isTyping && useMeetingStore.getState().status === 'IDLE') {
          event.preventDefault();
          startMeeting();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleCloseWindow, handleQuitApp, startMeeting]);

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
    <div
      data-testid="app-layout-root"
      className="flex h-screen w-screen bg-canvas text-text-primary overflow-hidden font-sans rounded-xl border border-border-subtle"
    >
      {/* 左侧统一侧边栏导航 */}
      <Sidebar />

      {/* 右侧主业务工作区 */}
      <main data-testid="app-layout-main-viewport" className="flex-1 min-w-0 h-full min-h-0 overflow-hidden flex flex-col">
        {/* 顶部通栏无感原生拖拽区：固定 24px 物理高度，支持双击最大化/还原 */}
        <div
          data-testid="app-layout-header-drag-region"
          data-tauri-drag-region
          onDoubleClick={handleToggleMaximize}
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          className="h-[24px] w-full shrink-0 select-none cursor-move"
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
    </div>
  );
};
