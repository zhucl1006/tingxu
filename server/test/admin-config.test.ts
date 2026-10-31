import { describe, it, expect, beforeEach } from 'vitest';
import { SystemConfigService } from '../src/config/system-config.service.js';
import { createControlPlaneServer } from '../src/server.js';
import { AuthService } from '../src/auth/auth.service.js';
import { BillingEngine } from '../src/billing/billing.engine.js';
import { WechatPayService } from '../src/payment/wechat-pay.service.js';
import { OpsService } from '../src/ops/ops.service.js';

describe('Admin 系统配置与密钥管理服务测试 (T01 & T02)', () => {
  let configService: SystemConfigService;

  beforeEach(() => {
    configService = new SystemConfigService();
  });

  it('应该能获取初始系统配置并完成密钥脱敏 (Masking)', async () => {
    const config = await configService.getConfig({ masked: true });
    expect(config).toBeDefined();
    expect(config.llm).toBeDefined();
    expect(config.asr).toBeDefined();
    expect(config.sms).toBeDefined();
    expect(config.payment).toBeDefined();

    // 默认应当具备合理 provider 与脱敏密钥
    expect(config.llm.provider).toBe('deepseek');
    expect(config.asr.provider).toBe('dashscope');
    expect(config.sms.provider).toBe('aliyun');
  });

  it('更新密钥时应完整保存，且脱敏输出时应隐藏敏感字符', async () => {
    await configService.updateConfig({
      llm: {
        provider: 'deepseek',
        apiKey: 'sk-9876543210fedcba',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        fallbackModel: 'qwen-plus',
      },
      asr: {
        provider: 'dashscope',
        apiKey: 'sk-asr-1234567890abcdef',
        endpoint: 'wss://dashscope.aliyuncs.com/api-v1/tasks',
        sampleRate: 16000,
      },
      sms: {
        provider: 'aliyun',
        accessKeyId: 'LTAI5tTest123456',
        accessKeySecret: 'SecretKey1234567890abcdef',
        signName: '听序科技',
        templateCode: 'SMS_99887766',
      },
    });

    // 内部获取明文（用于网关同步）
    const internalConfig = await configService.getConfig({ masked: false });
    expect(internalConfig.llm.apiKey).toBe('sk-9876543210fedcba');
    expect(internalConfig.asr.apiKey).toBe('sk-asr-1234567890abcdef');
    expect(internalConfig.sms.accessKeySecret).toBe('SecretKey1234567890abcdef');

    // 面向 Admin 获取脱敏版本
    const maskedConfig = await configService.getConfig({ masked: true });
    expect(maskedConfig.llm.apiKey).toContain('****');
    expect(maskedConfig.asr.apiKey).toContain('****');
    expect(maskedConfig.sms.accessKeySecret).toContain('****');
    expect(maskedConfig.llm.apiKey).not.toBe('sk-9876543210fedcba');
  });

  it('当前端提交掩码时（用户未修改密钥输入框），系统应保留原有密钥不被覆盖', async () => {
    // 首次设定密钥
    await configService.updateConfig({
      llm: {
        apiKey: 'sk-original-secret-key-123456',
        model: 'deepseek-chat',
      },
    });

    // 前端回传带掩码的数据并修改了 model
    const masked = (await configService.getConfig({ masked: true })).llm.apiKey;
    await configService.updateConfig({
      llm: {
        apiKey: masked, // 提交掩码
        model: 'deepseek-coder',
      },
    });

    const current = await configService.getConfig({ masked: false });
    expect(current.llm.model).toBe('deepseek-coder');
    // 真实密钥必须完整保留！
    expect(current.llm.apiKey).toBe('sk-original-secret-key-123456');
  });

  it('HTTP 路由应支持 GET/POST /v1/admin/config 与连通性自检', async () => {
    const authService = new AuthService({ jwtSecret: 'test_secret' });
    const billingEngine = new BillingEngine();
    const wechatPayService = new WechatPayService({ billingEngine });
    const opsService = new OpsService({ billingEngine });
    const { server } = createControlPlaneServer({
      authService,
      billingEngine,
      wechatPayService,
      opsService,
      configService,
    });

    const port = 3456;
    await new Promise<void>((resolve) => server.listen(port, resolve));

    try {
      // 1. GET /v1/admin/config
      const getRes = await fetch(`http://localhost:${port}/v1/admin/config`);
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson.code).toBe(0);
      expect(getJson.data.llm).toBeDefined();

      // 2. POST /v1/admin/config
      const postRes = await fetch(`http://localhost:${port}/v1/admin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          llm: { provider: 'qwen', model: 'qwen-max' },
        }),
      });
      expect(postRes.status).toBe(200);
      const postJson = await postRes.json();
      expect(postJson.code).toBe(0);

      // 3. POST /v1/admin/config/test-llm (连通性自测)
      const testRes = await fetch(`http://localhost:${port}/v1/admin/config/test-llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'deepseek' }),
      });
      expect(testRes.status).toBe(200);
      const testJson = await testRes.json();
      expect(testJson.code).toBe(0);
      expect(testJson.data.success).toBe(true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
