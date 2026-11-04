import { describe, it, expect, vi } from 'vitest';
import { OpenAiProtocolAdapter } from '../src/adapters/openaiProtocolAdapter.js';
import { ResilientModelEngine, ModelRouter } from '../src/router/modelRouter.js';
import type { LiveInsightRequest, MeetingChatRequest, MeetingSummaryRequest } from '../src/adapters/types.js';

describe('OpenAiProtocolAdapter 深度通用协议适配器测试 (TDD Red -> Green)', () => {
  it('应能构造通用协议适配器并正确绑定 provider 与 modelVersion', () => {
    const adapter = new OpenAiProtocolAdapter({
      provider: 'deepseek',
      modelVersion: 'deepseek-v3',
      modelName: 'deepseek-chat',
      mockMode: true,
    });

    expect(adapter.provider).toBe('deepseek');
    expect(adapter.modelVersion).toBe('deepseek-v3');
  });

  it('在无有效 API Key 且非 Mock 模式下应抛出明确鉴权异常', async () => {
    const adapter = new OpenAiProtocolAdapter({
      provider: 'qwen',
      modelVersion: 'qwen-2.5-72b',
      apiKey: '',
      mockMode: false,
    });

    const req: MeetingChatRequest = {
      meetingId: 'mtg_001',
      question: '会议要点是什么？',
      asOfTextVersion: 1,
      localStableTranscript: [],
    };

    await expect(adapter.chat(req)).rejects.toThrow(/未配置有效的大模型 API Key/);
  });

  it('Mock 模式下应正常流式生成实时洞察补丁 (generateInsightStream)', async () => {
    const adapter = new OpenAiProtocolAdapter({
      provider: 'deepseek',
      modelVersion: 'deepseek-v3',
      mockMode: true,
    });

    const patches: any[] = [];
    const req: LiveInsightRequest = {
      meetingId: 'mtg_insight_01',
      currentTopicSummary: '音视频流水线重构',
      newStableText: '我们决定重构流式 ASR 与模型调度，降低耦合。',
    };

    const res = await adapter.generateInsightStream(req, (p) => patches.push(p));
    expect(res.provider).toBe('deepseek');
    expect(res.data.length).toBeGreaterThan(0);
    expect(patches.length).toBe(1);
    expect(patches[0].patch.title).toContain('音视频流水线重构');
  });

  it('Mock 模式下应正常输出会中问答与提案 (chat)', async () => {
    const adapter = new OpenAiProtocolAdapter({
      provider: 'qwen',
      modelVersion: 'qwen-2.5-72b',
      mockMode: true,
    });

    const req: MeetingChatRequest = {
      meetingId: 'mtg_002',
      question: '请帮我修改待办事项负责人为张三',
      asOfTextVersion: 2,
      localStableTranscript: [{ segmentId: 'seg_1', speaker: '李四', text: '这个任务交给张三负责。' }],
    };

    const res = await adapter.chat(req);
    expect(res.provider).toBe('qwen');
    expect(res.data.answer).toBeTruthy();
    expect(res.data.proposals?.[0].targetSection).toBe('actions');
  });

  it('Mock 模式下应正常生成高精结构化纪要 (summarize)', async () => {
    const adapter = new OpenAiProtocolAdapter({
      provider: 'deepseek',
      modelVersion: 'deepseek-v3',
      mockMode: true,
    });

    const req: MeetingSummaryRequest = {
      meetingId: 'mtg_003',
      transcripts: [{ segmentId: 'seg_1', speaker: '王五', text: '我们本周五下午上线。' }],
    };

    const res = await adapter.summarize(req);
    expect(res.data.suggestedTitle).toBeTruthy();
    expect(res.data.decisions.length).toBeGreaterThan(0);
    expect(res.data.actions.length).toBeGreaterThan(0);
  });
});

describe('ResilientModelEngine 深度容灾调度引擎测试 (TDD Red -> Green)', () => {
  it('ModelRouter 应作为 ResilientModelEngine 的兼容别名保持可用', () => {
    expect(ModelRouter).toBe(ResilientModelEngine);
  });

  it('executeWithFallback 应在主模型成功时零切备，在主模型故障时快速降级至备用模型', async () => {
    const primary = new OpenAiProtocolAdapter({
      provider: 'deepseek',
      modelVersion: 'deepseek-v3',
      mockMode: true,
      mockError: new Error('DeepSeek RateLimit 429'),
    });
    const fallback = new OpenAiProtocolAdapter({
      provider: 'qwen',
      modelVersion: 'qwen-2.5-72b',
      mockMode: true,
    });

    const engine = new ResilientModelEngine({
      primaryAdapter: primary,
      fallbackAdapter: fallback,
    });

    const req: MeetingSummaryRequest = {
      meetingId: 'mtg_fallback_01',
      transcripts: [{ segmentId: 'seg_1', speaker: '王五', text: '容灾降级测试。' }],
    };

    const res = await engine.summarize(req);
    expect(res.provider).toBe('qwen');
    expect(res.fallbackTriggered).toBe(true);
    expect(res.data.overview).toBeTruthy();
  });
});
