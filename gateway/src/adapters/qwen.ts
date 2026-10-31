import type {
  ModelAdapter,
  AiModelProvider,
  LiveInsightRequest,
  MeetingChatRequest,
  InsightPatchPayload,
  ChatResponsePayload,
  ModelExecutionResult,
  OpenAiCompatibleResponse,
} from './types.js';
import { buildLiveInsightPrompt, buildMeetingChatPrompt } from '../prompts/templates.js';

export interface QwenOptions {
  apiKey?: string;
  baseUrl?: string;
  mockMode?: boolean;
  mockError?: Error;
}

export class QwenAdapter implements ModelAdapter {
  public readonly provider: AiModelProvider = 'qwen';
  public readonly modelVersion = 'qwen-2.5-72b';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly mockMode: boolean;
  private readonly mockError?: Error;

  constructor(options?: QwenOptions) {
    this.apiKey = options?.apiKey || process.env.QWEN_API_KEY || '';
    this.baseUrl =
      options?.baseUrl ||
      process.env.QWEN_BASE_URL ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1';
    this.mockMode = options?.mockMode ?? (!this.apiKey || this.apiKey.startsWith('mock_'));
    this.mockError = options?.mockError;
  }

  public async generateInsightStream(
    req: LiveInsightRequest,
    onPatch: (patch: InsightPatchPayload) => void
  ): Promise<ModelExecutionResult<InsightPatchPayload[]>> {
    const startTime = Date.now();

    if (this.mockError) {
      throw this.mockError;
    }

    if (this.mockMode) {
      const mockPatch: InsightPatchPayload = {
        action: 'UPDATE_TOPIC',
        topicId: `topic_${req.meetingId.slice(0, 8)}`,
        patch: {
          title: req.currentTopicSummary || '会议议题讨论 (备用模型 Qwen)',
          status: 'IN_PROGRESS',
          decisions: ['通报当前事项由通义千问备用通道顺利承接'],
          evidenceRefs: req.contextAnchors?.length
            ? req.contextAnchors.map((a) => ({ segmentId: a.segmentId, quote: a.quote }))
            : [{ segmentId: 'seg_fallback', quote: req.newStableText.slice(0, 20) }],
        },
      };

      onPatch(mockPatch);

      return {
        data: [mockPatch],
        usage: { promptTokens: 350, completionTokens: 95, totalTokens: 445 },
        modelVersion: this.modelVersion,
        provider: this.provider,
        latencyMs: Date.now() - startTime,
      };
    }

    const { systemPrompt, userPrompt } = buildLiveInsightPrompt(req);
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen-2.5-72b-instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Qwen API failed with status ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as OpenAiCompatibleResponse;
    const content = json.choices?.[0]?.message?.content || '{}';
    const parsedPatch: InsightPatchPayload = JSON.parse(content);
    onPatch(parsedPatch);

    return {
      data: [parsedPatch],
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
        totalTokens: json.usage?.total_tokens ?? 0,
      },
      modelVersion: this.modelVersion,
      provider: this.provider,
      latencyMs: Date.now() - startTime,
    };
  }

  public async chat(req: MeetingChatRequest): Promise<ModelExecutionResult<ChatResponsePayload>> {
    const startTime = Date.now();

    if (this.mockError) {
      throw this.mockError;
    }

    if (this.mockMode) {
      const transcript = req.localStableTranscript || [];
      const matchSegment = transcript[0] || {
        segmentId: 'seg_default',
        text: '现场讨论内容',
      };
      const answer = `根据当前讨论（备用通道保障），关于“${req.question}”，发言表明：${matchSegment.text}`;
      const evidenceRefs = [
        {
          segmentId: matchSegment.segmentId,
          quote: matchSegment.text,
        },
      ];

      return {
        data: { answer, evidenceRefs },
        usage: { promptTokens: 480, completionTokens: 120, totalTokens: 600 },
        modelVersion: this.modelVersion,
        provider: this.provider,
        latencyMs: Date.now() - startTime,
      };
    }

    const { systemPrompt, userPrompt } = buildMeetingChatPrompt(req);
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen-2.5-72b-instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Qwen Chat API failed with status ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as OpenAiCompatibleResponse;
    const content = json.choices?.[0]?.message?.content || '{}';
    const parsed: ChatResponsePayload = JSON.parse(content);

    return {
      data: parsed,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
        totalTokens: json.usage?.total_tokens ?? 0,
      },
      modelVersion: this.modelVersion,
      provider: this.provider,
      latencyMs: Date.now() - startTime,
    };
  }
}
