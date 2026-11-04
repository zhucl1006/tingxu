import type { AiModelProvider, TokenUsage } from '../adapters/types.js';

export interface ModelCostRate {
  promptYuanPerThousand: number;
  completionYuanPerThousand: number;
}

export const MODEL_PRICING: Record<AiModelProvider, ModelCostRate> = {
  deepseek: {
    promptYuanPerThousand: 0.002,
    completionYuanPerThousand: 0.008,
  },
  qwen: {
    promptYuanPerThousand: 0.004,
    completionYuanPerThousand: 0.012,
  },
};

export interface AsrCostRate {
  yuanPerSecond: number;
}

export const ASR_PRICING: Record<string, AsrCostRate> = {
  dashscope: {
    // 阿里云百炼 Paraformer 实时语音识别官方标准：约 0.00033元/秒 (约 0.02元/分钟，1.2元/小时)
    yuanPerSecond: 0.00033,
  },
};

export interface CostCalculationResult {
  provider: AiModelProvider;
  promptCostYuan: number;
  completionCostYuan: number;
  costYuan: number;
  usage: TokenUsage;
}

export interface AsrCostCalculationResult {
  provider: string;
  audioSeconds: number;
  ratePerSecond: number;
  costYuan: number;
}

export function calculateModelCost(
  provider: AiModelProvider,
  usage: TokenUsage
): CostCalculationResult {
  const rate = MODEL_PRICING[provider] || MODEL_PRICING.deepseek;

  const promptCostYuan = (usage.promptTokens / 1000) * rate.promptYuanPerThousand;
  const completionCostYuan = (usage.completionTokens / 1000) * rate.completionYuanPerThousand;
  const costYuan = promptCostYuan + completionCostYuan;

  return {
    provider,
    promptCostYuan,
    completionCostYuan,
    costYuan,
    usage,
  };
}

export function calculateAsrCost(
  audioSeconds: number,
  provider: string = 'dashscope'
): AsrCostCalculationResult {
  const rate = ASR_PRICING[provider] || ASR_PRICING.dashscope;
  const safeSeconds = Math.max(0, audioSeconds);
  const costYuan = safeSeconds * rate.yuanPerSecond;

  return {
    provider,
    audioSeconds: safeSeconds,
    ratePerSecond: rate.yuanPerSecond,
    costYuan,
  };
}

export type AiUsageType = 'llm_chat' | 'llm_insights' | 'llm_summary' | 'asr_stream';

export interface CalculateAiCostParams {
  type: AiUsageType;
  provider: string;
  usage?: TokenUsage;
  audioSeconds?: number;
}

export interface AiCostCalculationResult {
  type: AiUsageType;
  provider: string;
  costYuan: number;
  promptCostYuan?: number;
  completionCostYuan?: number;
  tokensTotal?: number;
  audioSeconds?: number;
}

export function calculateAiCost(params: CalculateAiCostParams): AiCostCalculationResult {
  if (params.type === 'asr_stream') {
    const asrRes = calculateAsrCost(params.audioSeconds ?? 0, params.provider);
    return {
      type: params.type,
      provider: params.provider,
      costYuan: asrRes.costYuan,
      audioSeconds: asrRes.audioSeconds,
    };
  }

  const modelRes = calculateModelCost(
    (params.provider === 'qwen' ? 'qwen' : 'deepseek') as AiModelProvider,
    params.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  );

  return {
    type: params.type,
    provider: params.provider,
    costYuan: modelRes.costYuan,
    promptCostYuan: modelRes.promptCostYuan,
    completionCostYuan: modelRes.completionCostYuan,
    tokensTotal: modelRes.usage.totalTokens,
  };
}
