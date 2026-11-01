import crypto from 'node:crypto';
import type { BillingEngine } from '../billing/billing.engine.js';

export type UserRole = 'USER' | 'OPERATOR' | 'OWNER';

export interface CompensationRequest {
  requestId: string;
  targetUserId: string;
  grantSeconds: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedBy: string;
  approvedBy?: string;
  rejectReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AuditEvent {
  eventId: string;
  operatorId: string;
  action: 'SUBMIT_COMPENSATION' | 'APPROVE_COMPENSATION' | 'REJECT_COMPENSATION';
  targetUserId?: string;
  details: Record<string, any>;
  timestamp: string;
}

export interface DesensitizedUser {
  userId: string;
  maskedPhone: string;
  createdAt: string;
  remainingSeconds: number;
  reservedSeconds: number;
}

export interface QueryUsersParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PagedUsersResult {
  list: DesensitizedUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export class OpsService {
  private readonly billingEngine: BillingEngine;
  private readonly requests = new Map<string, CompensationRequest>();
  private readonly auditLogs: AuditEvent[] = [];

  constructor(options: { billingEngine: BillingEngine }) {
    this.billingEngine = options.billingEngine;
  }

  public async submitCompensationRequest(
    operator: { userId: string; role: UserRole },
    params: { targetUserId: string; grantSeconds: number; reason: string }
  ): Promise<CompensationRequest> {
    const requestId = `comp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const req: CompensationRequest = {
      requestId,
      targetUserId: params.targetUserId,
      grantSeconds: params.grantSeconds,
      reason: params.reason,
      status: 'PENDING',
      submittedBy: operator.userId,
      createdAt: new Date().toISOString(),
    };

    this.requests.set(requestId, req);

    this.recordAudit({
      operatorId: operator.userId,
      action: 'SUBMIT_COMPENSATION',
      targetUserId: params.targetUserId,
      details: { requestId, grantSeconds: params.grantSeconds, reason: params.reason },
    });

    return req;
  }

  public async approveCompensation(
    approver: { userId: string; role: UserRole },
    requestId: string
  ): Promise<CompensationRequest> {
    if (approver.role !== 'OWNER') {
      throw new Error('权限不足：仅系统所有者 (Owner) 有权审批时长发放');
    }

    const req = this.requests.get(requestId);
    if (!req || req.status !== 'PENDING') {
      throw new Error('申请单不存在或已被处理');
    }

    req.status = 'APPROVED';
    req.approvedBy = approver.userId;
    req.updatedAt = new Date().toISOString();

    // 强事务：发放补偿时长批次 (有效期 90 天)
    const expireAt = new Date(Date.now() + 90 * 86400 * 1000).toISOString();
    await this.billingEngine.grantBucket({
      userId: req.targetUserId,
      source: 'COMPENSATION',
      totalSeconds: req.grantSeconds,
      expireAt,
      metadata: {
        compensationRequestId: req.requestId,
        reason: req.reason,
        approvedBy: approver.userId,
      },
    });

    this.recordAudit({
      operatorId: approver.userId,
      action: 'APPROVE_COMPENSATION',
      targetUserId: req.targetUserId,
      details: { requestId, grantSeconds: req.grantSeconds },
    });

    return req;
  }

  public async rejectCompensation(
    approver: { userId: string; role: UserRole },
    requestId: string,
    rejectReason: string
  ): Promise<CompensationRequest> {
    if (approver.role !== 'OWNER') {
      throw new Error('权限不足：仅系统所有者 (Owner) 有权审核');
    }

    const req = this.requests.get(requestId);
    if (!req || req.status !== 'PENDING') {
      throw new Error('申请单不存在或已被处理');
    }

    req.status = 'REJECTED';
    req.approvedBy = approver.userId;
    req.rejectReason = rejectReason;
    req.updatedAt = new Date().toISOString();

    this.recordAudit({
      operatorId: approver.userId,
      action: 'REJECT_COMPENSATION',
      targetUserId: req.targetUserId,
      details: { requestId, rejectReason },
    });

    return req;
  }

  public async getDesensitizedUsers(
    users: Array<{ userId: string; phone: string; createdAt: string }>
  ): Promise<DesensitizedUser[]> {
    return Promise.all(
      users.map(async (u) => {
        const maskedPhone = u.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
        let remainingSeconds = 0;
        let reservedSeconds = 0;
        if (this.billingEngine) {
          const balance = await this.billingEngine.getUserBalance(u.userId);
          remainingSeconds = balance.totalAvailableSeconds;
          reservedSeconds = balance.reservedSeconds;
        }
        return {
          userId: u.userId,
          maskedPhone,
          createdAt: u.createdAt,
          remainingSeconds,
          reservedSeconds,
        };
      })
    );
  }

  public async queryDesensitizedUsers(
    users: Array<{ userId: string; phone: string; createdAt: string }>,
    params?: QueryUsersParams
  ): Promise<PagedUsersResult> {
    const rawSearch = (params?.search || '').trim().toLowerCase();

    let filtered = users;
    if (rawSearch) {
      filtered = users.filter((u) => {
        const phone = (u.phone || '').toLowerCase();
        const userId = (u.userId || '').toLowerCase();
        return phone.includes(rawSearch) || userId.includes(rawSearch);
      });
    }

    const total = filtered.length;
    const page = Math.max(1, Number(params?.page) || 1);
    const pageSize = Math.max(1, Number(params?.pageSize) || 10);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const startIndex = (page - 1) * pageSize;
    const pagedUsers = filtered.slice(startIndex, startIndex + pageSize);

    const list = await this.getDesensitizedUsers(pagedUsers);

    return {
      list,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  public async getAuditLogs(): Promise<AuditEvent[]> {
    return this.auditLogs;
  }

  public async getAllCompensationRequests(): Promise<CompensationRequest[]> {
    return Array.from(this.requests.values());
  }

  private recordAudit(event: Omit<AuditEvent, 'eventId' | 'timestamp'>): void {
    this.auditLogs.push({
      eventId: `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      timestamp: new Date().toISOString(),
      ...event,
    });
  }
}
