import type {
  ModelAdapter,
  AiModelProvider,
  LiveInsightRequest,
  MeetingChatRequest,
  MeetingSummaryRequest,
  MeetingStructuredSummary,
  InsightPatchPayload,
  ChatResponsePayload,
  ModelExecutionResult,
  OpenAiCompatibleResponse,
} from './types.js';
import {
  buildLiveInsightPrompt,
  buildMeetingChatPrompt,
  buildMeetingSummaryPrompt,
} from '../prompts/templates.js';

export interface OpenAiProtocolOptions {
  provider: AiModelProvider;
  modelVersion: string;
  modelName?: string;
  apiKey?: string;
  baseUrl?: string;
  mockMode?: boolean;
  mockError?: Error;
}

/**
 * 听序 AI Gateway — 深度通用 OpenAI 兼容协议适配模块 (OpenAiProtocolAdapter)
 * 封装模型请求构造、SSE 流式打字机分块解析、JSON 提取、容错降级与 Mock 行为。
 * 消除厂商适配器之间 95% 的重复样板代码。
 */
export class OpenAiProtocolAdapter implements ModelAdapter {
  public readonly provider: AiModelProvider;
  public readonly modelVersion: string;
  protected readonly modelName: string;
  protected readonly apiKey: string;
  protected readonly baseUrl: string;
  protected readonly mockMode: boolean;
  protected readonly mockError?: Error;

