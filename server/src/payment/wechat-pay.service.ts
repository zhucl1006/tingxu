import crypto from 'node:crypto';
import type { BillingEngine } from '../billing/billing.engine.js';

export interface PlanConfig {
  planId: string;
  name: string;
  priceCents: number;
  totalSeconds: number; // 会议时长秒数 (如 30 小时 = 108,000 秒)
  validDays: number;
}

export const SUPPORTED_PLANS: Record<string, PlanConfig> = {
  plan_starter: {
    planId: 'plan_starter',
    name: '基础体验包',
    priceCents: 990, // 9.90 元
    totalSeconds: 36000, // 10 小时
    validDays: 30,
  },
  plan_pro_monthly: {
    planId: 'plan_pro_monthly',
    name: '专业月度套餐',
    priceCents: 3900, // 39.00 元
    totalSeconds: 108000, // 30 小时
    validDays: 30,
  },
  plan_pro_annual: {
    planId: 'plan_pro_annual',
    name: '年度尊享套餐',
    priceCents: 39900, // 399.00 元
    totalSeconds: 1440000, // 400 小时
    validDays: 365,
  },
};

export interface OrderRecord {
  orderNo: string;
  userId: string;
  planId: string;
  planName: string;
  actualPriceCents: number;
  codeUrl: string;
  status: 'PENDING' | 'PAID' | 'REFUNDED' | 'EXPIRED';
  transactionId?: string;
  paidAt?: string;
  createdAt: string;
}

export class WechatPayService {
  private readonly billingEngine: BillingEngine;
  private readonly orders = new Map<string, OrderRecord>();
  // 内存锁用于防重放与并发控制
  private readonly processingLocks = new Set<string>();

  constructor(options: { billingEngine: BillingEngine }) {
    this.billingEngine = options.billingEngine;
  }

  public async createOrder(params: { userId: string; planId: string }): Promise<OrderRecord> {
    const plan = SUPPORTED_PLANS[params.planId];
    if (!plan) {
      throw new Error(`不支持的套餐类型: ${params.planId}`);
    }

    const orderNo = `TX${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const codeUrl = `weixin://wxpay/bizpayurl?pr=${crypto.randomBytes(6).toString('hex')}`;

    const order: OrderRecord = {
      orderNo,
      userId: params.userId,
      planId: plan.planId,
      planName: plan.name,
      actualPriceCents: plan.priceCents,
      codeUrl,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    this.orders.set(orderNo, order);
    return order;
  }

  public async handlePaymentNotify(payload: {
    orderNo: string;
    transactionId: string;
    amountCents: number;
  }): Promise<{ success: boolean; duplicated?: boolean }> {
    const order = this.orders.get(payload.orderNo);
    if (!order) {
      throw new Error(`未找到订单: ${payload.orderNo}`);
    }

    // 幂等防重放检查 1：若已支付，直接返回成功，严禁重复发放
    if (order.status === 'PAID') {
      return { success: true, duplicated: true };
    }

    // 并发竞争锁：防止同一个订单微秒级并发处理
    if (this.processingLocks.has(payload.orderNo)) {
      return { success: true, duplicated: true };
    }
    this.processingLocks.add(payload.orderNo);

    try {
      // 再次双重检查状态
      if ((order.status as string) === 'PAID') {
        return { success: true, duplicated: true };
      }

      const plan = SUPPORTED_PLANS[order.planId];
      if (!plan) {
        throw new Error(`未知套餐: ${order.planId}`);
      }

      order.status = 'PAID';
      order.transactionId = payload.transactionId;
      order.paidAt = new Date().toISOString();

      const expireAt = new Date(Date.now() + plan.validDays * 86400 * 1000).toISOString();

      // 发放时长批次入账
      await this.billingEngine.grantBucket({
        userId: order.userId,
        source: 'PURCHASE',
        totalSeconds: plan.totalSeconds,
        expireAt,
        metadata: {
          orderNo: order.orderNo,
          transactionId: payload.transactionId,
          priceCents: order.actualPriceCents,
        },
      });

      return { success: true };
    } finally {
      this.processingLocks.delete(payload.orderNo);
    }
  }

  public async getOrder(orderNo: string): Promise<OrderRecord | undefined> {
    return this.orders.get(orderNo);
  }
}
