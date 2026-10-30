import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildLiveInsightPrompt, buildMeetingChatPrompt } from '../src/prompts/templates.js';
import { CircuitBreaker } from '../src/breaker/circuitBreaker.js';
import { ModelRouter } from '../src/router/modelRouter.js';
import { DeepSeekAdapter } from '../src/adapters/deepseek.js';
import { QwenAdapter } from '../src/adapters/qwen.js';
import { calculateModelCost } from '../src/billing/costCalculator.js';
import { sanitizeAuditLog, createAuditRecord } from '../src/middleware/zeroContentAudit.js';
import { createGatewayServer } from '../src/server.js';
import type { LiveInsightRequest, MeetingChatRequest } from '../src/adapters/types.js';

describe('AI Gateway 核心套件测试', () => {
  describe('1. Prompt 模板库与上下文装配', () => {
    it('应正确组装 Live Insights 提示词，并包含严格证据约束与 JSON 输出要求', () => {
      const req: LiveInsightRequest = {
        meetingId: 'meet_test_01',
        currentTopicSummary: '讨论音频采集架构',
        newStableText: '研发表示 WASAPI 原生采集已调通，接下来攻关断电崩溃恢复。',
        contextAnchors: [{ segmentId: 'seg_01', quote: '保证录音绝对不丢' }],
      };

      const prompt = buildLiveInsightPrompt(req);
      expect(prompt.systemPrompt).toContain('听序');
      expect(prompt.systemPrompt).toContain('evidenceRefs');
      expect(prompt.systemPrompt).toContain('JSON');
      expect(prompt.userPrompt).toContain('WASAPI 原生采集已调通');
      expect(prompt.userPrompt).toContain('seg_01');
    });

    it('应正确组装 Meeting Chat 提示词，并注入严苛防臆造与忠于现场指令', () => {
      const req: MeetingChatRequest = {
        meetingId: 'meet_test_01',
        question: '测试排期定了吗？',
        asOfTextVersion: 10,
        localStableTranscript: [
          { segmentId: 'seg_10', speaker: '产品', text: '排期下周一确定。' },
        ],
      };

      const prompt = buildMeetingChatPrompt(req);
      expect(prompt.systemPrompt).toContain('严禁凭空臆造');
      expect(prompt.systemPrompt).toContain('evidenceRefs');
      expect(prompt.userPrompt).toContain('测试排期定了吗？');
      expect(prompt.userPrompt).toContain('seg_10');
    });
  });

  describe('2. 滑动窗口熔断器 (Circuit Breaker)', () => {
    it('正常调用应保持 CLOSED 状态', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 100 });
      expect(breaker.getState()).toBe('CLOSED');

      const res = await breaker.execute(async () => 'ok');
      expect(res).toBe('ok');
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('连续失败达到阈值应自动进入 OPEN 熔断状态并快速拒绝', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 100 });

      // 连续失败 2 次
      await expect(breaker.execute(async () => { throw new Error('API 503'); })).rejects.toThrow();
      await expect(breaker.execute(async () => { throw new Error('API 429'); })).rejects.toThrow();

      expect(breaker.getState()).toBe('OPEN');

      // OPEN 状态下直接快速失败
      await expect(breaker.execute(async () => 'should not run')).rejects.toThrow(/Circuit breaker is OPEN/);
    });

    it('冷却期过后应进入 HALF_OPEN 试探，试探成功后自愈为 CLOSED', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50 });

      await expect(breaker.execute(async () => { throw new Error('Timeout'); })).rejects.toThrow();
      expect(breaker.getState()).toBe('OPEN');

      // 等待冷却时间
      await new Promise((r) => setTimeout(r, 60));

      // 试探成功
      const res = await breaker.execute(async () => 'recovered');
      expect(res).toBe('recovered');
      expect(breaker.getState()).toBe('CLOSED');
    });
  });

  describe('3. 多模型自动降级调度器 (ModelRouter)', () => {
    it('主模型正常时应直接采用 DeepSeek-V3', async () => {
      const deepseek = new DeepSeekAdapter({ mockMode: true });
      const qwen = new QwenAdapter({ mockMode: true });
      const router = new ModelRouter({ primaryAdapter: deepseek, fallbackAdapter: qwen });

      const req: MeetingChatRequest = {
        meetingId: 'meet_01',
        question: '定论是什么？',
        asOfTextVersion: 1,
        localStableTranscript: [{ segmentId: 'seg_1', speaker: '我', text: '下周一再确认。' }],
      };

      const result = await router.chat(req);
      expect(result.provider).toBe('deepseek');
      expect(result.modelVersion).toBe('deepseek-v3');
      expect(result.data.evidenceRefs.length).toBeGreaterThan(0);
    });

    it('当 DeepSeek 超时或发生异常时，应在 1 秒内无缝自动降级至 Qwen-2.5', async () => {
      const deepseek = new DeepSeekAdapter({
        mockMode: true,
        mockError: new Error('DeepSeek API Timeout (>15s) or 429 Rate Limited'),
      });
      const qwen = new QwenAdapter({ mockMode: true });
      const router = new ModelRouter({ primaryAdapter: deepseek, fallbackAdapter: qwen });

      const req: MeetingChatRequest = {
        meetingId: 'meet_01',
        question: '测试排期定了吗？',
        asOfTextVersion: 1,
        localStableTranscript: [{ segmentId: 'seg_2', speaker: '对方', text: '等下周一。' }],
      };

      const result = await router.chat(req);
      expect(result.provider).toBe('qwen');
      expect(result.modelVersion).toBe('qwen-2.5-72b');
      expect(result.fallbackTriggered).toBe(true);
      expect(result.data.answer).toBeTruthy();
    });
  });

  describe('4. Token 成本账本 (CostCalculator)', () => {
    it('应精确核算 DeepSeek-V3 与 Qwen-2.5 的 Token 成本', () => {
      const costDeepSeek = calculateModelCost('deepseek', {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      });
      // 输入 0.002元/千token，输出 0.008元/千token => 1000*0.002/1000 + 500*0.008/1000 = 0.002 + 0.004 = 0.006 元
      expect(costDeepSeek.costYuan).toBeCloseTo(0.006, 4);

      const costQwen = calculateModelCost('qwen', {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      });
      // 输入 0.004元/千token，输出 0.012元/千token => 0.004 + 0.006 = 0.010 元
      expect(costQwen.costYuan).toBeCloseTo(0.010, 4);
    });
  });

  describe('5. Zero-Content 隐私合规与审计脱敏', () => {
    it('审计日志严禁包含逐字稿正文、用户提问与回答内容', () => {
      const sensitiveRecord = {
        requestId: 'req_123',
        meetingId: 'meet_999',
        question: '请问我们老板说了什么商业秘密？',
        newStableText: '张三说本季度预计营收一千万。',
        answer: '张三说本季度营收一千万。',
        provider: 'deepseek' as const,
        modelVersion: 'deepseek-v3',
        promptTokens: 120,
        completionTokens: 45,
        latencyMs: 350,
        status: 200,
      };

      const sanitized = sanitizeAuditLog(sensitiveRecord);
      const jsonString = JSON.stringify(sanitized);

      expect(jsonString).not.toContain('商业秘密');
      expect(jsonString).not.toContain('一千万');
      expect(sanitized.requestId).toBe('req_123');
      expect(sanitized.tokensPrompt).toBe(120);
      expect(sanitized.latencyMs).toBe(350);
    });
  });

  describe('6. AI Gateway HTTP & SSE 流式接口', () => {
    it('健康检查端点 /gateway/v1/health 应返回正常状态与断路器指标', async () => {
      const deepseek = new DeepSeekAdapter({ mockMode: true });
      const qwen = new QwenAdapter({ mockMode: true });
      const router = new ModelRouter({ primaryAdapter: deepseek, fallbackAdapter: qwen });
      const { server } = createGatewayServer({ router });

      await new Promise<void>((resolve) => server.listen(0, resolve));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;

      const res = await fetch(`http://127.0.0.1:${port}/gateway/v1/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(data.circuitBreakers).toBeDefined();

      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('会中问答接口 POST /gateway/v1/meeting-chat 应返回正确结构', async () => {
      const deepseek = new DeepSeekAdapter({ mockMode: true });
      const qwen = new QwenAdapter({ mockMode: true });
      const router = new ModelRouter({ primaryAdapter: deepseek, fallbackAdapter: qwen });
      const { server } = createGatewayServer({ router });

      await new Promise<void>((resolve) => server.listen(0, resolve));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;

      const res = await fetch(`http://127.0.0.1:${port}/gateway/v1/meeting-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: 'meet_http_01',
          question: '关于测试排期有什么定论？',
          asOfTextVersion: 1,
          localStableTranscript: [{ segmentId: 'seg_1', speaker: '开发', text: '下周一再确认。' }],
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.code).toBe(0);
      expect(json.data.answer).toBeTruthy();
      expect(json.data.evidenceRefs).toBeInstanceOf(Array);

      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('增量洞察接口 POST /gateway/v1/live-insights 应以 SSE 流式输出 insight_patch 与 done 事件', async () => {
      const deepseek = new DeepSeekAdapter({ mockMode: true });
      const qwen = new QwenAdapter({ mockMode: true });
      const router = new ModelRouter({ primaryAdapter: deepseek, fallbackAdapter: qwen });
      const { server } = createGatewayServer({ router });

      await new Promise<void>((resolve) => server.listen(0, resolve));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;

      const res = await fetch(`http://127.0.0.1:${port}/gateway/v1/live-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          meetingId: 'meet_sse_01',
          currentTopicSummary: '双轨录音落盘技术方案',
          newStableText: '研发表示 WASAPI 原生采集已调通。',
          contextAnchors: [{ segmentId: 'seg_01', quote: '保证录音绝对不丢' }],
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const bodyText = await res.text();
      expect(bodyText).toContain('event: insight_patch');
      expect(bodyText).toContain('event: done');
      expect(bodyText).toContain('tokensUsed');

      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
  });
});
