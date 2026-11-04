import React from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { useMeetingStore } from '../store/useMeetingStore';

export const WindowControls: React.FC = () => {
  const { toggleFloatingPill } = useMeetingStore();

  const handleClose = () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        invoke('close_window').catch(() => {});
        getCurrentWebviewWindow().close().catch(() => {});
      } catch (err) {
        console.warn('[WindowControls] close failed:', err);
      }
    }
  };

  const handleMinimize = () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        invoke('minimize_window').catch(() => {});
        getCurrentWebviewWindow().minimize().catch(() => {});
      } catch (err) {
        console.warn('[WindowControls] minimize failed:', err);
      }
    }
  };

  const handleToggleFloating = () => {
    toggleFloatingPill(true);
  };

  return (
    <div
      data-testid="app-window-controls-bar"
      data-tauri-drag-region
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      className="flex items-center gap-2 px-1 pt-0.5 pb-2.5 select-none group"
    >
      {/* 关闭按钮（macOS 经典红点） */}
      <button
        type="button"
        data-testid="app-window-controls-btn-close"
        data-no-drag
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onClick={handleClose}
        className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] flex items-center justify-center text-[8px] text-[#730000] font-bold opacity-90 hover:opacity-100 transition-all cursor-pointer shadow-sm active:scale-95"
        title="关闭窗口"
      >
        <span className="opacity-0 group-hover:opacity-100 leading-none">✕</span>
      </button>

      {/* 最小化按钮（macOS 经典黄点） */}
      <button
        type="button"
        data-testid="app-window-controls-btn-minimize"
        data-no-drag
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onClick={handleMinimize}
        className="w-3 h-3 rounded-full bg-[#febc2e] border border-[#d89e24] flex items-center justify-center text-[8px] text-[#784f00] font-bold opacity-90 hover:opacity-100 transition-all cursor-pointer shadow-sm active:scale-95"
        title="最小化"
      >
        <span className="opacity-0 group-hover:opacity-100 leading-none">−</span>
      </button>

      {/* 缩小至悬浮胶囊按钮（macOS 绿点 / 听序核心能力） */}
      <button
        type="button"
        data-testid="app-window-controls-btn-toggle-floating"
        data-no-drag
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onClick={handleToggleFloating}
        className="w-3 h-3 rounded-full bg-[#28c840] border border-[#1aab29] flex items-center justify-center text-[8px] text-[#004f00] font-bold opacity-90 hover:opacity-100 transition-all cursor-pointer shadow-sm active:scale-95"
        title="缩小至桌面极简悬浮胶囊"
      >
        <span className="opacity-0 group-hover:opacity-100 leading-none">⛶</span>
      </button>
    </div>
  );
};
