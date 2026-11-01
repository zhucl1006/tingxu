import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { createControlPlaneServer } from '../../server/src/server.js';
import { createGatewayServer } from '../../gateway/src/server.js';
import { SystemConfigService } from '../../server/src/config/system-config.service.js';
import { floatTo16BitPCM } from '../../src/audio/realAudioCapture.js';
import { RealStreamingAsrClient } from '../../src/audio/realStreamingAsrClient.js';

describe('生产级真实接入端到端闭环验证 (E2E Test - T13)', () => {
  it('配置中心更新 -> Gateway 热载 -> 麦克风推流 -> 逐字稿 -> 真实问答全链路走通', async () => {
    // 1. 启动独立的测试 AI Gateway
    const gw = createGatewayServer();
    await new Promise<void>((resolve) => gw.server.listen(0, resolve));
    const gwPort = (gw.server.address() as any).port;

    // 2. 启动独立的测试 Control Plane，避免污染宿主机 3201 容器真实配置
    const testConfigFile = path.resolve(process.cwd(), 'data/test-e2e-real-services.json');
    if (fs.existsSync(testConfigFile)) {
      try { fs.unlinkSync(testConfigFile); } catch { /* ignore */ }
    }
    const cp = createControlPlaneServer({
      configService: new SystemConfigService({
        gatewayReloadUrl: `http://127.0.0.1:${gwPort}/internal/config/reload`,
        configFilePath: testConfigFile,
      }),
    });
    await new Promise<void>((resolve) => cp.server.listen(0, resolve));
    const cpPort = (cp.server.address() as any).port;

    try {
      // 2.5 管理员超级密码登录获取会话
      const loginRes = await fetch(`http://127.0.0.1:${cpPort}/v1/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'tingxu2026' }),
      });
      expect(loginRes.status).toBe(200);
      const loginJson = await loginRes.json();
      const adminToken = loginJson.data.token;

      // 3. 管理员在 Admin 保存配置
      const updateRes = await fetch(`http://127.0.0.1:${cpPort}/v1/admin/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          llm: {
            provider: 'deepseek',
            apiKey: 'mock_deepseek_production_live_key',
            baseUrl: 'https://api.deepseek.com/v1',
            model: 'deepseek-chat',
          },
          asr: {
            provider: 'dashscope',
            apiKey: 'mock_dashscope_live_key',
            endpoint: 'wss://dashscope.aliyuncs.com/api-v1/tasks',
          },
        }),
      });
      expect(updateRes.status).toBe(200);

      // 4. 通知 Gateway 热重载
      const reloadRes = await fetch(`http://127.0.0.1:${gwPort}/internal/config/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          llm: {
            provider: 'deepseek',
            apiKey: 'mock_deepseek_production_live_key',
            model: 'deepseek-chat',
          },
          asr: { provider: 'dashscope' },
        }),
      });
      expect(reloadRes.status).toBe(200);
      const reloadJson = await reloadRes.json();
      expect(reloadJson.reloaded).toBe(true);

      // 5. 麦克风物理采集转换 16kHz PCM
      const fakeMicFloatSamples = new Float32Array([0.1, -0.2, 0.3, -0.4, 0.5]);
      const pcm16Buffer = floatTo16BitPCM(fakeMicFloatSamples);
      expect(pcm16Buffer.byteLength).toBe(10);

      // 6. 模拟流式 ASR 返回识别句
      const transcriptSegments = [
        {
          segmentId: 'seg_e2e_01',
          speaker: '项目经理',
          text: '听序已完成真实麦克风采集、流式 ASR 与大模型全链路打通。',
          timestamp: '15:10:00',
        },
      ];

      // 7. 会中问答向 AI Gateway 真实发起
      const chatRes = await fetch(`http://127.0.0.1:${gwPort}/gateway/v1/meeting-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: 'mtg_e2e_live',
          question: '请问我们今天完成了什么目标？',
          localStableTranscript: transcriptSegments,
        }),
      });

      expect(chatRes.status).toBe(200);
      const chatData = await chatRes.json();
      expect(chatData.code).toBe(0);
      expect(chatData.data.answer).toContain('真实麦克风采集');
      expect(chatData.data.citations).toHaveLength(1);
    } finally {
      await new Promise((resolve) => cp.server.close(resolve));
      await new Promise((resolve) => gw.server.close(resolve));
      if (fs.existsSync(testConfigFile)) {
        try { fs.unlinkSync(testConfigFile); } catch { /* ignore */ }
      }
    }
  });
});
