import type { AiModelProvider } from '../adapters/types.js';

export interface AuditRecord {
  timestamp: string;
  requestId: string;
  meetingId: string;
  provider: AiModelProvider;
  modelVersion: string;
  tokensPrompt: number;
  tokensCompletion: number;
  latencyMs: number;
  status: number;
  fallbackTriggered?: boolean;
}

/**
 * 严格执行 Zero-Content 脱敏过滤：
 * 绝不允许记录逐字稿正文、用户提问、AI 回答、发言人等隐私内容。
 */
export function sanitizeAuditLog(raw: Record<string, any>): AuditRecord {
  return {
    timestamp: new Date().toISOString(),
    requestId: String(raw.requestId || `req_${Date.now()}`),
    meetingId: String(raw.meetingId || 'unknown_meeting'),
    provider: raw.provider as AiModelProvider,
    modelVersion: String(raw.modelVersion || 'unknown_model'),
    tokensPrompt: Number(raw.promptTokens ?? raw.tokensPrompt ?? 0),
    tokensCompletion: Number(raw.completionTokens ?? raw.tokensCompletion ?? 0),
    latencyMs: Number(raw.latencyMs ?? 0),
    status: Number(raw.status ?? 200),
    fallbackTriggered: Boolean(raw.fallbackTriggered),
  };
}

export function createAuditRecord(params: {
  requestId: string;
  meetingId: string;
  provider: AiModelProvider;
  modelVersion: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  status: number;
  fallbackTriggered?: boolean;
}): AuditRecord {
  return sanitizeAuditLog(params);
}
