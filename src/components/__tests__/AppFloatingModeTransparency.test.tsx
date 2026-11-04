import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { App } from '../../App';
import { useMeetingStore } from '../../store/useMeetingStore';
import { resetMeetingPipelineService } from '../../audio/meetingPipelineService';

const startDraggingMock = vi.fn().mockResolvedValue(undefined);
const invokeMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => invokeMock(...args),
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(() => ({
    startDragging: startDraggingMock,
    label: 'main',
    hide: vi.fn().mockResolvedValue(undefined),
    show: vi.fn().mockResolvedValue(undefined),
    setFocus: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('App 悬浮胶囊透明背景与工作台形态切换 (TDD: Floating Pill Transparency)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetMeetingPipelineService();

    vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/gateway/v1/health')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', service: 'tingxu-ai-gateway' }),
        } as any;
      }
      return { ok: true, status: 200, json: async () => ({ code: 0 }) } as any;
    });

    useMeetingStore.getState().resetMeeting();
    useMeetingStore.getState().loginUser({
      userId: 'test_user_transparency',
      token: 'jwt_valid',
      phone: '13800000000',
    });
    useMeetingStore.getState().setActiveWindow('workbench');

    document.documentElement.className = '';
    document.body.className = 'bg-canvas';
  });

  afterEach(() => {
    resetMeetingPipelineService();
    vi.restoreAllMocks();
  });

  it('在主工作台态下，html与body保持透明契约bg-transparent且无bg-canvas，杜绝圆角外侧露出直角白底', async () => {
    render(<App />);

    expect(document.body.classList.contains('bg-transparent')).toBe(true);
    expect(document.body.classList.contains('bg-canvas')).toBe(false);
    expect(document.body.classList.contains('floating-mode')).toBe(false);
    expect(document.documentElement.classList.contains('floating-mode')).toBe(false);

    // 主工作台具有独立实体画布与圆角容器
    await waitFor(() => {
      expect(screen.getByTestId('app-layout-root')).toBeInTheDocument();
    });
    const layout = screen.getByTestId('app-layout-root');
    expect(layout.className).toContain('rounded-xl');
    expect(layout.className).toContain('bg-canvas');
  });

  it('切换至悬浮胶囊形态时，html与body同步注入floating-mode与bg-transparent，移除矩形白底bg-canvas', async () => {
    const { rerender } = render(<App />);

    act(() => {
      useMeetingStore.getState().setActiveWindow('floating-pill');
    });
    rerender(<App />);

    // 关键断言：根节点与body必须具备 floating-mode 与 bg-transparent 类，去除矩形白底
    expect(document.documentElement.classList.contains('floating-mode')).toBe(true);
    expect(document.body.classList.contains('floating-mode')).toBe(true);
    expect(document.body.classList.contains('bg-transparent')).toBe(true);
    expect(document.body.classList.contains('bg-canvas')).toBe(false);

    // 胶囊外层容器为透明容器
    const pill = screen.getByTestId('floating-pill-section-container');
    expect(pill).toBeInTheDocument();
    expect(pill.parentElement?.className).toContain('bg-transparent');

    // 再次切回主工作台
    act(() => {
      useMeetingStore.getState().setActiveWindow('workbench');
    });
    rerender(<App />);

    expect(document.documentElement.classList.contains('floating-mode')).toBe(false);
    expect(document.body.classList.contains('floating-mode')).toBe(false);
    expect(document.body.classList.contains('bg-transparent')).toBe(true);
    expect(document.body.classList.contains('bg-canvas')).toBe(false);
  });
});
