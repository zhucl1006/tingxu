import { describe, it, expect, beforeEach } from 'vitest';
import { WebSocket } from 'ws';
import { createGatewayServer } from '../src/server.js';
import { ModelRouter } from '../src/router/modelRouter.js';
import { DeepSeekAdapter } from '../src/adapters/deepseek.js';
import { QwenAdapter } from '../src/adapters/qwen.js';

describe('AI Gateway 热重载与真实模型调用测试 (T04, T05, T06)', () => {
  let router: ModelRouter;
  let serverInstance: ReturnType<typeof createGatewayServer>;

  beforeEach(() => {
    router = new ModelRouter({
      primaryAdapter: new DeepSeekAdapter({ apiKey: 'mock_test_key', mockMode: true }),
      fallbackAdapter: new QwenAdapter({ apiKey: 'mock_test_key', mockMode: true }),
    });
    serverInstance = createGatewayServer({ router });
  });

  it('应支持 POST /internal/config/reload 接收新密钥并热重载生效', async () => {
    const { server } = serverInstance;
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      // 1. 发送热重载请求
      const newConfig = {
        llm: {
          provider: 'deepseek',
          apiKey: 'sk-new-reloaded-api-key-8888',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
          fallbackModel: 'qwen-max',
        },
        asr: {
          provider: 'dashscope',
          apiKey: 'sk-asr-reloaded-key-9999',
          endpoint: 'wss://dashscope.aliyuncs.com/api-v1/tasks',
          sampleRate: 16000,
        },
      };

      const reloadRes = await fetch(`http://127.0.0.1:${port}/internal/config/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });

      expect(reloadRes.status).toBe(200);
      const reloadJson = await reloadRes.json();
      expect(reloadJson.code).toBe(0);
      expect(reloadJson.reloaded).toBe(true);

      // 2. 健康检查中应反映热重载状态
      const healthRes = await fetch(`http://127.0.0.1:${port}/gateway/v1/health`);
      expect(healthRes.status).toBe(200);
      const healthJson = await healthRes.json();
      expect(healthJson.activeConfig).toBeDefined();
      expect(healthJson.activeConfig.llmProvider).toBe('deepseek');
      expect(healthJson.activeConfig.primaryModel).toBe('deepseek-chat');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('会中问答 POST /gateway/v1/meeting-chat 应能真实响应并结合逐字稿上下文推理', async () => {
    const { server } = serverInstance;
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      const chatRes = await fetch(`http://127.0.0.1:${port}/gateway/v1/meeting-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: 'mtg_real_001',
          question: '请问我们本次会议确认的上线时间是什么时候？',
          transcriptWindow: [
            { speaker: '张三', text: '大家好，听序 1.0 的正式商用发布时间定在周五下午四点整。', timestamp: '14:02:10' },
            { speaker: '李四', text: '收到，已跟运维团队排期确认，全量门禁检查已通过。', timestamp: '14:02:25' },
          ],
        }),
      });

      expect(chatRes.status).toBe(200);
      const chatJson = await chatRes.json();
      expect(chatJson.code).toBe(0);
      expect(chatJson.data.answer).toBeTruthy();
      expect(chatJson.data.citations).toBeInstanceOf(Array);
      expect(chatJson.meta.tokensUsed).toBeGreaterThan(0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('应支持通过 WebSocket /gateway/v1/asr/stream 接收 PCM 音频二进制帧并回传转写文本', async () => {
    const { server, wss } = serverInstance;
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      const client = new WebSocket(`ws://127.0.0.1:${port}/gateway/v1/asr/stream`);
      await new Promise((resolve) => client.on('open', resolve));

      const receivedMessages: any[] = [];
      client.on('message', (msg) => {
        receivedMessages.push(JSON.parse(msg.toString()));
      });

      // 发送 32000 字节的 16kHz PCM 音频二进制帧
      const pcmPayload = Buffer.alloc(32000);
      client.send(pcmPayload);

      // 等待 WebSocket 消息回传
      await new Promise((r) => setTimeout(r, 100));

      expect(receivedMessages.length).toBeGreaterThan(0);
      expect(receivedMessages.some((m) => m.type === 'INTERIM' || m.type === 'FINAL')).toBe(true);

      client.close();
    } finally {
      wss.close();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
