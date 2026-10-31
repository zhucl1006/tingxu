import React, { useEffect } from 'react';
import { useMeetingStore } from './store/useMeetingStore';
import { AppLayout } from './components/AppLayout';
import { FloatingPill } from './components/FloatingPill';

export const App: React.FC = () => {
  const { activeWindow, setActiveWindow, tickTimer, status } = useMeetingStore();

  // 检查 URL 参数或 Tauri 窗口 label
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const windowParam = params.get('window');
    if (windowParam === 'floating-pill') {
      setActiveWindow('floating-pill');
    }

    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/webviewWindow')
        .then(({ getCurrentWebviewWindow }) => {
          const appWindow = getCurrentWebviewWindow();
          if (appWindow.label === 'floating-pill') {
            setActiveWindow('floating-pill');
          }
        })
        .catch(() => {});
    }
  }, [setActiveWindow]);

  // 会议进行时的统一计时器（每秒 tick）
  useEffect(() => {
    if (status !== 'RECORDING') return;

    const timer = setInterval(() => {
      tickTimer();
    }, 1000);

    return () => clearInterval(timer);
  }, [status, tickTimer]);

  if (activeWindow === 'floating-pill') {
    return (
      <div className="w-screen h-screen flex items-center justify-center p-1 bg-transparent overflow-hidden">
        <FloatingPill />
      </div>
    );
  }

  return <AppLayout />;
};

export default App;
