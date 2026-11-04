import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createControlPlaneServer } from '../src/server.js';
import { AuthService } from '../src/auth/auth.service.js';
import { BillingEngine } from '../src/billing/billing.engine.js';
import { OpsService } from '../src/ops/ops.service.js';
import http from 'node:http';

describe('Admin AI Cost & Usage API (TDD)', () => {
  let authService: AuthService;
  let billingEngine: BillingEngine;
  let opsService: OpsService;
  let mockGatewayServer: http.Server;
  let mockGatewayPort: number;

  beforeEach(async () => {
    authService = new AuthService({ jwtSecret: 'test_secret' });
    billingEngine = new BillingEngine();
    opsService = new OpsService({ billingEngine });

    // 启动一个 Mock Gateway Server 返回统计
    mockGatewayServer = http.createServer((req, res) => {
      if (req.url === '/internal/billing/ai-usage') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            code: 0,
            data: {
              totalCostYuan: 12.3456,
              todayCostYuan: 1.2345,
              totalTokens: 250000,
              totalAudioSeconds: 3600,
              totalCalls: 15,
              byProvider: {
                deepseek: { costYuan: 8.5, calls: 10, tokens: 200000 },
                dashscope: { costYuan: 3.8456, calls: 5, audioSeconds: 3600 },
              },
              byType: {
                llm_chat: { costYuan: 4.5, calls: 5 },
                asr_stream: { costYuan: 3.8456, calls: 5 },
                llm_summary: { costYuan: 4.0, calls: 5 },
              },
              recentRecords: [
                {
                  id: 'usage_001',
                  timestamp: '2026-11-04T10:00:00.000Z',
                  type: 'llm_chat',
                  provider: 'deepseek',
                  model: 'deepseek-chat',
                  promptTokens: 500,
                  completionTokens: 500,
                  totalTokens: 1000,
                  audioSeconds: 0,
                  costYuan: 0.005,
                  latencyMs: 320,
                  status: 200,
                },
              ],
            },
          })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => mockGatewayServer.listen(0, '127.0.0.1', resolve));
    const addr = mockGatewayServer.address();
    mockGatewayPort = typeof addr === 'object' && addr ? addr.port : 0;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => mockGatewayServer.close(() => resolve()));
  });

  it('未登录请求 GET /v1/ops/ai-usage/stats 应被拦截并返回 401', async () => {
    const { server } = createControlPlaneServer({
      authService,
      billingEngine,
      opsService,
      superPassword: 'test_super_pwd',
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/ops/ai-usage/stats`);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe(401);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('使用超级密码鉴权后，GET /v1/ops/ai-usage/stats 应成功获取 AI 成本聚合数据', async () => {
    process.env.GATEWAY_INTERNAL_URL = `http://127.0.0.1:${mockGatewayPort}/internal/billing/ai-usage`;

    const { server } = createControlPlaneServer({
      authService,
      billingEngine,
      opsService,
      superPassword: 'test_super_pwd',
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/ops/ai-usage/stats`, {
        headers: {
          Authorization: 'Bearer test_super_pwd',
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.code).toBe(0);
      expect(json.data.totalCostYuan).toBe(12.3456);
      expect(json.data.todayCostYuan).toBe(1.2345);
      expect(json.data.byProvider.deepseek.costYuan).toBe(8.5);
      expect(json.data.recentRecords).toHaveLength(1);
      expect(json.data.recentRecords[0].id).toBe('usage_001');
    } finally {
      delete process.env.GATEWAY_INTERNAL_URL;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('网关服务不可用时，GET /v1/ops/ai-usage/stats 应优雅降级返回默认空统计，避免控制面报错崩溃', async () => {
    // 指向一个未监听的端口
    process.env.GATEWAY_INTERNAL_URL = `http://127.0.0.1:49999/internal/billing/ai-usage`;

    const { server } = createControlPlaneServer({
      authService,
      billingEngine,
      opsService,
      superPassword: 'test_super_pwd',
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/ops/ai-usage/stats`, {
        headers: {
          Authorization: 'Bearer test_super_pwd',
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.code).toBe(0);
      expect(json.data.totalCostYuan).toBe(0);
      expect(json.data.recentRecords).toEqual([]);
    } finally {
      delete process.env.GATEWAY_INTERNAL_URL;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
