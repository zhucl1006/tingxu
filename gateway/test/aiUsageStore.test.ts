import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AiUsageStore } from '../src/billing/aiUsageStore.js';

describe('AiUsageStore (TDD)', () => {
  const testStoragePath = path.resolve(process.cwd(), 'gateway/test/fixtures/ai-usage-test.json');

  beforeEach(() => {
    if (fs.existsSync(testStoragePath)) {
      fs.unlinkSync(testStoragePath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testStoragePath)) {
      fs.unlinkSync(testStoragePath);
    }
  });

  it('应成功记录 LLM 问答用量，并自动计算花费与聚合统计', async () => {
    const store = new AiUsageStore({ storageFilePath: testStoragePath });

    const rec = await store.recordUsage({
      type: 'llm_chat',
      provider: 'deepseek',
      model: 'deepseek-chat',
      promptTokens: 1000,
      completionTokens: 2000,
      latencyMs: 350,
      status: 200,
      meetingId: 'mtg_001',
    });

    expect(rec.id).toMatch(/^usage_/);
    expect(rec.costYuan).toBeCloseTo(0.018, 4);
    expect(rec.totalTokens).toBe(3000);

    const stats = store.getStats();
    expect(stats.totalCalls).toBe(1);
    expect(stats.totalCostYuan).toBeCloseTo(0.018, 4);
    expect(stats.todayCostYuan).toBeCloseTo(0.018, 4);
    expect(stats.totalTokens).toBe(3000);
    expect(stats.byProvider['deepseek'].costYuan).toBeCloseTo(0.018, 4);
    expect(stats.byType['llm_chat'].costYuan).toBeCloseTo(0.018, 4);
  });

  it('应成功记录 ASR 语音流用量并在统计中汇总音频时长', async () => {
    const store = new AiUsageStore({ storageFilePath: testStoragePath });

    await store.recordUsage({
      type: 'asr_stream',
      provider: 'dashscope',
      model: 'paraformer-realtime-v2',
      audioSeconds: 60,
      latencyMs: 60000,
      status: 200,
      meetingId: 'mtg_002',
    });

    const stats = store.getStats();
    expect(stats.totalCalls).toBe(1);
    expect(stats.totalAudioSeconds).toBe(60);
    expect(stats.totalCostYuan).toBeCloseTo(0.0198, 4);
    expect(stats.byProvider['dashscope'].costYuan).toBeCloseTo(0.0198, 4);
  });

  it('持久化落盘后，新实例应能重新恢复历史统计数据', async () => {
    const store1 = new AiUsageStore({ storageFilePath: testStoragePath });
    await store1.recordUsage({
      type: 'llm_summary',
      provider: 'deepseek',
      model: 'deepseek-chat',
      promptTokens: 2000,
      completionTokens: 1000,
      latencyMs: 1200,
      status: 200,
    });

    // 重新实例化 store2 从文件加载
    const store2 = new AiUsageStore({ storageFilePath: testStoragePath });
    const stats = store2.getStats();
    expect(stats.totalCalls).toBe(1);
    expect(stats.totalTokens).toBe(3000);
    expect(stats.recentRecords).toHaveLength(1);
    expect(stats.recentRecords[0].type).toBe('llm_summary');
  });

  it('Zero-Content 铁律：记录与统计对象严禁包含任何会议文本正文', async () => {
    const store = new AiUsageStore({ storageFilePath: testStoragePath });
    const rec = await store.recordUsage({
      type: 'llm_chat',
      provider: 'deepseek',
      model: 'deepseek-chat',
      promptTokens: 100,
      completionTokens: 100,
      latencyMs: 200,
      status: 200,
      // 传入非法的文本字段应被强力过滤丢弃
      ...({ text: '秘密会议', transcript: '会议逐字稿正文', question: '我的提问' } as any),
    });

    expect((rec as any).text).toBeUndefined();
    expect((rec as any).transcript).toBeUndefined();
    expect((rec as any).question).toBeUndefined();
  });
});
