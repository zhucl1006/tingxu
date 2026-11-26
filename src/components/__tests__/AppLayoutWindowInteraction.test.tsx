import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppLayout } from '../AppLayout';
import { useMeetingStore } from '../../store/useMeetingStore';

const toggleMaximizeMock = vi.fn().mockResolvedValue(undefined);
const closeMock = vi.fn().mockResolvedValue(undefined);
const minimizeMock = vi.fn().mockResolvedValue(undefined);
const invokeMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(() => ({
    toggleMaximize: toggleMaximizeMock,
    close: closeMock,
    minimize: minimizeMock,
    startDragging: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('AppLayout 自定义无边框窗口交互 (Issue #5 TDD)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMeetingStore.getState().resetMeeting();
    useMeetingStore.getState().setActiveWindow('workbench');
  });

  it('双击顶部标题拖拽区时应触发 toggle_maximize_window 命令', () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    try {
      render(<AppLayout />);
      const dragRegion = screen.getByTestId('app-layout-header-drag-region');
      fireEvent.doubleClick(dragRegion);

      expect(invokeMock).toHaveBeenCalledWith('toggle_maximize_window');
    } finally {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    }
  });

  it('按下 Cmd+W 或 Ctrl+W 快捷键时应触发 close_window 关闭当前窗口', () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    try {
      render(<AppLayout />);

      fireEvent.keyDown(window, { key: 'w', metaKey: true });
      expect(invokeMock).toHaveBeenCalledWith('close_window');

      invokeMock.mockClear();
      fireEvent.keyDown(window, { key: 'W', ctrlKey: true });
      expect(invokeMock).toHaveBeenCalledWith('close_window');
    } finally {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    }
  });
});
