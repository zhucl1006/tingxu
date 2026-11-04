import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HttpTingxuClient,
  MockTingxuClient,
  getTingxuClient,
  setTingxuClient,
  resetTingxuClient,
} from '../tingxuClient';

describe('TingxuClient 客户端网络适配模块测试 (TDD Red -> Green)', () => {
  beforeEach(() => {
    resetTingxuClient();
    vi.restoreAllMocks();
  });

  describe('1. MockTingxuClient 测试适配器', () => {
    it('Mock 客户端应在无需网络的情况下完成短信发送与登录流程', async () => {
      const client = new MockTingxuClient();

      const smsResult = await client.auth.sendSms('13800000000');
      expect(smsResult.success).toBe(true);
      expect(smsResult.message).toContain('验证码已下发');

      const loginResult = await client.auth.loginWithSms('13800000000', '123456');
      expect(loginResult.token).toBeTruthy();
      expect(loginResult.user.phone).toBe('13800000000');
    });

    it('Mock 客户端应在无需网络的情况下模拟订单创建与微信支付回调', async () => {
      const client = new MockTingxuClient();

      const order = await client.billing.createOrder('plan_monthly_30h', 'usr_test_1');
      expect(order.orderNo).toMatch(/^ord_/);
      expect(order.priceYuan).toBe(39.9);

      const paid = await client.billing.notifyPayment(order.orderNo, order.priceYuan);
      expect(paid).toBe(true);
    });

    it('Mock 客户端应能模拟会中/会后问答推理并返回现场证据引用', async () => {
      const client = new MockTingxuClient();

      const chatRes = await client.copilot.chat({
        meetingId: 'mtg_mock_01',
        question: '会议定下的上线时间是什么？',
        transcripts: [
          { id: 'seg_1', speaker: '李四', text: '本周五下午四点发布。' },
        ],
      });

      expect(chatRes.answer).toContain('本周五下午四点发布');
      expect(chatRes.citations.length).toBeGreaterThan(0);
    });
  });

  describe('2. HttpTingxuClient 真实通信适配器与错误治理', () => {
    it('当 fetch 发生网络故障时，应捕获并转换为规范的领域错误', async () => {
      const client = new HttpTingxuClient({
        controlPlaneUrl: 'http://127.0.0.1:9999',
        fetchFn: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      });

      await expect(client.auth.sendSms('13800000000')).rejects.toThrow(/无法连接控制面服务端/);
    });

    it('当服务端返回非 0 业务错误码时，应提取 message 抛出异常', async () => {
      const client = new HttpTingxuClient({
        controlPlaneUrl: 'http://localhost:3200',
        fetchFn: vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({ code: 1001, message: '手机号格式错误' }),
        } as any),
      });

      await expect(client.auth.sendSms('invalid-phone')).rejects.toThrow('手机号格式错误');
    });
  });

  describe('3. 单例与接缝替换能力', () => {
    it('支持通过 setTingxuClient 在测试或离线环境下无缝切换适配器', () => {
      const mock = new MockTingxuClient();
      setTingxuClient(mock);
      expect(getTingxuClient()).toBe(mock);

      resetTingxuClient();
      expect(getTingxuClient()).toBeInstanceOf(HttpTingxuClient);
    });
  });
});
