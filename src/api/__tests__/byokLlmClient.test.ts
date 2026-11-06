import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ByokLlmClient } from '../byokLlmClient';
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
});