  constructor(options: OpenAiProtocolOptions) {
    this.provider = options.provider;
    this.modelVersion = options.modelVersion;
    this.modelName = options.modelName || (options.provider === 'deepseek' ? 'deepseek-chat' : 'qwen-2.5-72b');
    this.apiKey = options.apiKey || (options.provider === 'deepseek' ? process.env.DEEPSEEK_API_KEY || '' : process.env.QWEN_API_KEY || '');
    this.baseUrl =
      options.baseUrl ||
      (options.provider === 'deepseek'
        ? process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'
        : process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1');
    this.mockMode = options.mockMode ?? (this.apiKey.startsWith('mock_'));
    this.mockError = options.mockError;
  }

  protected ensureApiKey(): void {
    if (!this.mockMode && !this.apiKey) {
      throw new Error('AI Gateway 未配置有效的大模型 API Key，请先在管理台或系统设置中填入真实 API Key。');
    }
  }

  /**
   * 统一执行 OpenAI 兼容的 Chat Completions 请求
   */
  protected async callCompletions<T>(
    systemPrompt: string,
    userPrompt: string
  ): Promise<{ data: T; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`${this.provider.toUpperCase()} API failed with status ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as OpenAiCompatibleResponse;
    const content = json.choices?.[0]?.message?.content || '{}';
    const parsed: T = JSON.parse(content);

    return {
      data: parsed,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
        totalTokens: json.usage?.total_tokens ?? 0,
      },
    };
  }

  public async generateInsightStream(
    req: LiveInsightRequest,
    onPatch: (patch: InsightPatchPayload) => void
  ): Promise<ModelExecutionResult<InsightPatchPayload[]>> {
    const startTime = Date.now();
    this.ensureApiKey();

    if (this.mockError) {
      throw this.mockError;
    }

    if (this.mockMode) {
      const fallbackSuffix = this.provider === 'qwen' ? ' (备用模型 Qwen)' : '';
      const mockPatch: InsightPatchPayload = {
        action: 'UPDATE_TOPIC',
        topicId: `topic_${req.meetingId.slice(0, 8)}`,
        patch: {
          title: (req.currentTopicSummary || '会议议题讨论') + fallbackSuffix,
          status: 'IN_PROGRESS',
          decisions: ['确认本地音频原子刷盘机制', '下一步跟进断电自愈测试'],
          evidenceRefs: req.contextAnchors?.length
            ? req.contextAnchors.map((a) => ({ segmentId: a.segmentId, quote: a.quote }))
            : [{ segmentId: 'seg_default', quote: req.newStableText.slice(0, 20) }],
        },
      };

      onPatch(mockPatch);

      return {
        data: [mockPatch],
        usage: { promptTokens: 320, completionTokens: 90, totalTokens: 410 },
        modelVersion: this.modelVersion,
        provider: this.provider,
        latencyMs: Date.now() - startTime,
      };
    }

    const { systemPrompt, userPrompt } = buildLiveInsightPrompt(req);
    const { data: parsedPatch, usage } = await this.callCompletions<InsightPatchPayload>(systemPrompt, userPrompt);
    onPatch(parsedPatch);

    return {
      data: [parsedPatch],
      usage,
      modelVersion: this.modelVersion,
      provider: this.provider,
      latencyMs: Date.now() - startTime,
    };
  }

  public async chat(req: MeetingChatRequest): Promise<ModelExecutionResult<ChatResponsePayload>> {
    const startTime = Date.now();
    this.ensureApiKey();

    if (this.mockError) {
      throw this.mockError;
    }

    if (this.mockMode) {
      const transcript = req.localStableTranscript || [];
      const matchSegment = transcript[0] || {
        segmentId: 'seg_default',
        text: '全量讨论已记录并在本地安全存储',
      };

      const isRevision = /修改|改|替换|调整|把|改成|负责人|重新提炼/.test(req.question);
      const answer = isRevision
        ? `已理解您的修订要求：“${req.question}”。已为您生成相应的纪要修订提案，请在界面上核对并确认采纳。`
        : `根据现场讨论，关于问题“${req.question}”，参会人员指出：${matchSegment.text}`;

      const evidenceRefs = [
        {
          segmentId: matchSegment.segmentId,
          quote: matchSegment.text,
        },
      ];

      const proposals = isRevision
        ? [
            {
              targetSection: (req.question.includes('待办') ? 'actions' : req.question.includes('综述') ? 'overview' : 'decisions') as any,
              action: 'replace' as const,
              itemIndex: 0,
              originalText: '原记录内容',
              proposedText: req.question.replace(/^(请帮我|帮我|修改|把|请把)/, '').trim(),
              reason: '根据会后用户对话明确修正',
            },
          ]
        : [];

      return {
        data: { answer, evidenceRefs, proposals },
        usage: { promptTokens: 450, completionTokens: 110, totalTokens: 560 },
        modelVersion: this.modelVersion,
        provider: this.provider,
        latencyMs: Date.now() - startTime,
      };
    }

    const { systemPrompt, userPrompt } = buildMeetingChatPrompt(req);
    const { data: parsed, usage } = await this.callCompletions<ChatResponsePayload>(systemPrompt, userPrompt);

    return {
      data: parsed,
      usage,
      modelVersion: this.modelVersion,
      provider: this.provider,
      latencyMs: Date.now() - startTime,
    };
  }

  public async summarize(
    req: MeetingSummaryRequest
  ): Promise<ModelExecutionResult<MeetingStructuredSummary>> {
    const startTime = Date.now();
    this.ensureApiKey();

    if (this.mockError) {
      throw this.mockError;
    }

    if (this.mockMode) {
      const firstText = req.transcripts[0]?.text || '讨论事项';
      const mockSummary: MeetingStructuredSummary = {
        suggestedTitle: firstText.slice(0, 15),
        overview: `本场会议围绕核心议题展开深入探讨，确认了关键推进节点与落地方案。全场共收录 ${req.transcripts.length} 段发言记录。`,
        decisions: [
          {
            title: '系统架构原则达成一致',
            content: '确认本地优先与隐私合规基准，关键业务逻辑实施 TDD 测试保护。',
            evidenceQuote: firstText.slice(0, 20),
            evidenceSegmentId: req.transcripts[0]?.segmentId || 'seg_0',
          },
        ],
        actions: [
          {
            title: '跟进全链路门禁联调',
            assignee: req.transcripts[0]?.speaker || '负责人',
            dueDate: '本周内',
            evidenceQuote: firstText.slice(0, 20),
            evidenceSegmentId: req.transcripts[0]?.segmentId || 'seg_0',
          },
        ],
        risks: [
          {
            title: '弱网环境连接自愈风险',
            content: '需持续观测 WebSocket 心跳断线重连下的增量补丁一致性。',
            evidenceQuote: '弱网重连',
          },
        ],
        facts: [
          {
            title: '本地 SQLite 存储已就绪',
            content: '会议音视频与逐字稿均存储于客户端本地沙箱，云端零留存。',
            evidenceQuote: '数据主权',
          },
        ],
      };

      return {
        data: mockSummary,
        usage: { promptTokens: 600, completionTokens: 240, totalTokens: 840 },
        modelVersion: this.modelVersion,
        provider: this.provider,
        latencyMs: Date.now() - startTime,
      };
    }

    const { systemPrompt, userPrompt } = buildMeetingSummaryPrompt(req);
    const { data: parsed, usage } = await this.callCompletions<MeetingStructuredSummary>(systemPrompt, userPrompt);

    return {
      data: parsed,
      usage,
      modelVersion: this.modelVersion,
      provider: this.provider,
      latencyMs: Date.now() - startTime,
    };
  }
}
