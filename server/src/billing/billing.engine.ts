import crypto from 'node:crypto';

export type BucketSource = 'PURCHASE' | 'COMPENSATION' | 'PROMOTION';
export type ReservationStatus = 'PENDING' | 'SETTLED' | 'RELEASED';
export type LedgerAction = 'GRANT' | 'RESERVE' | 'DEDUCT' | 'RELEASE';

export interface EntitlementBucket {
  bucketId: string;
  userId: string;
  source: BucketSource;
  totalSeconds: number;
  remainingSeconds: number;
  expireAt: string;
  createdAt: string;
}

export interface UsageReservation {
  reservationId: string;
  userId: string;
  meetingId: string;
  reservedSeconds: number;
  status: ReservationStatus;
  createdAt: string;
}

export interface UsageLedger {
  ledgerId: string;
  userId: string;
  action: LedgerAction;
  deltaSeconds: number;
  balanceAfter: number;
  metadata?: Record<string, any>;
  createdAt: string;
}

export class BillingEngine {
  private readonly buckets = new Map<string, EntitlementBucket>();
  private readonly reservations = new Map<string, UsageReservation>();
  private readonly ledgers: UsageLedger[] = [];

  /**
   * 发放时长批次 (购买、运营补偿或活动赠送)
   */
  public async grantBucket(params: {
    userId: string;
    source: BucketSource;
    totalSeconds: number;
    expireAt: string;
    metadata?: Record<string, any>;
  }): Promise<EntitlementBucket> {
    const bucketId = `bkt_${crypto.randomUUID().slice(0, 8)}`;
    const bucket: EntitlementBucket = {
      bucketId,
      userId: params.userId,
      source: params.source,
      totalSeconds: params.totalSeconds,
      remainingSeconds: params.totalSeconds,
      expireAt: params.expireAt,
      createdAt: new Date().toISOString(),
    };

    this.buckets.set(bucketId, bucket);

    const balance = await this.getUserBalance(params.userId);
    this.appendLedger({
      userId: params.userId,
      action: 'GRANT',
      deltaSeconds: params.totalSeconds,
      balanceAfter: balance.totalAvailableSeconds,
      metadata: params.metadata,
    });

    return bucket;
  }

  /**
   * 查询用户当前可用时长与进行中的预占时长
   */
  public async getUserBalance(userId: string): Promise<{
    totalAvailableSeconds: number;
    reservedSeconds: number;
  }> {
    const now = Date.now();
    let unreservedRemaining = 0;

    // 统计所有未过期的有效批次剩余秒数
    for (const b of this.buckets.values()) {
      if (b.userId === userId && new Date(b.expireAt).getTime() > now) {
        unreservedRemaining += b.remainingSeconds;
      }
    }

    // 统计当前处于 PENDING 冻结中的预占秒数
    let pendingReserved = 0;
    for (const r of this.reservations.values()) {
      if (r.userId === userId && r.status === 'PENDING') {
        pendingReserved += r.reservedSeconds;
      }
    }

    const totalAvailableSeconds = Math.max(0, unreservedRemaining - pendingReserved);

    return {
      totalAvailableSeconds,
      reservedSeconds: pendingReserved,
    };
  }

  /**
   * 任务发起前预占冻结时长
   */
  public async reserveUsage(params: {
    userId: string;
    meetingId: string;
    estimatedSeconds: number;
  }): Promise<UsageReservation> {
    const balance = await this.getUserBalance(params.userId);

    if (balance.totalAvailableSeconds < params.estimatedSeconds) {
      throw new Error(
        `会议时长余额不足：当前可用 ${Math.floor(balance.totalAvailableSeconds / 60)} 分钟，预估需要 ${Math.floor(params.estimatedSeconds / 60)} 分钟`
      );
    }

    const reservationId = `rsv_${crypto.randomUUID().slice(0, 10)}`;
    const reservation: UsageReservation = {
      reservationId,
      userId: params.userId,
      meetingId: params.meetingId,
      reservedSeconds: params.estimatedSeconds,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    this.reservations.set(reservationId, reservation);

    const afterBal = await this.getUserBalance(params.userId);
    this.appendLedger({
      userId: params.userId,
      action: 'RESERVE',
      deltaSeconds: -params.estimatedSeconds,
      balanceAfter: afterBal.totalAvailableSeconds,
      metadata: { reservationId, meetingId: params.meetingId },
    });

    return reservation;
  }

  /**
   * 任务完成：按实际消耗秒数核销，解冻预占，扣减批次
   */
  public async settleUsage(params: {
    userId: string;
    reservationId: string;
    actualSeconds: number;
  }): Promise<void> {
    const resv = this.reservations.get(params.reservationId);
    if (!resv || resv.userId !== params.userId || resv.status !== 'PENDING') {
      throw new Error('预占任务不存在或已结算/释放');
    }

    resv.status = 'SETTLED';

    // 先到期先扣减 (FIFO)
    let secondsToDeduct = params.actualSeconds;
    const userBuckets = Array.from(this.buckets.values())
      .filter((b) => b.userId === params.userId && b.remainingSeconds > 0)
      .sort((a, b) => new Date(a.expireAt).getTime() - new Date(b.expireAt).getTime());

    for (const b of userBuckets) {
      if (secondsToDeduct <= 0) break;
      const deductFromThis = Math.min(b.remainingSeconds, secondsToDeduct);
      b.remainingSeconds -= deductFromThis;
      secondsToDeduct -= deductFromThis;
    }

    const afterBal = await this.getUserBalance(params.userId);
    this.appendLedger({
      userId: params.userId,
      action: 'DEDUCT',
      deltaSeconds: -params.actualSeconds,
      balanceAfter: afterBal.totalAvailableSeconds,
      metadata: {
        reservationId: params.reservationId,
        reservedSeconds: resv.reservedSeconds,
        actualSeconds: params.actualSeconds,
      },
    });
  }

  /**
   * 任务异常失败或取消：全额释放预占
   */
  public async releaseReservation(params: {
    userId: string;
    reservationId: string;
  }): Promise<void> {
    const resv = this.reservations.get(params.reservationId);
    if (!resv || resv.userId !== params.userId || resv.status !== 'PENDING') {
      return;
    }

    resv.status = 'RELEASED';

    const afterBal = await this.getUserBalance(params.userId);
    this.appendLedger({
      userId: params.userId,
      action: 'RELEASE',
      deltaSeconds: resv.reservedSeconds,
      balanceAfter: afterBal.totalAvailableSeconds,
      metadata: { reservationId: params.reservationId },
    });
  }

  /**
   * 追加不可篡改流水 (Append-only)
   */
  private appendLedger(entry: Omit<UsageLedger, 'ledgerId' | 'createdAt'>): void {
    const ledger: UsageLedger = {
      ledgerId: `ldg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      createdAt: new Date().toISOString(),
      ...entry,
    };
    this.ledgers.push(ledger);
  }

  public async getLedgers(userId: string): Promise<UsageLedger[]> {
    return this.ledgers.filter((l) => l.userId === userId);
  }
}
