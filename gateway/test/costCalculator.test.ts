import { describe, it, expect } from 'vitest';
import {
  calculateModelCost,
  calculateAsrCost,
  calculateAiCost,
  ASR_PRICING,
  MODEL_PRICING,
} from '../src/billing/costCalculator.js';

describe('AI Cost Calculator (TDD)', () => {
  it('应准确计算 DeepSeek LLM 调用的费用', () => {
    const result = calculateModelCost('deepseek', {
      promptTokens: 1000,
      completionTokens: 2000,
      totalTokens: 3000,
    });

    expect(result.provider).toBe('deepseek');
    expect(result.promptCostYuan).toBeCloseTo(0.002, 5);
    expect(result.completionCostYuan).toBeCloseTo(0.016, 5);
    expect(result.costYuan).toBeCloseTo(0.018, 5);
  });

  it('应准确计算通义千问 Qwen LLM 调用的费用', () => {
    const result = calculateModelCost('qwen', {
      promptTokens: 1000,
      completionTokens: 1000,
      totalTokens: 2000,
    });

    expect(result.provider).toBe('qwen');
    expect(result.promptCostYuan).toBeCloseTo(0.004, 5);
    expect(result.completionCostYuan).toBeCloseTo(0.012, 5);
    expect(result.costYuan).toBeCloseTo(0.016, 5);
  });

  it('应准确计算 DashScope ASR 实时语音识别流费用', () => {
    const result = calculateAsrCost(60, 'dashscope');
    expect(result.provider).toBe('dashscope');
    expect(result.audioSeconds).toBe(60);
    expect(result.costYuan).toBeCloseTo(60 * ASR_PRICING.dashscope.yuanPerSecond, 5);
    expect(result.costYuan).toBeCloseTo(0.0198, 4); // 60s * 0.00033
  });

  it('应通过统一 calculateAiCost 计算 LLM 与 ASR 费用', () => {
    const llmCost = calculateAiCost({
      type: 'llm_chat',
      provider: 'deepseek',
      usage: { promptTokens: 500, completionTokens: 500, totalTokens: 1000 },
    });
    expect(llmCost.costYuan).toBeCloseTo(0.001 + 0.004, 5);

    const asrCost = calculateAiCost({
      type: 'asr_stream',
      provider: 'dashscope',
      audioSeconds: 120,
    });
    expect(asrCost.costYuan).toBeCloseTo(120 * 0.00033, 5);
  });
});
