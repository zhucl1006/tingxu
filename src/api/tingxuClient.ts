/**
 * 听序（Tingxu）— 深度客户端网络通信契约模块 (TingxuClient)
 *
 * 核心架构定位：
 * 作为 UI 视图与服务端/AI Gateway 之间的深度网络适配接缝（Seam），
 * 负责主机寻址、Token 注入、网络故障自愈与响应模型反序列化。
 * 提供 HttpTingxuClient（生产通信）与 MockTingxuClient（单元测试/离线模拟）双适配器。
 */

export interface AuthUserInfo {
  userId: string;
  phone: string;
}

export interface LoginResult {
  token: string;
  user: AuthUserInfo;
}

export interface CreateOrderResult {
  orderNo: string;
  planName: string;
  priceYuan: number;
  actualPriceCents: number;
  codeUrl?: string;
}

export interface CopilotChatSegment {
  id: string;
  speaker: string;
  text: string;
}

export interface CopilotChatRequest {
  meetingId: string;
  question: string;
  transcripts: CopilotChatSegment[];
  currentSummary?: any;
  asOfTextVersion?: number;
}

export interface CopilotChatResponse {
  answer: string;
  citations: any[];
  proposals?: any[];
}

export interface GatewayHealthResult {
  ok: boolean;
  status?: string;
  activeConfig?: any;
}

export interface TingxuClient {
  auth: {
    sendSms(phone: string): Promise<{ success: boolean; message: string }>;
    loginWithSms(phone: string, code: string): Promise<LoginResult>;
  };
  billing: {
    createOrder(planId: string, userId?: string): Promise<CreateOrderResult>;
    notifyPayment(orderNo: string, priceYuan: number): Promise<boolean>;
  };
  copilot: {
    chat(req: CopilotChatRequest): Promise<CopilotChatResponse>;
  };
  health: {
    checkGateway(gatewayUrl?: string): Promise<GatewayHealthResult>;
  };
}

export interface HttpTingxuClientOptions {
  controlPlaneUrl?: string;
  gatewayUrl?: string;
  fetchFn?: typeof fetch;
}

/**
 * 生产环境 HTTP 通信适配器 (HttpTingxuClient)
 */
export class HttpTingxuClient implements TingxuClient {
  private controlPlaneUrl?: string;
  private gatewayUrl?: string;
  private customFetchFn?: typeof fetch;

  constructor(options?: HttpTingxuClientOptions) {
    this.controlPlaneUrl = options?.controlPlaneUrl;
    this.gatewayUrl = options?.gatewayUrl;
    this.customFetchFn = options?.fetchFn;
  }

  public setGatewayUrl(url: string) {
    if (url) this.gatewayUrl = url;
  }

  public setControlPlaneUrl(url: string) {
    if (url) this.controlPlaneUrl = url;
  }

  private getFetch(): typeof fetch {
    return this.customFetchFn || (typeof globalThis !== 'undefined' ? globalThis.fetch : fetch);
  }

  private getControlPlaneUrl(): string {
    return this.controlPlaneUrl || 'http://localhost:3200';
  }

  private getGatewayUrl(targetUrl?: string): string {
    if (targetUrl) return targetUrl;
    if (this.gatewayUrl) return this.gatewayUrl;
    try {
      const storeState = (globalThis as any)?.__TINGXU_STORE_GATEWAY_URL__;
      if (storeState) return storeState;
    } catch {}
    return 'http://localhost:3100';
  }

  private async requestJson<T>(url: string, init: RequestInit, errorPrefix = '网络请求失败'): Promise<T> {
    let res: Response;
    const fetcher = this.getFetch();
    try {
      res = await fetcher(url, init);
    } catch (e) {
      throw new Error(`${errorPrefix}: ${(e as Error).message}`);
    }

    let json: any = {};
    try {
      json = await res.json();
    } catch {
      if (!res.ok) {
        throw new Error(`${errorPrefix} (HTTP ${res.status})`);
      }
    }

    if (!res.ok || json.code !== 0) {
      throw new Error(json.message || `${errorPrefix} (HTTP ${res.status})`);
    }

    return json;
  }

  public auth = {
    sendSms: async (phone: string): Promise<{ success: boolean; message: string }> => {
      const cpUrl = this.getControlPlaneUrl();
      const json = await this.requestJson<{ code: number; message: string }>(
        `${cpUrl}/v1/auth/sms/send`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        },
        `无法连接控制面服务端 (${cpUrl})`
      );
      return { success: true, message: json.message || '短信验证码已下发' };
    },

