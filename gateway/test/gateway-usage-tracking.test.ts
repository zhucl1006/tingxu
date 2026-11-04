import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { createGatewayServer } from '../src/server.js';
import { ModelRouter } from '../src/router/modelRouter.js';
import { AiUsageStore } from '../src/billing/aiUsageStore.js';

describe('Gateway Usage & Cost Tracking Pipeline (TDD)', () => {
  const testStoragePath = path.resolve(process.cwd(), 'gateway/test/fixtures/ai-usage-gateway-test.json');
  let usageStore: AiUsageStore;

  beforeEach(() => {
    if (fs.existsSync(testStoragePath)) {
      fs.unlinkSync(testStoragePath);
    }
    usageStore = new AiUsageStore({ storageFilePath: testStoragePath });
  });

  afterEach(() => {
    if (fs.existsSync(testStoragePath)) {
      fs.unlinkSync(testStoragePath);
    }
  });

  it('会中提问 meeting-chat 成功后应自动记录用量流水并可通过 /internal/billing/ai-usage 查询', async () => {
    const mockRouter = {
      chat: vi.fn().mockResolvedValue({
        data: { answer: '这是AI回答', evidenceRefs: [] },
        provider: 'deepseek',
        modelVersion: 'deepseek-chat',
        usage: { promptTokens: 400, completionTokens: 600, totalTokens: 1000 },
        fallbackTriggered: false,
      }),
      generateInsightStream: vi.fn(),
      summarize: vi.fn(),
      getBreakerStats: vi.fn().mockReturnValue({}),
      updateAdapters: vi.fn(),
    } as unknown as ModelRouter;

    const { server } = createGatewayServer({
      router: mockRouter,
      usageStore,
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const res = await fetch(`${baseUrl}/gateway/v1/meeting-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: 'mtg_chat_1',
          question: '本周OKR是什么？',
        }),
      });

      expect(res.status).toBe(200);

      // 查询网关内部计费聚合接口
      const usageRes = await fetch(`${baseUrl}/internal/billing/ai-usage`);
      expect(usageRes.status).toBe(200);
      const usageJson = await usageRes.json();
      expect(usageJson.code).toBe(0);

      const stats = usageJson.data;
      expect(stats.totalCalls).toBe(1);
      expect(stats.totalTokens).toBe(1000);
      // deepseek: 400*0.002/1000 + 600*0.008/1000 = 0.0008 + 0.0048 = 0.0056
      expect(stats.totalCostYuan).toBeCloseTo(0.0056, 4);
      expect(stats.recentRecords[0].type).toBe('llm_chat');
      expect(stats.recentRecords[0].provider).toBe('deepseek');
      // 零内容红线校验
      expect(JSON.stringify(usageJson)).not.toContain('本周OKR是什么');
      expect(JSON.stringify(usageJson)).not.toContain('这是AI回答');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('会后会议纪要 meeting-summary 成功后应自动累计模型消耗', async () => {
    const mockRouter = {
      chat: vi.fn(),
      generateInsightStream: vi.fn(),
      summarize: vi.fn().mockResolvedValue({
        data: { overview: '概述', decisions: [], actionItems: [], risks: [] },
        provider: 'qwen',
        modelVersion: 'qwen-plus',
        usage: { promptTokens: 1000, completionTokens: 1000, totalTokens: 2000 },
        fallbackTriggered: false,
      }),
      getBreakerStats: vi.fn().mockReturnValue({}),
      updateAdapters: vi.fn(),
    } as unknown as ModelRouter;

    const { server } = createGatewayServer({
      router: mockRouter,
      usageStore,
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const res = await fetch(`${baseUrl}/gateway/v1/meeting-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: 'mtg_sum_1',
          transcripts: [{ speaker: 'Alice', text: '讨论预算' }],
        }),
      });

      expect(res.status).toBe(200);

      const usageRes = await fetch(`${baseUrl}/internal/billing/ai-usage`);
      expect(usageRes.status).toBe(200);
      const usageJson = await usageRes.json();
      const stats = usageJson.data;
      expect(stats.totalCalls).toBe(1);
      expect(stats.byProvider['qwen'].costYuan).toBeGreaterThan(0);
      expect(stats.recentRecords[0].type).toBe('llm_summary');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
