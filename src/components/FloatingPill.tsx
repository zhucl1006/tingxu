import React from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { useMeetingStore } from '../store/useMeetingStore';
import { formatSeconds } from '../utils/formatTime';

export const FloatingPill: React.FC = () => {
  const {
    elapsedSeconds,
    status,
    setActiveWindow,
    insights,
    detectedMeetingApp,
    quickStartDetectedMeeting,
    dismissDetectedMeetingApp,
    startMeeting,
  } = useMeetingStore();

  const handleExpand = () => {
    setActiveWindow('workbench');
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      invoke('toggle_floating_mode', { toFloating: false }).catch(() => {});
    }
  };

  const handleQuickStart = () => {
    startMeeting();
    handleExpand();
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 仅限鼠标主键（左键）
    if (e.button !== 0) return;
    // 若点击的是交互控件（button、带有 data-no-drag 的元素），保留按钮原生点击交互
    if ((e.target as HTMLElement).closest('button, [data-no-drag]')) {
      return;
    }
    // 同步调用 Rust 原生端与 Tauri Window API，确保在当前 MouseDown 事件周期内立即触发 Cocoa 原生拖拽
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        invoke('drag_window').catch(() => {});
        getCurrentWebviewWindow().startDragging().catch(() => {});
      } catch (err) {
        console.warn('[FloatingPill] startDragging failed:', err);
      }
    }
  };

  const latestInsight = insights[insights.length - 1];

  // 1. 空闲态且检测到第三方会议软件启动：高亮感知提示条
  if (status === 'IDLE' && detectedMeetingApp) {
    const meetingName = detectedMeetingApp.appName || '第三方会议';

    return (
      <div
        data-testid="floating-pill-section-container"
        data-tauri-drag-region
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        onMouseDown={handleMouseDown}
        className="h-[42px] px-3 bg-canvas-backdrop backdrop-blur-md border border-status-warning-border rounded-full shadow-lg flex items-center justify-between gap-2 text-xs select-none w-full max-w-sm cursor-move"
      >
        {/* 左侧拖拽把手与会议感知状态 */}
        <div className="flex items-center gap-1.5 truncate flex-1 min-w-0 pointer-events-none">
          <span
            data-testid="floating-pill-section-badge-drag-handle"
            className="text-text-tertiary font-mono text-xs select-none pr-0.5"
            title="按住拖拽悬浮窗"
          >
            ⠿
          </span>
          <span
            data-testid="floating-pill-section-badge-detected-dot"
            className="w-2 h-2 rounded-full bg-status-warning animate-pulse flex-shrink-0"
            title="感知到会议软件已启动"
          />
          <span
            data-testid="floating-pill-section-text-detected-app"
            className="truncate text-[11px] font-medium text-text-primary"
            title={`已检测到 ${meetingName}`}
          >
            开启中: {meetingName}
          </span>
        </div>

        {/* 右侧操作按钮组 */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            data-no-drag
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            data-testid="floating-pill-section-btn-quick-record"
            onClick={() => void quickStartDetectedMeeting(detectedMeetingApp)}
            className="px-2.5 py-1 bg-brand-blue text-white hover:bg-brand-blue-hover rounded-full transition-colors text-[11px] font-medium shadow-sm whitespace-nowrap"
          >
            立即记录
          </button>
          <button
            type="button"
            data-no-drag
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            data-testid="floating-pill-section-btn-expand-workbench"
            onClick={handleExpand}
            className="px-2 py-1 bg-brand-blue-subtle text-brand-blue hover:bg-brand-blue hover:text-white rounded transition-colors text-[11px] font-medium whitespace-nowrap"
            title="展开至主工作台"
          >
            展开
          </button>
          <button
            type="button"
            data-no-drag
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            data-testid="floating-pill-section-btn-dismiss-detected"
            onClick={() => dismissDetectedMeetingApp(detectedMeetingApp.appId)}
            className="px-1.5 py-1 text-text-tertiary hover:text-text-primary rounded hover:bg-subtle transition-colors text-[11px]"
            title="暂不记录（30分钟内不再提醒）"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // 2. 空闲态且无检测到会议：桌面常驻快速开启挂件态
  if (status === 'IDLE') {
    return (
      <div
        data-testid="floating-pill-section-container"
        data-tauri-drag-region
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        onMouseDown={handleMouseDown}
        className="h-[42px] px-3 bg-canvas-backdrop backdrop-blur-md border border-border-strong rounded-full shadow-lg flex items-center justify-between gap-3 text-xs select-none w-full max-w-sm cursor-move"
      >
        <div className="flex items-center gap-2 pointer-events-none">
          <span
            data-testid="floating-pill-section-badge-drag-handle"
            className="text-text-tertiary font-mono text-xs select-none pr-0.5"
            title="按住拖拽悬浮窗"
          >
            ⠿
          </span>
          <span
            data-testid="floating-pill-section-badge-idle-logo"
            className="w-2 h-2 rounded-full bg-brand-blue"
            title="听序待机中"
          />
          <span className="font-medium text-text-secondary text-[11px] tracking-wide">
            听序
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            data-no-drag
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            data-testid="floating-pill-section-btn-quick-start"
            onClick={handleQuickStart}
            className="px-2.5 py-1 bg-brand-blue text-white hover:bg-brand-blue-hover rounded-full transition-colors text-[11px] font-medium flex items-center gap-1 shadow-sm whitespace-nowrap"
          >
            <span>🎙️</span>
            <span>开始会议</span>
          </button>
          <button
            type="button"
            data-no-drag
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            data-testid="floating-pill-section-btn-expand-workbench"
            onClick={handleExpand}
            className="px-2 py-1 bg-brand-blue-subtle text-brand-blue hover:bg-brand-blue hover:text-white rounded transition-colors text-[11px] font-medium whitespace-nowrap"
            title="展开至主工作台"
          >
            展开
          </button>
        </div>
      </div>
    );
  }

  // 3. 会议录音或暂停中：会中实时监控态
  return (
    <div
      data-testid="floating-pill-section-container"
      data-tauri-drag-region
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      onMouseDown={handleMouseDown}
      className="h-[42px] px-3 bg-canvas-backdrop backdrop-blur-md border border-border-strong rounded-full shadow-lg flex items-center justify-between gap-3 text-xs select-none w-full max-w-sm cursor-move"
    >
      {/* 录音状态红点与秒表 */}
      <div className="flex items-center gap-2 pointer-events-none">
        <span
          data-testid="floating-pill-section-badge-drag-handle"
          className="text-text-tertiary font-mono text-xs select-none pr-0.5"
          title="按住拖拽悬浮窗"
        >
          ⠿
        </span>
        <span
          data-testid="floating-pill-section-badge-record-dot"
          className={`w-2.5 h-2.5 rounded-full ${
            status === 'RECORDING'
              ? 'bg-status-danger animate-pulse'
              : 'bg-text-tertiary'
          }`}
          title={status === 'RECORDING' ? '正在录音' : '已暂停'}
        />
        <span
          data-testid="floating-pill-section-text-timer"
          className="font-mono tabular-nums text-text-primary font-medium"
        >
          {formatSeconds(elapsedSeconds)}
        </span>
      </div>

      {/* 最新简报摘要 */}
      <div
        data-testid="floating-pill-section-text-snippet"
        className="flex-1 truncate text-text-secondary text-[11px] px-1 pointer-events-none"
        title={latestInsight ? latestInsight.title : '听序正在记录中...'}
      >
        {latestInsight ? `💡 ${latestInsight.title}` : '听序正在捕捉发言...'}
      </div>

      {/* 展开为主窗口 */}
      <button
        type="button"
        data-no-drag
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        data-testid="floating-pill-section-btn-expand-workbench"
        onClick={handleExpand}
        className="px-2 py-1 bg-brand-blue-subtle text-brand-blue hover:bg-brand-blue hover:text-white rounded transition-colors text-[11px] font-medium flex-shrink-0 whitespace-nowrap"
        title="展开至主工作台"
      >
        展开
      </button>
    </div>
  );
};
