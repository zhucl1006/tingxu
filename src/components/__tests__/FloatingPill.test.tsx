import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FloatingPill } from '../FloatingPill';
import { useMeetingStore } from '../../store/useMeetingStore';

const startDraggingMock = vi.fn().mockResolvedValue(undefined);
const invokeMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => invokeMock(...args),
}));
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(() => ({
    startDragging: startDraggingMock,
  })),
}));

describe('FloatingPill - 微型置顶悬浮药丸组件 (TDD & Plan 017)', () => {
  beforeEach(() => {
    useMeetingStore.getState().resetMeeting();
    useMeetingStore.setState({
      detectedMeetingApp: null,
      meetingDetectionSettings: { enabled: true, floatingWidget: true },
      dismissedMeetingAppUntil: {},
    });
  });

  it('会中态：渲染 42px 高度微型胶囊浮条并包含录音红点、秒表与展开按钮', () => {
    useMeetingStore.getState().startMeeting('微型悬浮测试');
    useMeetingStore.getState().tickTimer();

    render(<FloatingPill />);

    const container = screen.getByTestId('floating-pill-section-container');
    expect(container).toBeInTheDocument();
    expect(container.className).toContain('h-[42px]');

    // 录音呼吸指示红点
    expect(screen.getByTestId('floating-pill-section-badge-record-dot')).toBeInTheDocument();

    // 等宽时间跳动
    const timerText = screen.getByTestId('floating-pill-section-text-timer');
    expect(timerText).toBeInTheDocument();
    expect(timerText.className).toContain('tabular-nums');

    // 展开为主窗口按钮
    expect(screen.getByTestId('floating-pill-section-btn-expand-workbench')).toBeInTheDocument();
  });

  it('空闲态常驻挂件：展示听序待机微标与快速开始会议按钮', () => {
    render(<FloatingPill />);

    expect(screen.getByTestId('floating-pill-section-badge-idle-logo')).toBeInTheDocument();
    const quickStartBtn = screen.getByTestId('floating-pill-section-btn-quick-start');
    expect(quickStartBtn).toBeInTheDocument();

    fireEvent.click(quickStartBtn);

    expect(useMeetingStore.getState().status).toBe('RECORDING');
    expect(useMeetingStore.getState().activeWindow).toBe('workbench');
  });

  it('感知态：检测到会议软件启动时展示提示、立即记录与忽略按钮', () => {
    useMeetingStore.setState({
      detectedMeetingApp: {
        appName: 'Microsoft Teams',
        appId: 'teams',
        processName: 'Teams',
      },
    });

    render(<FloatingPill />);

    expect(screen.getByTestId('floating-pill-section-badge-drag-handle')).toBeInTheDocument();
    expect(screen.getByTestId('floating-pill-section-text-detected-app')).toHaveTextContent('Microsoft Teams');

    const quickRecordBtn = screen.getByTestId('floating-pill-section-btn-quick-record');
    const dismissBtn = screen.getByTestId('floating-pill-section-btn-dismiss-detected');
    const expandBtn = screen.getByTestId('floating-pill-section-btn-expand-workbench');

    expect(quickRecordBtn).toBeInTheDocument();
    expect(dismissBtn).toBeInTheDocument();
    expect(expandBtn).toBeInTheDocument();

    // 点击立即记录
    fireEvent.click(quickRecordBtn);
    expect(useMeetingStore.getState().status).toBe('RECORDING');
    expect(useMeetingStore.getState().title).toBe('Microsoft Teams 讨论');
  });

  it('感知态下点击忽略按钮触发 30 分钟防打扰并切回待机挂件态', () => {
    useMeetingStore.setState({
      detectedMeetingApp: {
        appName: '腾讯会议',
        appId: 'wemeet',
        processName: 'wemeetapp',
      },
    });

    const { rerender } = render(<FloatingPill />);
    expect(screen.getByTestId('floating-pill-section-text-detected-app')).toHaveTextContent('腾讯会议');

    const dismissBtn = screen.getByTestId('floating-pill-section-btn-dismiss-detected');
    fireEvent.click(dismissBtn);

    expect(useMeetingStore.getState().detectedMeetingApp).toBeNull();

    // 重新渲染后切回待机常驻挂件
    rerender(<FloatingPill />);
    expect(screen.getByTestId('floating-pill-section-badge-idle-logo')).toBeInTheDocument();
    expect(screen.getByTestId('floating-pill-section-btn-quick-start')).toBeInTheDocument();
  });

  it('点击展开按钮切换窗口状态回主工作台', () => {
    useMeetingStore.getState().startMeeting('展开测试');
    useMeetingStore.getState().setActiveWindow('floating-pill');
    render(<FloatingPill />);

    const expandBtn = screen.getByTestId('floating-pill-section-btn-expand-workbench');
    fireEvent.click(expandBtn);

    expect(useMeetingStore.getState().activeWindow).toBe('workbench');
  });

  it('原生桌面拖动：按住胶囊空白区域触发 startDragging，点击内部按钮时不触发 (TDD & Plan 019)', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    startDraggingMock.mockClear();

    try {
      render(<FloatingPill />);
      const container = screen.getByTestId('floating-pill-section-container');

      // 1. 验证具备 WebKit 底层原生拖拽与 Tauri drag 属性
      expect(container.getAttribute('data-tauri-drag-region')).not.toBeNull();

      // 2. 在胶囊空白区域按下鼠标，应同步调用原生 startDragging
      fireEvent.mouseDown(container, { button: 0 });
      expect(startDraggingMock).toHaveBeenCalledTimes(1);

      // 3. 点击内部展开或开始按钮时，不触发 startDragging，保证交互响应
      const quickStartBtn = screen.getByTestId('floating-pill-section-btn-quick-start');
      fireEvent.mouseDown(quickStartBtn, { button: 0 });
      expect(startDraggingMock).toHaveBeenCalledTimes(1);
    } finally {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    }
  });
});
