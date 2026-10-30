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

export interface CostCalculationResult {
  provider: AiModelProvider;
  promptCostYuan: number;
  completionCostYuan: number;
  costYuan: number;
  usage: TokenUsage;
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
