import { sendAliyunSms } from '../auth/aliyun-sms.js';

export interface LlmConfig {
  provider: 'deepseek' | 'qwen' | 'openai' | 'custom';
  apiKey: string;
  baseUrl: string;
  model: string;
  fallbackModel?: string;
  temperature?: number;
}

export interface AsrConfig {
  provider: 'dashscope' | 'tencent' | 'funasr' | 'custom';
  apiKey: string;
  endpoint: string;
  sampleRate: number;
}

export interface SmsConfig {
  provider: 'aliyun' | 'tencent' | 'sandbox';
  accessKeyId: string;
  accessKeySecret: string;
  signName: string;
  templateCode: string;
}

export interface PaymentConfig {
  mchId: string;
  apiV3Key: string;
  certSerialNo?: string;
}

export interface SystemConfig {
  llm: LlmConfig;
  asr: AsrConfig;
  sms: SmsConfig;
  payment: PaymentConfig;
}

export function maskSecret(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 8) return '****';
  const prefix = secret.slice(0, 3);
  const suffix = secret.slice(-4);
  return `${prefix}****${suffix}`;
}

export function isMasked(value: string): boolean {
  return typeof value === 'string' && value.includes('****');
}

export class SystemConfigService {
  private config: SystemConfig;
  private gatewayReloadUrl: string;

  constructor(options?: { gatewayReloadUrl?: string }) {
    this.gatewayReloadUrl = options?.gatewayReloadUrl || process.env.GATEWAY_RELOAD_URL || 'http://localhost:3201/internal/config/reload';

    // 默认内置开箱可用标准预设
    this.config = {
      llm: {
        provider: 'deepseek',
        apiKey: process.env.DEEPSEEK_API_KEY || 'sk-deepseek-default-placeholder-key',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        fallbackModel: 'qwen-plus',
        temperature: 0.3,
      },
      asr: {
        provider: 'dashscope',
        apiKey: process.env.DASHSCOPE_API_KEY || 'sk-dashscope-asr-default-key',
        endpoint: 'wss://dashscope.aliyuncs.com/api-v1/tasks',
        sampleRate: 16000,
      },
      sms: {
        provider: 'aliyun',
        accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || 'LTAI5tPlaceholderKey',
        accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || 'SecretPlaceholder12345678',
        signName: '听序',
        templateCode: 'SMS_TINGXU_CODE',
      },
      payment: {
        mchId: process.env.WECHAT_MCHID || '1900000109',
        apiV3Key: process.env.WECHAT_APIV3_KEY || 'SecretApiV3Key1234567890abcdef',
      },
    };
  }

  public async getConfig(options: { masked: boolean }): Promise<SystemConfig> {
    const raw = JSON.parse(JSON.stringify(this.config)) as SystemConfig;
    if (!options.masked) {
      return raw;
    }

    // 执行脱敏
    return {
      llm: {
        ...raw.llm,
        apiKey: maskSecret(raw.llm.apiKey),
      },
      asr: {
        ...raw.asr,
        apiKey: maskSecret(raw.asr.apiKey),
      },
      sms: {
        ...raw.sms,
        accessKeySecret: maskSecret(raw.sms.accessKeySecret),
      },
      payment: {
        ...raw.payment,
        apiV3Key: maskSecret(raw.payment.apiV3Key),
      },
    };
  }

  public async updateConfig(partial: Partial<SystemConfig>): Promise<SystemConfig> {
    if (partial.llm) {
      const currentApiKey = this.config.llm.apiKey;
      const newApiKey = partial.llm.apiKey;
      this.config.llm = {
        ...this.config.llm,
        ...partial.llm,
        // 如果用户提交的是掩码，则保留原秘钥
        apiKey: newApiKey && !isMasked(newApiKey) ? newApiKey : currentApiKey,
      };
    }

    if (partial.asr) {
      const currentApiKey = this.config.asr.apiKey;
      const newApiKey = partial.asr.apiKey;
      this.config.asr = {
        ...this.config.asr,
        ...partial.asr,
        apiKey: newApiKey && !isMasked(newApiKey) ? newApiKey : currentApiKey,
      };
    }

    if (partial.sms) {
      const currentSecret = this.config.sms.accessKeySecret;
      const newSecret = partial.sms.accessKeySecret;
      this.config.sms = {
        ...this.config.sms,
        ...partial.sms,
        accessKeySecret: newSecret && !isMasked(newSecret) ? newSecret : currentSecret,
      };
    }

    if (partial.payment) {
      const currentKey = this.config.payment.apiV3Key;
      const newKey = partial.payment.apiV3Key;
      this.config.payment = {
        ...this.config.payment,
        ...partial.payment,
        apiV3Key: newKey && !isMasked(newKey) ? newKey : currentKey,
      };
    }

    // 尝试异步通知 AI Gateway 热重载
    this.notifyGatewayReload().catch((err) => {
      console.warn('[SystemConfigService] Gateway hot-reload notification warning:', err.message);
    });

    return this.getConfig({ masked: true });
  }

  public async notifyGatewayReload(): Promise<boolean> {
    try {
      const internalConfig = await this.getConfig({ masked: false });
      const res = await fetch(this.gatewayReloadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(internalConfig),
      });
      return res.ok;
    } catch {
      // 容错：网关可能在非 Docker 独立测试中未启动
      return false;
    }
  }

  public async testLlmConnection(options?: { provider?: string }): Promise<{ success: boolean; latencyMs: number; message: string }> {
    const start = Date.now();
    const provider = options?.provider || this.config.llm.provider;
    const apiKey = this.config.llm.apiKey;
    const baseUrl = this.config.llm.baseUrl;

    if (!apiKey || apiKey.includes('placeholder') || apiKey.startsWith('sk-deepseek-default')) {
      return {
        success: false,
        latencyMs: 0,
        message: `当前配置的是系统默认示例占位符 (${apiKey.slice(0, 10)}...)，请填入您在 DeepSeek 或通义千问控制台获取的真实有效 API Key。`,
      };
    }

    try {
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const latency = Date.now() - start;
      if (res.ok) {
        return {
          success: true,
          latencyMs: latency,
          message: `[${provider}] 真实大模型 API Key 验证通过！接口响应耗时 ${latency}ms。`,
        };
      } else {
        return {
          success: false,
          latencyMs: latency,
          message: `[${provider}] 鉴权未通过 HTTP ${res.status}: ${await res.text()}`,
        };
      }
    } catch (e) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: `[${provider}] 探活连接失败: ${(e as Error).message}`,
      };
    }
  }

  public async testSmsConnection(phone: string): Promise<{ success: boolean; message: string }> {
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      throw new Error('请输入有效的 11 位国内手机号');
    }

    const smsConfig = this.config.sms;
    if (smsConfig.provider === 'sandbox') {
      return {
        success: true,
        message: `[开发沙箱模式] 已模拟下发验证码至手机 ${phone.slice(0, 3)}****${phone.slice(-4)}，控制台已记录`,
      };
    }

    // 真实调用阿里云短信网关
    const testCode = String(Math.floor(100000 + Math.random() * 900000));
    const result = await sendAliyunSms({
      accessKeyId: smsConfig.accessKeyId,
      accessKeySecret: smsConfig.accessKeySecret,
      phoneNumbers: phone,
      signName: smsConfig.signName,
      templateCode: smsConfig.templateCode,
      templateParam: { code: testCode },
    });

    if (!result.success) {
      throw new Error(result.message);
    }

    return {
      success: true,
      message: result.message,
    };
  }
}
