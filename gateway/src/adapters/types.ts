/**
 * 听序 AI Gateway — 模型与网关通用类型契约
 */

export type AiModelProvider = 'deepseek' | 'qwen';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ContextAnchor {
  segmentId: string;
  quote: string;
}

export interface LiveInsightRequest {
  meetingId: string;
  currentTopicSummary?: string;
  newStableText: string;
  contextAnchors?: ContextAnchor[];
}

export interface EvidenceRef {
  segmentId: string;
  startMs?: number;
  quote: string;
}

export interface InsightTopicPatch {
  title: string;
  type?: 'decision' | 'action' | 'risk' | 'fact';
  content?: string;
  status: 'DISCUSSING' | 'IN_PROGRESS' | 'RESOLVED';
  decisions: string[];
  evidenceRefs: EvidenceRef[];
}

export interface InsightPatchPayload {
  action: 'UPDATE_TOPIC' | 'CREATE_TOPIC' | 'ADD_TODO';
  topicId: string;
  patch: InsightTopicPatch;
}

export interface TranscriptSegment {
  segmentId: string;
  speaker: string;
  text: string;
}

export interface ChatProposal {
  targetSection: 'overview' | 'decisions' | 'actions' | 'risks' | 'facts';
  action: 'replace' | 'add' | 'delete';
  itemIndex?: number;
  originalText?: string;
  proposedText: string;
  reason?: string;
}

export interface MeetingChatRequest {
  meetingId: string;
  question: string;
  asOfTextVersion: number;
  localStableTranscript: TranscriptSegment[];
  currentSummary?: {
    overview?: string;
    decisions?: Array<{ title: string; content: string }>;
    actions?: Array<{ title: string; assignee?: string; dueDate?: string }>;
    risks?: Array<{ title: string; content: string }>;
    facts?: Array<{ title: string; content: string }>;
  };
}

export interface ChatResponsePayload {
  answer: string;
  evidenceRefs: EvidenceRef[];
  proposals?: ChatProposal[];
}

export interface MeetingSummaryRequest {
  meetingId: string;
  transcripts: TranscriptSegment[];
}

export interface SummaryDecisionItem {
  title: string;
  content: string;
  evidenceQuote?: string;
  evidenceSegmentId?: string;
}

export interface SummaryActionItem {
  title: string;
  assignee?: string;
  dueDate?: string;
  evidenceQuote?: string;
  evidenceSegmentId?: string;
}

export interface SummaryRiskItem {
  title: string;
  content: string;
  evidenceQuote?: string;
}

export interface SummaryFactItem {
  title: string;
  content: string;
  evidenceQuote?: string;
}

export interface MeetingStructuredSummary {
  suggestedTitle: string;
  overview: string;
  decisions: SummaryDecisionItem[];
  actions: SummaryActionItem[];
  risks: SummaryRiskItem[];
  facts: SummaryFactItem[];
}

export interface OpenAiCompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface ModelExecutionResult<T> {
  data: T;
  usage: TokenUsage;
  modelVersion: string;
  provider: AiModelProvider;
  latencyMs: number;
  fallbackTriggered?: boolean;
}

export interface ModelAdapter {
  provider: AiModelProvider;
  modelVersion: string;
  generateInsightStream(
    req: LiveInsightRequest,
    onPatch: (patch: InsightPatchPayload) => void
  ): Promise<ModelExecutionResult<InsightPatchPayload[]>>;
  chat(req: MeetingChatRequest): Promise<ModelExecutionResult<ChatResponsePayload>>;
  summarize(req: MeetingSummaryRequest): Promise<ModelExecutionResult<MeetingStructuredSummary>>;
}
