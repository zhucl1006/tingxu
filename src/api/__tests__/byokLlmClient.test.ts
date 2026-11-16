import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ByokLlmClient, formatReferenceDocsContext } from '../byokLlmClient';
import type { ByokSettings } from '../../types/meeting';

describe('ByokLlmClient - 客户端直连大模型适配器测试 (TDD Red -> Green)', () => {
  const mockSettings: ByokSettings = {
    mode: 'standalone',
    llmProvider: 'deepseek',
    llmApiKey: 'mock-user-valid-key-12345',
    llmBaseUrl: 'https://api.deepseek.com/v1',
    llmModel: 'deepseek-chat',
    asrProvider: 'dashscope',
    asrApiKey: '',
    asrEndpoint: 'wss://dashscope.aliyuncs.com/api-ws/v1/inference',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('testConnection: 当未填写 API Key 时应直接返回错误，不发起网络请求', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const client = new ByokLlmClient();

    const result = await client.testConnection({ ...mockSettings, llmApiKey: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('请先填写');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('testConnection: 当 Provider 响应 200 时应返回 ok 与耗时毫秒数', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'pong' } }],
      }),
    } as any);

    const client = new ByokLlmClient();
    const result = await client.testConnection(mockSettings);

    expect(result.ok).toBe(true);
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('testConnection: 当收到 401 Unauthorized 时应给出凭据失效错误', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => JSON.stringify({ error: { message: 'Invalid API key' } }),
    } as any);

    const client = new ByokLlmClient();
    const result = await client.testConnection(mockSettings);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('API Key 无效或未授权');
  });

  it('chatCopilot: 应将逐字稿与问题装配为 OpenAI 消息格式并解析结构化回复', async () => {
    const aiResponseJson = {
      answer: '张总表示将在 11 月 15 日完成联调交付。',
      evidenceRefs: [{ segmentId: 'seg-1', quote: '11月15日完成交付' }],
      proposals: [
        {
          targetSection: 'decisions',
          action: 'replace',
          itemIndex: 0,
          proposedText: '确定 11 月 15 日为交付节点',
          reason: '时间点更正',
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url, init: any) => {
      expect(url.toString()).toContain('https://api.deepseek.com/v1/chat/completions');
      expect(init.headers['Authorization']).toBe(`Bearer ${mockSettings.llmApiKey}`);
      const body = JSON.parse(init.body);
      expect(body.model).toBe('deepseek-chat');
      expect(body.messages.length).toBeGreaterThanOrEqual(2);

      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(aiResponseJson),
              },
            },
          ],
        }),
      } as any;
    });

    const client = new ByokLlmClient();
    const response = await client.chatCopilot(
      {
        meetingId: 'mtg_01',
        question: '交付时间是几号？',
        transcripts: [
          { id: 'seg-1', speaker: '张总', text: '我们争取在 11月15日完成交付。' },
        ],
      },
      mockSettings
    );

    expect(response.answer).toContain('11 月 15 日');
    expect(response.citations[0].segmentId).toBe('seg-1');
    expect(response.proposals).toHaveLength(1);
    expect(response.proposals?.[0].targetSection).toBe('decisions');
  });

  it('generateMeetingSummary: 应能提炼结构化纪要与推荐标题', async () => {
    const summaryAiOutput = {
      suggestedTitle: '听序单机架构评审会',
      overview: '本次会议确认了采用单机 BYOK 架构。',
      decisions: [
        { title: '架构决策', content: '优先支持单机直连，免去 Docker 部署' },
      ],
      actions: [
        { title: '开发前端配置卡片', assignee: '前端', dueDate: '今日' },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify(summaryAiOutput),
            },
          },
        ],
      }),
    } as any);

    const client = new ByokLlmClient();
    const summary = await client.generateMeetingSummary(
      {
        meetingId: 'mtg_02',
        transcripts: [
          { segmentId: 'seg_1', speaker: '李工', text: '我建议采用单机直连。' },
        ],
      },
      mockSettings
    );

    expect(summary.suggestedTitle).toBe('听序单机架构评审会');
    expect(summary.overview).toContain('单机 BYOK');
    expect(summary.decisions).toHaveLength(1);
    expect(summary.actions).toHaveLength(1);
  });

  it('generateMeetingSummary: 传入指定 templateId (如 grai / cornell / client_visit) 时应注入对应模板系统提示词并解析 templatePayload (Plan 030 T02)', async () => {
    let capturedBody: any = null;
    const graiAiOutput = {
      suggestedTitle: 'Q3 敏捷发布项目复盘',
      overview: '本次复盘深入对照了 Q3 交付目标与实际落差，明确了技术债根因。',
      templateId: 'grai',
      templatePayload: {
        goalReview: {
          originalGoals: ['完成 10 大会议模板交付'],
          targetMetrics: ['单测通过率 100%'],
        },
        resultEvaluation: {
          actualOutcomes: ['按期交付并跑通门禁'],
          highlights: ['全本地运行零泄漏'],
          gaps: ['部分边缘模板提示词待持续精进'],
        },
        causeAnalysis: [
          {
            issue: '前期需求调研时间略长',
            rootCause: '模板涉及 7 种工种，需多方交叉验证',
            category: '主观流程',
            evidenceSegmentId: 'seg_1',
          },
        ],
        insightAndAction: {
          principles: ['模板元数据必须具备强类型 Schema 约束'],
          actionItems: [
            {
              action: '将 GRAI 视图上线到纪要看板',
              owner: '前端研发',
              deadline: '今日下班前',
              evidenceSegmentId: 'seg_1',
            },
          ],
        },
      },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, init: any) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(graiAiOutput),
              },
            },
          ],
        }),
      } as any;
    });

    const client = new ByokLlmClient();
    const summary = await client.generateMeetingSummary(
      {
        meetingId: 'mtg_grai_01',
        templateId: 'grai',
        transcripts: [
          { segmentId: 'seg_1', speaker: 'PM', text: '大家开始进行 Q3 复盘，先看目标达成。' },
        ],
      },
      mockSettings
    );

    expect(capturedBody.messages[0].content).toContain('【GRAI 闭环复盘模式】');
    expect(summary.templateId).toBe('grai');
    expect(summary.templatePayload).toBeDefined();
    expect(summary.templatePayload.goalReview.originalGoals[0]).toBe('完成 10 大会议模板交付');
    expect(summary.templatePayload.insightAndAction.actionItems[0].owner).toBe('前端研发');
  });

  it('extractLiveInsights: 应能从最新发言中提取决策或待办洞察卡片 (Plan 026 TDD)', async () => {
    const mockInsightPatch = {
      action: 'UPDATE_TOPIC',
      topicId: 'topic_test_1',
      patch: {
        title: '交付节点与分工确认',
        type: 'decision',
        content: '团队一致同意于 11 月 15 日完成首期单机版本交付。',
        status: 'RESOLVED',
        decisions: ['确定 11 月 15 日单机版发布'],
        evidenceRefs: [{ segmentId: 'seg_1', quote: '11月15日交付' }],
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify(mockInsightPatch),
            },
          },
        ],
      }),
    } as any);

    const client = new ByokLlmClient();
    const result = await client.extractLiveInsights(
      {
        newStableText: '张总: 我们争取在 11月15日完成首期交付，大家没意见吧？\n李工: 同意。',
        currentTopicSummary: '发布时间评估',
        contextAnchors: [{ segmentId: 'seg_1', quote: '11月15日交付' }],
      },
      mockSettings
    );

    expect(result).not.toBeNull();
    expect(result?.patch.title).toBe('交付节点与分工确认');
    expect(result?.patch.type).toBe('decision');
    expect(result?.patch.decisions?.[0]).toContain('11 月 15 日');
  });

  it('generateMeetingSummary: 开启 enableSummaryThinking 时应注入 thinking={type:enabled} 并剥离 temperature，同时支持 summaryModel 与 referenceContext (Plan 029 T04)', async () => {
    let capturedBody: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, init: any) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                reasoning_content: '先梳理参考议程与现场发言的一致性...',
                content: JSON.stringify({
                  suggestedTitle: 'DeepSeek V4.1 全家桶评审',
                  overview: '确认切换至单 Key 全家桶架构。',
                  decisions: [],
                  actions: [],
                }),
              },
            },
          ],
          usage: {
            prompt_tokens: 1500,
            completion_tokens: 450,
            total_tokens: 1950,
            prompt_cache_hit_tokens: 1000,
            prompt_cache_miss_tokens: 500,
          },
        }),
      } as any;
    });

    const client = new ByokLlmClient();
    const summary = await client.generateMeetingSummary(
      {
        meetingId: 'mtg_ds_think',
        transcripts: [{ segmentId: 'seg_1', speaker: '我', text: '我们采用 DeepSeek 全家桶。' }],
        referenceContext: '【议程 PDF】：1. 评估 V4.1-Flash 1M 上下文；2. 评估 /v1/tools/asr',
      },
      {
        ...mockSettings,
        llmModel: 'deepseek-flash',
        summaryModel: 'deepseek-v4-pro',
        enableSummaryThinking: true,
      }
    );

    expect(capturedBody.model).toBe('deepseek-v4-pro');
    expect(capturedBody.thinking).toEqual({ type: 'enabled' });
    expect(capturedBody.temperature).toBeUndefined();
    expect(capturedBody.messages[1].content).toContain('【议程 PDF】');
    expect(summary.suggestedTitle).toBe('DeepSeek V4.1 全家桶评审');
    expect(summary._usage?.total_tokens).toBe(1950);
  });

  it('chatCopilot: 默认严禁挂载联网工具；仅当显式开启 enableWebSearch 时注入 deepseek_web_search 与 deepseek_read_url 并回传 usage (Plan 029 T04)', async () => {
    const bodies: any[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init: any) => {
      bodies.push(JSON.parse(init.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: '经联网核查，DeepSeek ASR 限时特惠 0.39 元/小时。',
                  evidenceRefs: [{ segmentId: 'seg_1', quote: '核对一下官网最新单价' }],
                  proposals: [],
                }),
              },
            },
          ],
          usage: {
            prompt_tokens: 800,
            completion_tokens: 120,
            total_tokens: 920,
          },
        }),
      } as any;
    });

    const client = new ByokLlmClient();
    const flashSettings: ByokSettings = {
      ...mockSettings,
      llmModel: 'deepseek-flash',
    };

    // 1. 默认不传 enableWebSearch -> 严禁带 tools
    await client.chatCopilot(
      {
        meetingId: 'mtg_sec_1',
        question: '刚才说了什么？',
        transcripts: [{ id: 'seg_1', speaker: '我', text: '核对一下官网最新单价' }],
      },
      flashSettings
    );
    expect(bodies[0].tools).toBeUndefined();

    // 2. 显式开启 enableWebSearch: true + 传入 referenceContext -> 挂载双联网工具
    const res = await client.chatCopilot(
      {
        meetingId: 'mtg_sec_1',
        question: '帮我查一下官网最新 ASR 价格',
        transcripts: [{ id: 'seg_1', speaker: '我', text: '核对一下官网最新单价' }],
        enableWebSearch: true,
        referenceContext: '会前成本预算上限：每小时不超过 0.5 元',
      },
      flashSettings
    );

    expect(bodies[1].tools).toEqual([
      { type: 'deepseek_web_search', name: 'deepseek_web_search' },
      { type: 'deepseek_read_url', name: 'deepseek_read_url' },
    ]);
    expect(bodies[1].messages[1].content).toContain('会前成本预算上限');
    expect(res.usage?.total_tokens).toBe(920);
  });

  it('formatReferenceDocsContext: 应将 OCR 提取的参考资料格式化为结构化提示词片段 (Plan 029 T04)', () => {
    const formatted = formatReferenceDocsContext([
      {
        id: 'doc_1',
        fileName: 'Q4架构评审议程.pdf',
        pageCount: 3,
        extractedText: '第一部分：单机 BYOK 全家桶升级',
        createdAt: '2026-11-14T15:00:00Z',
      },
    ]);
    expect(formatted).toContain('Q4架构评审议程.pdf');
    expect(formatted).toContain('共 3 页');
    expect(formatted).toContain('第一部分：单机 BYOK 全家桶升级');
  });
});
