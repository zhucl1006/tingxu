import { CircuitBreaker } from '../breaker/circuitBreaker.js';
import type {
  ModelAdapter,
  LiveInsightRequest,
  MeetingChatRequest,
  MeetingSummaryRequest,
  MeetingStructuredSummary,
  InsightPatchPayload,
  ChatResponsePayload,
  ModelExecutionResult,
} from '../adapters/types.js';

export interface ResilientModelEngineOptions {
  primaryAdapter: ModelAdapter;
  fallbackAdapter: ModelAdapter;
  primaryBreakerOptions?: {
    failureThreshold?: number;
    resetTimeoutMs?: number;
    timeoutMs?: number;
  };
  fallbackBreakerOptions?: {
    failureThreshold?: number;
    resetTimeoutMs?: number;
    timeoutMs?: number;
  };
}

/**
 * 听序 AI Gateway — 深度容灾调度引擎 (ResilientModelEngine)
 * 封装主备模型执行、滑动窗口熔断器与自动无缝切备，统一消除任务间的重复 try/catch 与重试样板。
 */
export class ResilientModelEngine {
  public primaryAdapter: ModelAdapter;
  public fallbackAdapter: ModelAdapter;
  public readonly primaryBreaker: CircuitBreaker;
  public readonly fallbackBreaker: CircuitBreaker;

  constructor(options: ResilientModelEngineOptions) {
    this.primaryAdapter = options.primaryAdapter;
    this.fallbackAdapter = options.fallbackAdapter;
    this.primaryBreaker = new CircuitBreaker(options.primaryBreakerOptions);
    this.fallbackBreaker = new CircuitBreaker(options.fallbackBreakerOptions);
  }

  public updateAdapters(options: { primaryAdapter: ModelAdapter; fallbackAdapter?: ModelAdapter }) {
    this.primaryAdapter = options.primaryAdapter;
    if (options.fallbackAdapter) {
      this.fallbackAdapter = options.fallbackAdapter;
    }
  }

  /**
   * 统一容灾执行骨架：优先主模型与熔断保护，故障时降级至备用模型
   */
  public async executeWithFallback<T>(
    operationName: string,
    run: (adapter: ModelAdapter) => Promise<ModelExecutionResult<T>>
  ): Promise<ModelExecutionResult<T>> {
    try {
      return await this.primaryBreaker.execute(async () => {
        return await run(this.primaryAdapter);
      });
    } catch (primaryError) {
      console.warn(
        `[ResilientModelEngine] Primary model ${this.primaryAdapter.provider} failed for ${operationName}. Falling back to ${this.fallbackAdapter.provider}. Reason: ${(primaryError as Error).message}`
      );

      const fallbackResult = await this.fallbackBreaker.execute(async () => {
        return await run(this.fallbackAdapter);
      });

      return {
        ...fallbackResult,
        fallbackTriggered: true,
      };
    }
  }

  public async generateInsightStream(
    req: LiveInsightRequest,
    onPatch: (patch: InsightPatchPayload) => void
  ): Promise<ModelExecutionResult<InsightPatchPayload[]>> {
    return this.executeWithFallback('generateInsightStream', (adapter) =>
      adapter.generateInsightStream(req, onPatch)
    );
  }

  public async chat(req: MeetingChatRequest): Promise<ModelExecutionResult<ChatResponsePayload>> {
    return this.executeWithFallback('chat', (adapter) => adapter.chat(req));
  }

  public async summarize(
    req: MeetingSummaryRequest
  ): Promise<ModelExecutionResult<MeetingStructuredSummary>> {
    return this.executeWithFallback('summarize', (adapter) => adapter.summarize(req));
  }

  public getBreakerStats() {
    return {
      primary: {
        provider: this.primaryAdapter.provider,
        ...this.primaryBreaker.getStats(),
      },
      fallback: {
        provider: this.fallbackAdapter.provider,
        ...this.fallbackBreaker.getStats(),
      },
    };
  }
}

// 保持历史导出别名完全兼容
export { ResilientModelEngine as ModelRouter };
export type { ResilientModelEngineOptions as ModelRouterOptions };
