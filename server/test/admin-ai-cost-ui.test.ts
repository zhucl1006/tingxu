import { describe, it, expect } from 'vitest';
import { renderAdminDashboardHtml } from '../src/admin.html.js';

describe('Admin Dashboard AI Cost & Usage UI Compliance (TDD)', () => {
  it('后台 HTML 模板应包含「AI 用量与成本大盘」导航按钮与对应 data-testid', () => {
    const html = renderAdminDashboardHtml();
    expect(html).toContain('data-testid="admin-tab-btn-ai-cost"');
    expect(html).toContain('AI 用量与成本大盘');
  });

  it('后台 HTML 模板应包含 panel-ai-cost 面板及统计卡片', () => {
    const html = renderAdminDashboardHtml();
    expect(html).toContain('id="panel-ai-cost"');
    expect(html).toContain('data-testid="admin-ai-cost-panel"');
    expect(html).toContain('data-testid="admin-ai-cost-stat-card-total-cost"');
    expect(html).toContain('data-testid="admin-ai-cost-stat-card-today-cost"');
    expect(html).toContain('data-testid="admin-ai-cost-stat-card-tokens"');
    expect(html).toContain('data-testid="admin-ai-cost-stat-card-asr-duration"');
  });

  it('后台 HTML 模板应包含刷新按钮与用量流水表格容器', () => {
    const html = renderAdminDashboardHtml();
    expect(html).toContain('data-testid="admin-ai-cost-btn-refresh"');
    expect(html).toContain('data-testid="admin-ai-cost-table-container"');
    expect(html).toContain('/v1/ops/ai-usage/stats');
  });
});
