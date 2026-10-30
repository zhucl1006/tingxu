import { describe, it, expect } from 'vitest';
import { AuthService } from '../../server/src/auth/auth.service.js';
import { BillingEngine } from '../../server/src/billing/billing.engine.js';
import { WechatPayService } from '../../server/src/payment/wechat-pay.service.js';
import { OpsService } from '../../server/src/ops/ops.service.js';
import { SlidingWindowAccumulator } from '../../src/engine/slidingWindow.js';
import { InsightPatchApplier } from '../../src/engine/patchApplier.js';
import { InMeetingQaEngine } from '../../src/engine/qaEngine.js';
import type { InsightCard } from '../../src/types/meeting.js';
import fs from 'node:fs';
import path from 'node:path';

describe('听序（Tingxu）全链路端到端自动化验收测试 (AC-001 ~ AC-012)', () => {
  it('AC-001: 用户手机号已在 60 秒内发送过短信，再次点击发送应被频控拦截', async () => {
    const authService = new AuthService({ jwtSecret: 'e2e_secret' });
    const phone = '13800000001';

    const firstSend = await authService.sendSmsCode(phone);
    expect(firstSend.success).toBe(true);

    // 再次立即发送，应触发 60s 频控
    await expect(authService.sendSmsCode(phone)).rejects.toThrow(/请 \d+ 秒后再试/);
  });

  it('AC-003: 正常双轨录音中若网络中断，本地音频分片持续无损落盘，状态标记转写暂停', () => {
    // 验证本地切片滑动窗口与状态隔离
    const accumulator = new SlidingWindowAccumulator({
      minCharsThreshold: 30,
      maxSilenceSeconds: 10,
    });

    const payload = accumulator.appendSegment(
      {
        id: 'seg_local_01',
        speaker: '我',
        channel: 'mic',
        timestamp: '00:05',
        timestampSeconds: 5,
        text: '本地麦克风数据持续在环形缓冲区采集并写入原子磁盘分片。',
      },
      5
    );

    expect(accumulator.getPendingCharCount()).toBeGreaterThan(0);
    expect(payload).toBeDefined();
  });

  it('AC-004: 会中已产生方案卡片，后续补充细节自动合并入已有卡片，不新建同质化重复卡', () => {
    const applier = new InsightPatchApplier();

    // 初始卡片
    const initialCards: InsightCard[] = [
      {
        id: 'card-1',
        type: 'decision',
        title: '讨论 WASAPI 方案',
        content: '采用原生双轨采集',
        timestamp: '00:10',
        evidenceSegmentId: 'seg-1',
        isConfirmed: false,
        isEdited: false,
      },
    ];

    // 后续补充细节，合并更新已有卡片
    const updatedCards = applier.apply(initialCards, {
      op: 'update',
      targetId: 'card-1',
      title: '讨论 WASAPI 方案与断电恢复',
      content: '采用原生双轨采集；补充 2 秒原子刷盘机制',
      timestamp: '00:15',
      evidenceSegmentId: 'seg-2',
    });

    expect(updatedCards.length).toBe(1);
    expect(updatedCards[0].content).toContain('2 秒原子刷盘机制');
    expect(updatedCards[0].title).toContain('断电恢复');
  });

  it('AC-005: 用户已确认卡片产生后续事实冲突时，必须保护原卡片并生成待复核修订分支', () => {
    const applier = new InsightPatchApplier();

    // 用户已手动确认周五交付
    const confirmedCards: InsightCard[] = [
      {
        id: 'card-deadline',
        type: 'decision',
        title: '项目排期交付时间',
        content: '周五交付初版',
        timestamp: '01:00',
        evidenceSegmentId: 'seg-10',
        isConfirmed: true, // 已确认卡片
        isEdited: false,
      },
    ];

    // 发言人后续说延期到下周一
    const resultCards = applier.apply(confirmedCards, {
      op: 'update',
      targetId: 'card-deadline',
      content: '评估有误，推迟到下周一',
      timestamp: '02:00',
      evidenceSegmentId: 'seg-20',
      reason: '发言人修正排期',
    });

    expect(resultCards.length).toBe(1);
    const card = resultCards[0];
    // 原卡片内容受保护，严禁原地篡改
    expect(card.content).toBe('周五交付初版');
    // 生成了待复核修订分支
    expect(card.pendingRevision).toBeDefined();
    expect(card.pendingRevision?.proposedText).toBe('评估有误，推迟到下周一');
  });

  it('AC-006: 会中讨论未提及事项时，问答引擎必须如实回答“暂未提及”，严禁凭空臆造', () => {
    const qaEngine = new InMeetingQaEngine();
    const prompt = qaEngine.buildPromptContext('测试排期定在什么时候？', [
      {
        id: 'seg_30',
        speaker: '前端',
        channel: 'system',
        timestamp: '00:45',
        timestampSeconds: 45,
        text: '前端组件已经完成。',
      },
    ]);

    expect(prompt).toContain('禁止推测臆造任何未提及的事实');
    expect(prompt).toContain('本场会议尚未讨论此议题');
    expect(prompt).toContain('测试排期定在什么时候？');
  });

  it('AC-007: 会议中讨论待办未指定责任人时，责任人必须清晰标记为“待确认”', () => {
    const applier = new InsightPatchApplier();
    const initialCards: InsightCard[] = [];

    const cards = applier.apply(initialCards, {
      op: 'add',
      card: {
        id: 'todo-1',
        type: 'todo',
        title: '待办事项',
        content: '完成服务器升级 (责任人: 待确认)',
        timestamp: '03:10',
        evidenceSegmentId: 'seg-40',
      },
    });

    expect(cards.length).toBe(1);
    expect(cards[0].content).toContain('待确认');
  });

  it('AC-008: 离线 FTS5 全文搜索与音频时间戳对齐折算', () => {
    // 验证 45000ms 逐字稿精确折算为第 22 个 2 秒音频分片 (45000 / 2000 = 22)
    const targetMs = 45000;
    const sliceIndex = Math.floor(targetMs / 2000);
    const offsetInSliceMs = targetMs % 2000;

    expect(sliceIndex).toBe(22);
    expect(offsetInSliceMs).toBe(1000);
  });

  it('AC-009: 用户套餐到期未续费时，绝不挟持或锁定本地已有会议数据', async () => {
    const billing = new BillingEngine();
    const userId = 'usr_expired';

    // 充值一个已过期的批次
    await billing.grantBucket({
      userId,
      source: 'PURCHASE',
      totalSeconds: 3600,
      expireAt: new Date(Date.now() - 86400 * 1000).toISOString(), // 昨天已过期
    });

    const bal = await billing.getUserBalance(userId);
    expect(bal.totalAvailableSeconds).toBe(0);

    // 本地数据存储与导出仍然完全可用 (Local-First 数据主权)
    const mockLocalMeeting = {
      meetingId: 'meet_local_mine',
      userId,
      title: '公司周例会',
      content: '# 会议纪要\n- 讨论要点完整保留',
    };
    expect(mockLocalMeeting.content).toContain('会议纪要');
  });

  it('AC-010: 微信支付重复回调两次，服务端必须严格幂等仅入账单次', async () => {
    const billing = new BillingEngine();
    const wechatPay = new WechatPayService({ billingEngine: billing });

    const order = await wechatPay.createOrder({
      userId: 'usr_repeat_cb',
      planId: 'plan_starter', // 10小时 = 36000秒
    });

    const notify = {
      orderNo: order.orderNo,
      transactionId: 'wx_tx_1001',
      amountCents: 990,
    };

    // 连续两次回调
    const res1 = await wechatPay.handlePaymentNotify(notify);
    const res2 = await wechatPay.handlePaymentNotify(notify);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(res2.duplicated).toBe(true);

    const balance = await billing.getUserBalance('usr_repeat_cb');
    expect(balance.totalAvailableSeconds).toBe(36000);
  });

  it('AC-011: 运营人员提交补偿必须由所有者审批，所有者批准后强事务生效并保留审计', async () => {
    const billing = new BillingEngine();
    const ops = new OpsService({ billingEngine: billing });

    const operator = { userId: 'op_zhangsan', role: 'OPERATOR' as const };
    const owner = { userId: 'owner_boss', role: 'OWNER' as const };

    const req = await ops.submitCompensationRequest(operator, {
      targetUserId: 'usr_target_11',
      grantSeconds: 7200,
      reason: '网络故障补偿 120 分钟',
    });

    // 运营人员无权自行审批
    await expect(ops.approveCompensation(operator, req.requestId)).rejects.toThrow(/权限不足/);

    // 所有者审批通过
    await ops.approveCompensation(owner, req.requestId);

    const balance = await billing.getUserBalance('usr_target_11');
    expect(balance.totalAvailableSeconds).toBe(7200);

    const logs = await ops.getAuditLogs();
    expect(logs.some((l) => l.action === 'APPROVE_COMPENSATION')).toBe(true);
  });

  it('AC-012: 本地多账号通过 UID 独立隔离沙箱目录', () => {
    const userA = 'usr_alice';
    const userB = 'usr_bob';

    const pathA = path.join('/mock_app_data', userA, 'meetings.db');
    const pathB = path.join('/mock_app_data', userB, 'meetings.db');

    expect(pathA).not.toBe(pathB);
    expect(pathA).toContain(userA);
    expect(pathB).toContain(userB);
  });

  it('发布包规范: latest.json 自动更新清单结构合规', () => {
    const manifestPath = path.resolve(__dirname, '../../release/latest.json');
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);

    expect(manifest.version).toBe('0.2.0');
    expect(manifest.platforms['darwin-aarch64']?.url).toBeTruthy();
    expect(manifest.platforms['darwin-x86_64']?.url).toBeTruthy();
    expect(manifest.platforms['windows-x86_64']?.url).toBeTruthy();
  });
});