    loginWithSms: async (phone: string, code: string): Promise<LoginResult> => {
      const json = await this.requestJson<{ code: number; data: LoginResult; message: string }>(
        `${this.getControlPlaneUrl()}/v1/auth/sms/login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, code }),
        },
        '无法连接控制面服务端'
      );
      if (!json.data?.token) {
        throw new Error(json.message || '验证码核验失败或已失效');
      }
      return json.data;
    },
  };

  public billing = {
    createOrder: async (planId: string, userId = 'usr_client_local'): Promise<CreateOrderResult> => {
      const json = await this.requestJson<{ code: number; data: any; message: string }>(
        `${this.getControlPlaneUrl()}/v1/orders`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, planId }),
        },
        '无法连接控制面服务端创建微信支付订单'
      );
      return {
        orderNo: json.data.orderNo,
        planName: json.data.planName,
        priceYuan: json.data.actualPriceCents / 100,
        actualPriceCents: json.data.actualPriceCents,
        codeUrl: json.data.codeUrl,
      };
    },

    notifyPayment: async (orderNo: string, priceYuan: number): Promise<boolean> => {
      try {
        const fetcher = this.getFetch();
        await fetcher(`${this.getControlPlaneUrl()}/v1/pay/wechat/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderNo,
            transactionId: `wx_mock_${Date.now()}`,
            amountCents: Math.round(priceYuan * 100),
          }),
        });
        return true;
      } catch {
        return false;
      }
    },
  };

  public copilot = {
    chat: async (req: CopilotChatRequest): Promise<CopilotChatResponse> => {
      const effectiveGatewayUrl = this.getGatewayUrl();
      const fetcher = this.getFetch();
      const res = await fetcher(`${effectiveGatewayUrl}/gateway/v1/meeting-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: req.meetingId,
          question: req.question,
          asOfTextVersion: req.asOfTextVersion ?? req.transcripts.length,
          localStableTranscript: req.transcripts.length
            ? req.transcripts.map((t) => ({ segmentId: t.id, speaker: t.speaker, text: t.text }))
            : [{ segmentId: 'seg_init', speaker: '系统', text: '本场会议已就绪。' }],
          currentSummary: req.currentSummary,
        }),
      });

      if (!res.ok) {
        throw new Error(`AI Gateway 问答异常 (HTTP ${res.status})`);
      }

      const json = await res.json();
      return {
        answer: json.data?.answer || '已完成分析。',
        citations: json.data?.evidenceRefs || json.data?.citations || [],
        proposals: json.data?.proposals || [],
      };
    },
  };

  public health = {
    checkGateway: async (targetGatewayUrl?: string): Promise<GatewayHealthResult> => {
      const url = targetGatewayUrl || this.gatewayUrl || 'http://localhost:3100';
      try {
        const fetcher = this.getFetch();
        const res = await fetcher(`${url}/gateway/v1/health`);
        if (!res.ok) return { ok: false };
        const json = await res.json();
        return { ok: true, status: json.status, activeConfig: json.activeConfig };
      } catch {
        return { ok: false };
      }
    },
  };
}

/**
 * 单元测试与离线开发适配器 (MockTingxuClient)
 */
export class MockTingxuClient implements TingxuClient {
  public auth = {
    sendSms: async (phone: string) => ({
      success: true,
      message: `短信验证码已下发至您的手机 ${phone}，请查收`,
    }),
    loginWithSms: async (phone: string, _code: string) => ({
      token: `mock_jwt_token_${Date.now()}`,
      user: { userId: `usr_mock_${phone.slice(-4)}`, phone },
    }),
  };

  public billing = {
    createOrder: async (planId: string, _userId?: string) => ({
      orderNo: `ord_mock_${Date.now()}`,
      planName: planId.includes('pro') ? '100 小时大额时长包' : '30 小时专业版套餐',
      priceYuan: planId.includes('pro') ? 99.0 : 39.9,
      actualPriceCents: planId.includes('pro') ? 9900 : 3990,
      codeUrl: 'weixin://wxpay/bizpayurl?pr=mock_code_url',
    }),
    notifyPayment: async (_orderNo: string, _priceYuan: number) => true,
  };

  public copilot = {
    chat: async (req: CopilotChatRequest) => {
      const match = req.transcripts[0];
      return {
        answer: match ? `根据记录，${match.speaker}指出：${match.text}` : '已理解您的指令并处理完毕。',
        citations: match ? [{ segmentId: match.id, quote: match.text }] : [],
        proposals: req.question.includes('修改')
          ? [
              {
                targetSection: 'decisions',
                action: 'replace',
                itemIndex: 0,
                proposedText: req.question,
                reason: '按用户指令修正',
              },
            ]
          : [],
      };
    },
  };

  public health = {
    checkGateway: async () => ({ ok: true, status: 'healthy', activeConfig: { llmProvider: 'deepseek' } }),
  };
}

// 全局单例与测试注入接缝
let currentClient: TingxuClient = new HttpTingxuClient();

export function getTingxuClient(): TingxuClient {
  return currentClient;
}

export function setTingxuClient(client: TingxuClient): void {
  currentClient = client;
}

export function resetTingxuClient(): void {
  currentClient = new HttpTingxuClient();
}
