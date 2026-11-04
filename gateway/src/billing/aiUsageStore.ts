import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { calculateAiCost, type AiUsageType } from './costCalculator.js';

export interface AiUsageRecord {
  id: string;
  timestamp: string;
  type: AiUsageType;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  audioSeconds: number;
  costYuan: number;
  latencyMs: number;
  status: number;
  meetingId?: string;
}

export interface RecordUsageParams {
  type: AiUsageType;
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  audioSeconds?: number;
  latencyMs?: number;
  status?: number;
  meetingId?: string;
}

export interface UsageAggregationItem {
  costYuan: number;
  calls: number;
  tokens?: number;
  audioSeconds?: number;
}

export interface AiUsageStats {
  totalCostYuan: number;
  todayCostYuan: number;
  totalTokens: number;
  totalAudioSeconds: number;
  totalCalls: number;
  byProvider: Record<string, UsageAggregationItem>;
  byType: Record<string, UsageAggregationItem>;
  recentRecords: AiUsageRecord[];
}

export interface AiUsageStoreOptions {
  storageFilePath?: string;
  maxRecords?: number;
}

export class AiUsageStore {
  private readonly storageFilePath?: string;
  private readonly maxRecords: number;
  private records: AiUsageRecord[] = [];

  constructor(options?: AiUsageStoreOptions) {
    this.maxRecords = options?.maxRecords || 2000;
    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

    if (options?.storageFilePath) {
      this.storageFilePath = options.storageFilePath;
    } else if (process.env.AI_USAGE_STORAGE_PATH) {
      this.storageFilePath = process.env.AI_USAGE_STORAGE_PATH;
    } else if (!isTest) {
      this.storageFilePath = path.resolve(process.cwd(), 'data/ai-usage.json');
    }

    this.load();
  }

  private load(): void {
    if (!this.storageFilePath) return;
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          this.records = data;
        } else if (data && Array.isArray(data.records)) {
          this.records = data.records;
        }
      }
    } catch (e) {
      console.warn('[AiUsageStore] 无法加载历史用量记录:', (e as Error).message);
    }
  }

  private persist(): void {
    if (!this.storageFilePath) return;
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storageFilePath, JSON.stringify(this.records, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[AiUsageStore] 保存用量记录失败:', (e as Error).message);
    }
  }

  public async recordUsage(params: RecordUsageParams): Promise<AiUsageRecord> {
    const promptTokens = Number(params.promptTokens || 0);
    const completionTokens = Number(params.completionTokens || 0);
    const totalTokens = promptTokens + completionTokens;
    const audioSeconds = Number(params.audioSeconds || 0);

    const costResult = calculateAiCost({
      type: params.type,
      provider: params.provider,
      usage: { promptTokens, completionTokens, totalTokens },
      audioSeconds,
    });

    // 严格脱敏 Zero-Content 构造
    const record: AiUsageRecord = {
      id: `usage_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      timestamp: new Date().toISOString(),
      type: params.type,
      provider: params.provider,
      model: params.model,
      promptTokens,
      completionTokens,
      totalTokens,
      audioSeconds,
      costYuan: Number(costResult.costYuan.toFixed(6)),
      latencyMs: Number(params.latencyMs || 0),
      status: Number(params.status || 200),
      ...(params.meetingId ? { meetingId: String(params.meetingId) } : {}),
    };

    this.records.unshift(record);

    // 控制最大记录数防止无限膨胀
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(0, this.maxRecords);
    }

    this.persist();
    return record;
  }

  public getStats(): AiUsageStats {
    let totalCostYuan = 0;
    let todayCostYuan = 0;
    let totalTokens = 0;
    let totalAudioSeconds = 0;

    const byProvider: Record<string, UsageAggregationItem> = {};
    const byType: Record<string, UsageAggregationItem> = {};

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayTime = startOfToday.getTime();

    for (const r of this.records) {
      totalCostYuan += r.costYuan;
      totalTokens += r.totalTokens;
      totalAudioSeconds += r.audioSeconds;

      const recordTime = new Date(r.timestamp).getTime();
      if (recordTime >= startOfTodayTime) {
        todayCostYuan += r.costYuan;
      }

      // Provider 维度
      if (!byProvider[r.provider]) {
        byProvider[r.provider] = { costYuan: 0, calls: 0, tokens: 0, audioSeconds: 0 };
      }
      byProvider[r.provider].costYuan += r.costYuan;
      byProvider[r.provider].calls += 1;
      byProvider[r.provider].tokens = (byProvider[r.provider].tokens || 0) + r.totalTokens;
      byProvider[r.provider].audioSeconds = (byProvider[r.provider].audioSeconds || 0) + r.audioSeconds;

      // Type 维度
      if (!byType[r.type]) {
        byType[r.type] = { costYuan: 0, calls: 0, tokens: 0, audioSeconds: 0 };
      }
      byType[r.type].costYuan += r.costYuan;
      byType[r.type].calls += 1;
      byType[r.type].tokens = (byType[r.type].tokens || 0) + r.totalTokens;
      byType[r.type].audioSeconds = (byType[r.type].audioSeconds || 0) + r.audioSeconds;
    }

    return {
      totalCostYuan: Number(totalCostYuan.toFixed(4)),
      todayCostYuan: Number(todayCostYuan.toFixed(4)),
      totalTokens,
      totalAudioSeconds,
      totalCalls: this.records.length,
      byProvider,
      byType,
      recentRecords: this.records.slice(0, 100),
    };
  }
}
