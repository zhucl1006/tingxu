import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WindowControls } from '../WindowControls';
import { useMeetingStore } from '../../store/useMeetingStore';

const minimizeMock = vi.fn().mockResolvedValue(undefined);
const closeMock = vi.fn().mockResolvedValue(undefined);
const invokeMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => invokeMock(...args),
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(() => ({
    minimize: minimizeMock,
    close: closeMock,
    startDragging: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('WindowControls - 自定义无边框窗口控制组件 (TDD: Custom Window Controls)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMeetingStore.getState().resetMeeting();
    useMeetingStore.getState().setActiveWindow('workbench');
  });

  it('正确渲染符合规范的关闭、最小化、悬浮胶囊三色窗口控制按钮', () => {
    render(<WindowControls />);

    const bar = screen.getByTestId('app-window-controls-bar');
    expect(bar).toBeInTheDocument();

    const closeBtn = screen.getByTestId('app-window-controls-btn-close');
    const minBtn = screen.getByTestId('app-window-controls-btn-minimize');
    const floatBtn = screen.getByTestId('app-window-controls-btn-toggle-floating');

    expect(closeBtn).toBeInTheDocument();
    expect(minBtn).toBeInTheDocument();
    expect(floatBtn).toBeInTheDocument();

    // 具备原生拖拽与防拖拽属性
    expect(bar.getAttribute('data-tauri-drag-region')).not.toBeNull();
    expect(closeBtn.getAttribute('data-no-drag')).not.toBeNull();
    expect(minBtn.getAttribute('data-no-drag')).not.toBeNull();
    expect(floatBtn.getAttribute('data-no-drag')).not.toBeNull();
  });

  it('点击最小化按钮时触发原生最小化动作', () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    try {
      render(<WindowControls />);
      const minBtn = screen.getByTestId('app-window-controls-btn-minimize');
      fireEvent.click(minBtn);

      expect(invokeMock).toHaveBeenCalledWith('minimize_window');
      expect(minimizeMock).toHaveBeenCalled();
    } finally {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    }
  });

  it('点击关闭按钮时触发原生窗口关闭或隐藏动作', () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    try {
      render(<WindowControls />);
      const closeBtn = screen.getByTestId('app-window-controls-btn-close');
      fireEvent.click(closeBtn);

      expect(invokeMock).toHaveBeenCalledWith('close_window');
      expect(closeMock).toHaveBeenCalled();
    } finally {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    }
  });

  it('点击悬浮胶囊按钮时将主窗口切换为桌面极简置顶悬浮药丸态', () => {
    render(<WindowControls />);
    const floatBtn = screen.getByTestId('app-window-controls-btn-toggle-floating');
    fireEvent.click(floatBtn);

    expect(useMeetingStore.getState().activeWindow).toBe('floating-pill');
  });
});
