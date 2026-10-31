import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GatewayConnectionGuard } from '../guards/GatewayConnectionGuard';

describe('GatewayConnectionGuard 前端强探活阻断守卫测试 (T08)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('当 AI Gateway 正常连通时，应正常渲染子组件内容', async () => {
    // 模拟健康检查返回 200
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', service: 'tingxu-ai-gateway' }),
    } as any);

    render(
      <GatewayConnectionGuard>
        <div data-testid="protected-workspace-content">受保护的会议工作区</div>
      </GatewayConnectionGuard>
    );

    await waitFor(() => {
      expect(screen.getByTestId('protected-workspace-content')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('gateway-guard-modal-blocked')).not.toBeInTheDocument();
  });

  it('当 AI Gateway 断开连接或报错时，必须全屏阻断并显示不可用提示遮罩', async () => {
    // 模拟健康检查失败 (网络无法连通)
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Failed to fetch gateway'));

    render(
      <GatewayConnectionGuard>
        <div data-testid="protected-workspace-content">受保护的会议工作区</div>
      </GatewayConnectionGuard>
    );

    await waitFor(() => {
      expect(screen.getByTestId('gateway-guard-modal-blocked')).toBeInTheDocument();
    });

    expect(screen.getByTestId('gateway-guard-text-warning')).toHaveTextContent(/无法连接至听序 AI 网关/);
    expect(screen.getByTestId('gateway-guard-btn-retry')).toBeInTheDocument();
    // 核心内容被阻断/隐藏
    expect(screen.queryByTestId('protected-workspace-content')).not.toBeInTheDocument();
  });

  it('在阻断状态下点击重试，若网关恢复应自动解除阻断并恢复可用', async () => {
    // 第一次失败
    vi.spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('Connection refused'))
      // 第二次重试成功
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      } as any);

    render(
      <GatewayConnectionGuard>
        <div data-testid="protected-workspace-content">受保护的会议工作区</div>
      </GatewayConnectionGuard>
    );

    await waitFor(() => {
      expect(screen.getByTestId('gateway-guard-modal-blocked')).toBeInTheDocument();
    });

    // 点击重试
    fireEvent.click(screen.getByTestId('gateway-guard-btn-retry'));

    await waitFor(() => {
      expect(screen.getByTestId('protected-workspace-content')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('gateway-guard-modal-blocked')).not.toBeInTheDocument();
  });
});
