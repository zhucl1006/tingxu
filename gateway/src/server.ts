import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ModelRouter } from './router/modelRouter.js';
import { DeepSeekAdapter } from './adapters/deepseek.js';
import { QwenAdapter } from './adapters/qwen.js';
import { createAuditRecord } from './middleware/zeroContentAudit.js';
import type { LiveInsightRequest, MeetingChatRequest, MeetingSummaryRequest } from './adapters/types.js';
import { attachStreamingAsrServer } from './asr/streamingAsrServer.js';

export interface GatewayServerOptions {
  router?: ModelRouter;
}

function loadBootstrapConfig(): any {
  const candidatePaths = [
    process.env.SYSTEM_CONFIG_PATH,
    '/app/data/system-config.json',
    path.resolve(process.cwd(), '../server/data/system-config.json'),
    path.resolve(process.cwd(), './server/data/system-config.json'),
    path.resolve(process.cwd(), 'data/system-config.json'),
  ].filter(Boolean) as string[];

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export function createGatewayServer(options?: GatewayServerOptions) {
  const bootstrapConfig = loadBootstrapConfig();

  let activeConfig = {
    llmProvider: bootstrapConfig?.llm?.provider || 'deepseek',
    llmApiKey: bootstrapConfig?.llm?.apiKey || process.env.DEEPSEEK_API_KEY || '',
    llmBaseUrl: bootstrapConfig?.llm?.baseUrl || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    primaryModel: bootstrapConfig?.llm?.model || 'deepseek-chat',
    fallbackModel: bootstrapConfig?.llm?.fallbackModel || 'qwen-plus',
    asrProvider: bootstrapConfig?.asr?.provider || 'dashscope',
    asrApiKey: bootstrapConfig?.asr?.apiKey || process.env.DASHSCOPE_API_KEY || '',
    asrEndpoint: bootstrapConfig?.asr?.endpoint || process.env.DASHSCOPE_ASR_ENDPOINT || 'wss://dashscope.aliyuncs.com/api-ws/v1/inference',
    lastReloadedAt: new Date().toISOString(),
  };

  const router =
    options?.router ||
    new ModelRouter({
      primaryAdapter:
        activeConfig.llmProvider === 'qwen'
          ? new QwenAdapter({ apiKey: activeConfig.llmApiKey, baseUrl: activeConfig.llmBaseUrl })
          : new DeepSeekAdapter({ apiKey: activeConfig.llmApiKey, baseUrl: activeConfig.llmBaseUrl }),
      fallbackAdapter: new QwenAdapter({ apiKey: process.env.QWEN_API_KEY || '' }),
    });

  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // 跨域设置
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Platform, X-Client-Version');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // 0. 前端极速探活接口 (GET /gateway/v1/ping)
    if (req.method === 'GET' && (pathname === '/gateway/v1/ping' || pathname === '/ping')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ pong: true, time: Date.now() }));
      return;
    }

    // 1. 健康检查与配置状态
    if (req.method === 'GET' && (pathname === '/gateway/v1/health' || pathname === '/v1/health' || pathname === '/health')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'tingxu-ai-gateway',
          timestamp: new Date().toISOString(),
          activeConfig,
          circuitBreakers: router.getBreakerStats(),
        })
      );
      return;
    }

    // 1.5 配置热重载接口 (POST /internal/config/reload)
    if (req.method === 'POST' && pathname === '/internal/config/reload') {
      try {
        const bodyText = await readRequestBody(req);
        const config = JSON.parse(bodyText);

        if (config.llm) {
          activeConfig = {
            ...activeConfig,
            llmProvider: config.llm.provider || activeConfig.llmProvider,
            primaryModel: config.llm.model || activeConfig.primaryModel,
            fallbackModel: config.llm.fallbackModel || activeConfig.fallbackModel,
            llmApiKey: config.llm.apiKey || activeConfig.llmApiKey,
            llmBaseUrl: config.llm.baseUrl || activeConfig.llmBaseUrl,
            lastReloadedAt: new Date().toISOString(),
          };

          // 重新根据最新凭据配置适配器
          const targetApiKey = activeConfig.llmApiKey;
          const targetBaseUrl = activeConfig.llmBaseUrl;
          const primaryAdapter =
            activeConfig.llmProvider === 'qwen'
              ? new QwenAdapter({ apiKey: targetApiKey, baseUrl: targetBaseUrl })
              : new DeepSeekAdapter({ apiKey: targetApiKey, baseUrl: targetBaseUrl });
          const fallbackAdapter = new QwenAdapter({ apiKey: targetApiKey });
          router.updateAdapters({ primaryAdapter, fallbackAdapter });
        }

        if (config.asr) {
          activeConfig = {
            ...activeConfig,
            asrProvider: config.asr.provider || activeConfig.asrProvider,
            asrApiKey: config.asr.apiKey || activeConfig.asrApiKey,
            asrEndpoint: config.asr.endpoint || activeConfig.asrEndpoint,
          };
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, reloaded: true, activeConfig }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 400, message: (err as Error).message }));
      }
      return;
    }

    // 2. 会中本场问答接口 (POST /gateway/v1/meeting-chat)
    if (req.method === 'POST' && (pathname === '/gateway/v1/meeting-chat' || pathname === '/v1/meeting-chat')) {
      const startTime = Date.now();
      try {
        const bodyText = await readRequestBody(req);
        const rawPayload = JSON.parse(bodyText);

        if (!rawPayload.question || typeof rawPayload.question !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 400, message: '问题内容 (question) 不能为空' }));
          return;
        }

        const segments = rawPayload.localStableTranscript || rawPayload.transcriptWindow || [];
        const payload: MeetingChatRequest = {
          meetingId: rawPayload.meetingId || 'mtg_current',
          question: rawPayload.question,
          asOfTextVersion: rawPayload.asOfTextVersion || 1,
          localStableTranscript: segments.map((s: any, idx: number) => ({
            segmentId: s.segmentId || `seg_${idx}`,
            speaker: s.speaker || '发言人',
            text: s.text || '',
          })),
        };

        const result = await router.chat(payload);

        // 记录脱敏审计（绝无会议正文）
        const audit = createAuditRecord({
          requestId: `req_chat_${Date.now()}`,
          meetingId: payload.meetingId,
          provider: result.provider,
          modelVersion: result.modelVersion,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          latencyMs: Date.now() - startTime,
          status: 200,
          fallbackTriggered: result.fallbackTriggered,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            code: 0,
            data: {
              answer: result.data.answer,
              evidenceRefs: result.data.evidenceRefs,
              citations: result.data.evidenceRefs || [],
            },
            meta: {
              modelVersion: result.modelVersion,
              tokensUsed: result.usage.totalTokens,
              fallbackTriggered: result.fallbackTriggered ?? false,
            },
          })
        );
      } catch (err) {
        console.error('[AI Gateway] Meeting chat error:', (err as Error).message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            code: 500,
            message: 'AI Gateway 处理问答失败',
            error: (err as Error).message,
          })
        );
      }
      return;
    }

    // 3. 会中结构化增量整理 SSE 接口 (POST /gateway/v1/live-insights)
    if (req.method === 'POST' && (pathname === '/gateway/v1/live-insights' || pathname === '/v1/live-insights')) {
      const startTime = Date.now();
      try {
        const bodyText = await readRequestBody(req);
        const payload: LiveInsightRequest = JSON.parse(bodyText);

        // 开启 SSE 流响应
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        const result = await router.generateInsightStream(payload, (patch) => {
          res.write(`event: insight_patch\ndata: ${JSON.stringify(patch)}\n\n`);
        });

        // 写入完成事件
        res.write(
          `event: done\ndata: ${JSON.stringify({
            tokensUsed: result.usage.totalTokens,
            modelVersion: result.modelVersion,
            fallbackTriggered: result.fallbackTriggered ?? false,
          })}\n\n`
        );
        res.end();

        // 审计记录
        createAuditRecord({
          requestId: `req_live_${Date.now()}`,
          meetingId: payload.meetingId,
          provider: result.provider,
          modelVersion: result.modelVersion,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          latencyMs: Date.now() - startTime,
          status: 200,
          fallbackTriggered: result.fallbackTriggered,
        });
      } catch (err) {
        console.error('[AI Gateway] Live insights error:', (err as Error).message);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 500, message: (err as Error).message }));
        } else {
          res.write(`event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`);
          res.end();
        }
      }
      return;
    }

    // 4. 会后高精纪要与全局结构化总结接口 (POST /gateway/v1/meeting-summary)
    if (req.method === 'POST' && (pathname === '/gateway/v1/meeting-summary' || pathname === '/v1/meeting-summary')) {
      const startTime = Date.now();
      try {
        const bodyText = await readRequestBody(req);
        const rawPayload = JSON.parse(bodyText);

        const transcripts = Array.isArray(rawPayload.transcripts) ? rawPayload.transcripts : [];
        const payload: MeetingSummaryRequest = {
          meetingId: rawPayload.meetingId || 'mtg_current',
          transcripts: transcripts.map((t: any, idx: number) => ({
            segmentId: t.segmentId || t.id || `seg_${idx}`,
            speaker: t.speaker || '发言人',
            text: t.text || '',
          })),
        };

        const result = await router.summarize(payload);

        // 审计记录（绝无会议正文）
        createAuditRecord({
          requestId: `req_summary_${Date.now()}`,
          meetingId: payload.meetingId,
          provider: result.provider,
          modelVersion: result.modelVersion,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          latencyMs: Date.now() - startTime,
          status: 200,
          fallbackTriggered: result.fallbackTriggered,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            code: 0,
            data: result.data,
            meta: {
              modelVersion: result.modelVersion,
              tokensUsed: result.usage.totalTokens,
              fallbackTriggered: result.fallbackTriggered ?? false,
            },
          })
        );
      } catch (err) {
        console.error('[AI Gateway] Meeting summary error:', (err as Error).message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            code: 500,
            message: 'AI Gateway 生成全场会议总结失败',
            error: (err as Error).message,
          })
        );
      }
      return;
    }

    // 未知路由 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 404, message: `Route not found: ${pathname}` }));
  });

  const wss = attachStreamingAsrServer({
    server,
    path: '/gateway/v1/asr/stream',
    getAsrConfig: () => ({
      provider: activeConfig.asrProvider,
      apiKey: activeConfig.asrApiKey,
      endpoint: activeConfig.asrEndpoint,
    }),
  });

  return { server, router, wss };
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      // 限制 10MB 防止内存溢出
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Request payload too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
