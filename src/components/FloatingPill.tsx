import React from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import { formatSeconds } from '../utils/formatTime';

export const FloatingPill: React.FC = () => {
  const { elapsedSeconds, status, setActiveWindow, insights } = useMeetingStore();

  const handleExpand = () => {
    setActiveWindow('workbench');
    // If in Tauri environment, invoke toggle_floating_mode(false)
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('toggle_floating_mode', { toFloating: false }).catch(() => {});
      });
    }
  };

  const latestInsight = insights[insights.length - 1];

  return (
    <div
      data-testid="floating-pill-section-container"
      data-tauri-drag-region
      className="h-[42px] px-3.5 bg-canvas-backdrop backdrop-blur-md border border-border-strong rounded-full shadow-lg flex items-center justify-between gap-3 text-xs select-none max-w-sm cursor-move"
    >
      {/* 录音状态红点 */}
      <div className="flex items-center gap-2">
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
        className="flex-1 truncate text-text-secondary text-[11px] px-1"
        title={latestInsight ? latestInsight.title : '听序正在记录中...'}
      >
        {latestInsight ? `💡 ${latestInsight.title}` : '听序正在捕捉发言...'}
      </div>

      {/* 展开为主窗口 */}
      <button
        type="button"
        data-testid="floating-pill-section-btn-expand-workbench"
        onClick={handleExpand}
        className="px-2 py-1 bg-brand-blue-subtle text-brand-blue hover:bg-brand-blue hover:text-white rounded transition-colors text-[11px] font-medium"
      >
        展开
      </button>
    </div>
  );
};
