import React, { useEffect } from 'react';
import { useMeetingStore } from './store/useMeetingStore';
import { useAppearance } from './hooks/useAppearance';
import { AppLayout } from './components/AppLayout';
import { FloatingPill } from './components/FloatingPill';
import { DetectedMeetingApp } from './types/meeting';
import { getMeetingPipelineService } from './audio/meetingPipelineService';

export const App: React.FC = () => {
  useAppearance();

  // 挂载全局常驻会议流与洞察管道服务，实现跨页面路由与胶囊窗体持续录音分析 (020)
  useEffect(() => {
    const pipeline = getMeetingPipelineService();
    pipeline.attach();
  }, []);

  const {
    activeWindow,
    setActiveWindow,
    tickTimer,
    status,
    setDetectedMeetingApp,
  } = useMeetingStore();

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

  // 监听 Tauri 原生进程检测事件（第三方会议软件启动通知）
  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      return;
    }

    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/event')
      .then(({ listen }) => {
        return listen<DetectedMeetingApp | DetectedMeetingApp[] | null>('meeting_app_detected', (event) => {
          const payload = event.payload;
          const app = Array.isArray(payload) ? (payload.length > 0 ? payload[0] : null) : payload;
          setDetectedMeetingApp(app);
        });
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => {
        console.warn('[App] 监听 meeting_app_detected 失败:', err);
      });

    return () => {
      if (unlisten) unlisten();
    };
  }, [setDetectedMeetingApp]);

  // 会议进行时的统一计时器（每秒 tick）
  useEffect(() => {
    if (status !== 'RECORDING') return;

    const timer = setInterval(() => {
      tickTimer();
    }, 1000);

    return () => clearInterval(timer);
  }, [status, tickTimer]);

  // 全场景根节点透明治理：html 与 body 始终保持透明，彻底杜绝主工作台与悬浮胶囊四角露出直角矩形底色
  useEffect(() => {
    document.documentElement.classList.add('bg-transparent');
    document.body.classList.add('bg-transparent');
    document.body.classList.remove('bg-canvas');
    if (activeWindow === 'floating-pill') {
      document.documentElement.classList.add('floating-mode');
      document.body.classList.add('floating-mode');
    } else {
      document.documentElement.classList.remove('floating-mode');
      document.body.classList.remove('floating-mode');
    }
  }, [activeWindow]);

  if (activeWindow === 'floating-pill') {
    return (
      <div
        data-tauri-drag-region
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        className="w-full h-full flex items-center justify-center bg-transparent select-none"
      >
        <FloatingPill />
      </div>
    );
  }

  return <AppLayout />;
};

export default App;
