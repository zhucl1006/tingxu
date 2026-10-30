import { CircuitBreaker } from '../breaker/circuitBreaker.js';
import type {
  ModelAdapter,
  LiveInsightRequest,
  MeetingChatRequest,
  InsightPatchPayload,
  ChatResponsePayload,
  ModelExecutionResult,
} from '../adapters/types.js';

export interface ModelRouterOptions {
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

export class ModelRouter {
  public readonly primaryAdapter: ModelAdapter;
  public readonly fallbackAdapter: ModelAdapter;
  public readonly primaryBreaker: CircuitBreaker;
  public readonly fallbackBreaker: CircuitBreaker;

  constructor(options: ModelRouterOptions) {
    this.primaryAdapter = options.primaryAdapter;
    this.fallbackAdapter = options.fallbackAdapter;
    this.primaryBreaker = new CircuitBreaker(options.primaryBreakerOptions);
    this.fallbackBreaker = new CircuitBreaker(options.fallbackBreakerOptions);
  }

  public async generateInsightStream(
    req: LiveInsightRequest,
    onPatch: (patch: InsightPatchPayload) => void
  ): Promise<ModelExecutionResult<InsightPatchPayload[]>> {
    try {
      return await this.primaryBreaker.execute(async () => {
        return await this.primaryAdapter.generateInsightStream(req, onPatch);
      });
    } catch (primaryError) {
      console.warn(
        `[ModelRouter] Primary model ${this.primaryAdapter.provider} failed or breaker open. Falling back to ${this.fallbackAdapter.provider}. Reason: ${(primaryError as Error).message}`
      );

      const fallbackResult = await this.fallbackBreaker.execute(async () => {
        return await this.fallbackAdapter.generateInsightStream(req, onPatch);
      });

      return {
        ...fallbackResult,
        fallbackTriggered: true,
      };
    }
  }

  public async chat(req: MeetingChatRequest): Promise<ModelExecutionResult<ChatResponsePayload>> {
    try {
      return await this.primaryBreaker.execute(async () => {
        return await this.primaryAdapter.chat(req);
      });
    } catch (primaryError) {
      console.warn(
        `[ModelRouter] Primary model ${this.primaryAdapter.provider} failed. Falling back to ${this.fallbackAdapter.provider}. Reason: ${(primaryError as Error).message}`
      );

      const fallbackResult = await this.fallbackBreaker.execute(async () => {
        return await this.fallbackAdapter.chat(req);
      });

      return {
        ...fallbackResult,
        fallbackTriggered: true,
      };
    }
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
