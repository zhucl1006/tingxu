import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppLayout } from '../AppLayout';
import { useMeetingStore } from '../../store/useMeetingStore';

describe('AppLayout 整体桌面端容器与导航测试', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // 默认 mock 网关健康探活返回成功
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
    useMeetingStore.getState().logoutUser();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应正确渲染侧边栏品牌、导航菜单与底部用量', async () => {
    render(<AppLayout />);

    await waitFor(() => {
      expect(screen.getByTestId('app-sidebar-container')).toBeInTheDocument();
    });

    expect(screen.getByTestId('app-sidebar-div-brand')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar-card-quota')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar-btn-nav-home')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar-btn-nav-tasks')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar-btn-nav-search')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar-btn-nav-billing')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar-btn-nav-settings')).toBeInTheDocument();
  });

  it('未登录状态应强制弹出登录弹窗，并支持手机号验证码真实登录', async () => {
    // 针对真实认证接口模拟控制面正常响应
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/gateway/v1/health')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', service: 'tingxu-ai-gateway' }),
        } as any;
      }
      if (typeof url === 'string' && url.includes('/v1/auth/sms/send')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ code: 0, message: '短信验证码已下发' }),
        } as any;
      }
      if (typeof url === 'string' && url.includes('/v1/auth/sms/login')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 0,
            data: {
              token: 'jwt_valid_signature_token_real',
              user: { userId: 'usr_5678', phone: '13912345678', role: 'USER' },
            },
          }),
        } as any;
      }
      return { ok: true, status: 200, json: async () => ({ code: 0 }) } as any;
    });

    render(<AppLayout />);

    await waitFor(() => {
      expect(screen.getByTestId('app-sidebar-container')).toBeInTheDocument();
    });

    // 未登录时自动弹出登录弹窗拦截
    expect(screen.getByTestId('login-modal-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('login-modal-input-phone')).toBeInTheDocument();

    // 输入真实手机号与验证码
    fireEvent.change(screen.getByTestId('login-modal-input-phone'), {
      target: { value: '13912345678' },
    });
    fireEvent.change(screen.getByTestId('login-modal-input-code'), {
      target: { value: '654321' },
    });

    // 提交登录
    fireEvent.click(screen.getByTestId('login-modal-btn-submit'));

    // 登录成功后弹窗自动关闭，侧边栏显示已登录手机号
    await waitFor(() => {
      expect(screen.queryByTestId('login-modal-overlay')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('app-sidebar-div-user')).toHaveTextContent('139****5678');
  });

  it('点击各导航项应平滑切换至对应视图', async () => {
    render(<AppLayout />);

    await waitFor(() => {
      expect(screen.getByTestId('app-sidebar-container')).toBeInTheDocument();
    });

    // 切换至我的待办
    fireEvent.click(screen.getByTestId('app-sidebar-btn-nav-tasks'));
    expect(screen.getByTestId('tasks-page-container')).toBeInTheDocument();

    // 切换至历史检索
    fireEvent.click(screen.getByTestId('app-sidebar-btn-nav-search'));
    expect(screen.getByTestId('search-page-container')).toBeInTheDocument();

    // 切换至套餐与用量
    fireEvent.click(screen.getByTestId('app-sidebar-btn-nav-billing'));
    expect(screen.getByTestId('billing-page-container')).toBeInTheDocument();

    // 切换至系统设置
    fireEvent.click(screen.getByTestId('app-sidebar-btn-nav-settings'));
    expect(screen.getByTestId('settings-page-container')).toBeInTheDocument();

    // 切换回首页工作台
    fireEvent.click(screen.getByTestId('app-sidebar-btn-nav-home'));
    expect(screen.getByTestId('home-page-container')).toBeInTheDocument();
  });
});
