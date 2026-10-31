import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppLayout } from '../AppLayout';
import { useMeetingStore } from '../../store/useMeetingStore';

describe('AppLayout 整体桌面端容器与导航测试', () => {
  beforeEach(() => {
    useMeetingStore.getState().resetMeeting();
    useMeetingStore.getState().logoutUser();
  });

  it('应正确渲染侧边栏品牌、导航菜单与底部用量', () => {
    render(<AppLayout />);

    expect(screen.getByTestId('app-sidebar-container')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar-div-brand')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar-card-quota')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar-btn-nav-home')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar-btn-nav-tasks')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar-btn-nav-search')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar-btn-nav-billing')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar-btn-nav-settings')).toBeInTheDocument();
  });

  it('点击未登录状态的登录按钮应弹出登录弹窗，并支持一键免密登录', () => {
    render(<AppLayout />);

    const triggerLoginBtn = screen.getByTestId('app-sidebar-btn-trigger-login');
    fireEvent.click(triggerLoginBtn);

    expect(screen.getByTestId('login-modal-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('login-modal-input-phone')).toBeInTheDocument();

    // 点击一键免密登录
    const quickLoginBtn = screen.getByTestId('login-modal-btn-quick-login');
    fireEvent.click(quickLoginBtn);

    // 登录成功后弹窗自动关闭，侧边栏显示已登录手机号
    expect(screen.queryByTestId('login-modal-overlay')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar-div-user')).toHaveTextContent('138****8000');
  });

  it('点击各导航项应平滑切换至对应视图', () => {
    render(<AppLayout />);

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
