import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../src/auth/auth.service.js';
import { BillingEngine } from '../src/billing/billing.engine.js';
import { WechatPayService } from '../src/payment/wechat-pay.service.js';
import { OpsService } from '../src/ops/ops.service.js';
import { createControlPlaneServer } from '../src/server.js';

describe('听序商业控制面 (Control Plane) 核心服务测试', () => {
  let authService: AuthService;
  let billingEngine: BillingEngine;
  let wechatPayService: WechatPayService;
  let opsService: OpsService;

  beforeEach(() => {
    authService = new AuthService({ jwtSecret: 'test_secret_for_unit_tests' });
    billingEngine = new BillingEngine();
    wechatPayService = new WechatPayService({ billingEngine });
    opsService = new OpsService({ billingEngine });
  });

  describe('1. 手机号验证码认证与 60s 频控 (AC-01)', () => {
    it('发送验证码后 60 秒内重复请求应被频控拦截', async () => {
      const phone = '13800138000';
      const sendRes1 = await authService.sendSmsCode(phone);
      expect(sendRes1.success).toBe(true);

      // 60秒内立即再次发送，应报错
      await expect(authService.sendSmsCode(phone)).rejects.toThrow(/请 60 秒后再试/);
    });

    it('验证码核销后应立即一次性失效，并颁发有效 JWT', async () => {
      const phone = '13912345678';
      const sendRes = await authService.sendSmsCode(phone);
      const code = sendRes.debugCode!;

      // 错误验证码无法登录
      await expect(authService.loginWithSms(phone, '999999')).rejects.toThrow(/验证码无效/);

      // 正确验证码成功登录
      const loginRes = await authService.loginWithSms(phone, code);
      expect(loginRes.token).toBeTruthy();
      expect(loginRes.user.phone).toBe(phone);

      // 同一验证码再次使用应立即失效
      await expect(authService.loginWithSms(phone, code)).rejects.toThrow(/验证码无效或已过期/);
    });
  });

  describe('2. 会议时长权益账（预占、结算、释放与 Append-only 流水）', () => {
    it('应支持时长批次充值与总可用时长查询', async () => {
      const userId = 'usr_001';
      // 充值 3600 秒 (1小时)
      await billingEngine.grantBucket({
        userId,
        source: 'PURCHASE',
        totalSeconds: 3600,
        expireAt: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      });

      const balance = await billingEngine.getUserBalance(userId);
      expect(balance.totalAvailableSeconds).toBe(3600);
      expect(balance.reservedSeconds).toBe(0);
    });

    it('余额充足时应允许预占，超额时应拒绝', async () => {
      const userId = 'usr_002';
      await billingEngine.grantBucket({
        userId,
        source: 'PURCHASE',
        totalSeconds: 1800,
        expireAt: new Date(Date.now() + 86400 * 1000).toISOString(),
      });

      // 预占 1200 秒
      const resv = await billingEngine.reserveUsage({
        userId,
        meetingId: 'meet_01',
        estimatedSeconds: 1200,
      });
      expect(resv.reservationId).toBeTruthy();

      const balanceAfterResv = await billingEngine.getUserBalance(userId);
      expect(balanceAfterResv.totalAvailableSeconds).toBe(600);
      expect(balanceAfterResv.reservedSeconds).toBe(1200);

      // 再次超额预占 1000 秒，应抛出余额不足异常
      await expect(
        billingEngine.reserveUsage({
          userId,
          meetingId: 'meet_02',
          estimatedSeconds: 1000,
        })
      ).rejects.toThrow(/会议时长余额不足/);
    });

    it('结算应扣减实际消耗秒数，释放多余预占，并写入不可篡改流水', async () => {
      const userId = 'usr_003';
      await billingEngine.grantBucket({
        userId,
        source: 'PURCHASE',
        totalSeconds: 3600,
        expireAt: new Date(Date.now() + 86400 * 1000).toISOString(),
      });

      const resv = await billingEngine.reserveUsage({
        userId,
        meetingId: 'meet_10',
        estimatedSeconds: 1800,
      });

      // 实际会议只开了 1000 秒，执行结算
      await billingEngine.settleUsage({
        userId,
        reservationId: resv.reservationId,
        actualSeconds: 1000,
      });

      const finalBalance = await billingEngine.getUserBalance(userId);
      // 3600 - 1000 = 2600 秒
      expect(finalBalance.totalAvailableSeconds).toBe(2600);
      expect(finalBalance.reservedSeconds).toBe(0);

      // 验证不可篡改流水 UsageLedger
      const ledgers = await billingEngine.getLedgers(userId);
      expect(ledgers.length).toBeGreaterThanOrEqual(2); // 1 grant + 1 usage
      const usageEntry = ledgers.find((l) => l.action === 'DEDUCT');
      expect(usageEntry?.deltaSeconds).toBe(-1000);
    });

    it('任务失败时应全额释放预占，可用时长回滚', async () => {
      const userId = 'usr_004';
      await billingEngine.grantBucket({
        userId,
        source: 'PURCHASE',
        totalSeconds: 1800,
        expireAt: new Date(Date.now() + 86400 * 1000).toISOString(),
      });

      const resv = await billingEngine.reserveUsage({
        userId,
        meetingId: 'meet_fail',
        estimatedSeconds: 1000,
      });

      // 客户端报告任务取消或网络中断
      await billingEngine.releaseReservation({
        userId,
        reservationId: resv.reservationId,
      });

      const balance = await billingEngine.getUserBalance(userId);
      expect(balance.totalAvailableSeconds).toBe(1800);
      expect(balance.reservedSeconds).toBe(0);
    });
  });

  describe('3. 微信 Native 支付与 5 次并发回调幂等性 (AC-02)', () => {
    it('创建订单必须由服务端根据套餐快照绝对核算价格', async () => {
      const userId = 'usr_pay_01';
      const order = await wechatPayService.createOrder({
        userId,
        planId: 'plan_pro_monthly', // 30小时 = 108000秒，3900分 (39元)
      });

      expect(order.orderNo).toMatch(/^TX\d+/);
      expect(order.actualPriceCents).toBe(3900);
      expect(order.codeUrl).toContain('weixin://wxpay/bizpayurl');
      expect(order.status).toBe('PENDING');
    });

    it('微信支付 5 次并发回调应严格幂等，仅入账单次套餐时长', async () => {
      const userId = 'usr_pay_02';
      const order = await wechatPayService.createOrder({
        userId,
        planId: 'plan_pro_monthly',
      });

      const mockNotifyPayload = {
        orderNo: order.orderNo,
        transactionId: `wx_trans_${Date.now()}`,
        amountCents: 3900,
      };

      // 模拟微信网络波动，5 次同时并发回调
      const results = await Promise.all([
        wechatPayService.handlePaymentNotify(mockNotifyPayload),
        wechatPayService.handlePaymentNotify(mockNotifyPayload),
        wechatPayService.handlePaymentNotify(mockNotifyPayload),
        wechatPayService.handlePaymentNotify(mockNotifyPayload),
        wechatPayService.handlePaymentNotify(mockNotifyPayload),
      ]);

      // 每次调用都应成功返回处理结果（不给微信返回 500 导致无限重试）
      for (const res of results) {
        expect(res.success).toBe(true);
      }

      // 验证仅入账了 1 次该套餐时长 (108000 秒)
      const balance = await billingEngine.getUserBalance(userId);
      expect(balance.totalAvailableSeconds).toBe(108000);

      // 验证订单状态为 PAID
      const updatedOrder = await wechatPayService.getOrder(order.orderNo);
      expect(updatedOrder?.status).toBe('PAID');
    });
  });

  describe('4. 运营人员补偿申请与所有者审批工作流 (AC-03)', () => {
    it('普通运营人员仅可提交待审申请，无权直接发放', async () => {
      const operatorUser = { userId: 'op_01', role: 'OPERATOR' as const };
      const req = await opsService.submitCompensationRequest(operatorUser, {
        targetUserId: 'usr_ops_01',
        grantSeconds: 7200,
        reason: '音频丢帧故障补偿',
      });

      expect(req.requestId).toBeTruthy();
      expect(req.status).toBe('PENDING');

      // 目标用户此时尚未入账
      const balance = await billingEngine.getUserBalance('usr_ops_01');
      expect(balance.totalAvailableSeconds).toBe(0);
    });

    it('所有者 (Owner) 审批通过后方强事务发放生效，并写入审计流水', async () => {
      const operatorUser = { userId: 'op_02', role: 'OPERATOR' as const };
      const ownerUser = { userId: 'owner_01', role: 'OWNER' as const };

      const req = await opsService.submitCompensationRequest(operatorUser, {
        targetUserId: 'usr_ops_02',
        grantSeconds: 3600,
        reason: 'ASR 服务抖动补偿',
      });

      // 所有者审批同意
      const approveRes = await opsService.approveCompensation(ownerUser, req.requestId);
      expect(approveRes.status).toBe('APPROVED');

      // 目标用户成功获得补偿批次
      const balance = await billingEngine.getUserBalance('usr_ops_02');
      expect(balance.totalAvailableSeconds).toBe(3600);

      // 审计日志完整就绪
      const auditLogs = await opsService.getAuditLogs();
      const matchLog = auditLogs.find((l) => l.action === 'APPROVE_COMPENSATION');
      expect(matchLog).toBeDefined();
      expect(matchLog?.operatorId).toBe('owner_01');
    });

    it('所有者驳回申请应置为 REJECTED 且不发放额度', async () => {
      const operatorUser = { userId: 'op_03', role: 'OPERATOR' as const };
      const ownerUser = { userId: 'owner_01', role: 'OWNER' as const };

      const req = await opsService.submitCompensationRequest(operatorUser, {
        targetUserId: 'usr_ops_03',
        grantSeconds: 1800,
        reason: '申请理由不充分',
      });

      const rejectRes = await opsService.rejectCompensation(ownerUser, req.requestId, '理由不充分');
      expect(rejectRes.status).toBe('REJECTED');

      const balance = await billingEngine.getUserBalance('usr_ops_03');
      expect(balance.totalAvailableSeconds).toBe(0);
    });
  });

  describe('5. 运营后台脱敏与 Zero-Content 隐私合规 (AC-04)', () => {
    it('查询用户列表与详情时手机号必须脱敏且物理无会议文本', async () => {
      const userList = await opsService.getDesensitizedUsers([
        { userId: 'u1', phone: '13812345678', createdAt: '2026-10-30' },
        { userId: 'u2', phone: '18999887766', createdAt: '2026-10-30' },
      ]);

      for (const u of userList) {
        expect(u.maskedPhone).toMatch(/^1\d{2}\*\*\*\*\d{4}$/);
        expect((u as any).meetingText).toBeUndefined();
        expect((u as any).transcript).toBeUndefined();
      }
    });
  });

  describe('6. 控制面 HTTP 服务端到端接口验证', () => {
    it('健康检查 /v1/health 应返回正常状态', async () => {
      const { server } = createControlPlaneServer({
        authService,
        billingEngine,
        wechatPayService,
        opsService,
      });

      await new Promise<void>((resolve) => server.listen(0, resolve));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;

      const res = await fetch(`http://127.0.0.1:${port}/v1/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(data.service).toBe('tingxu-control-plane');

      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('创建订单与查询余额接口应正常响应', async () => {
      const { server } = createControlPlaneServer({
        authService,
        billingEngine,
        wechatPayService,
        opsService,
      });

      await new Promise<void>((resolve) => server.listen(0, resolve));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;

      // 创建订单
      const orderRes = await fetch(`http://127.0.0.1:${port}/v1/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'u_http_test', planId: 'plan_pro_monthly' }),
      });
      expect(orderRes.status).toBe(200);
      const orderJson = await orderRes.json();
      expect(orderJson.code).toBe(0);
      expect(orderJson.data.orderNo).toBeDefined();

      // 查询余额
      const balRes = await fetch(`http://127.0.0.1:${port}/v1/billing/balance?userId=u_http_test`);
      expect(balRes.status).toBe(200);
      const balJson = await balRes.json();
      expect(balJson.code).toBe(0);
      expect(balJson.data.totalAvailableSeconds).toBeDefined();

      // Web 运营管理控制台首页 HTML 响应
      const htmlRes = await fetch(`http://127.0.0.1:${port}/admin`);
      expect(htmlRes.status).toBe(200);
      expect(htmlRes.headers.get('content-type')).toContain('text/html');
      const htmlText = await htmlRes.text();
      expect(htmlText).toContain('听序 Tingxu · 商业控制面运营管理系统');
      expect(htmlText).toContain('时长补偿与赠送审批工单');

      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
  });
});
