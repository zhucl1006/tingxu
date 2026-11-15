import { describe, it, expect, beforeEach } from 'vitest';
import { useMeetingStore } from '../useMeetingStore';
import { resetMeetingRepository } from '../../storage/meetingRepository';
import { DEFAULT_BYOK_SETTINGS } from '../../types/meeting';

describe('BYOK 自带密钥与 DeepSeek One-Key 全家桶状态管理 (Plan 025 & 029 TDD)', () => {
  beforeEach(() => {
    resetMeetingRepository();
    localStorage.clear();
    useMeetingStore.getState().resetByokSettings();
    useMeetingStore.getState().resetMeeting();
  });

  it('初始状态应为默认的 Standalone 单机模式与 DeepSeek One-Key 全家桶预设 (Plan 029)', () => {
    const { byokSettings } = useMeetingStore.getState();
    expect(byokSettings.mode).toBe('standalone');
    expect(byokSettings.llmProvider).toBe('deepseek');
    expect(byokSettings.llmApiKey).toBe('');
    expect(byokSettings.llmBaseUrl).toBe('https://api.deepseek.com/v1');
    expect(byokSettings.llmModel).toBe('deepseek-flash');
    expect(byokSettings.asrProvider).toBe('deepseek');
    expect(byokSettings.asrEndpoint).toBe('https://api.deepseek.com/v1/tools/asr');
    expect(byokSettings.shareDeepSeekKey).toBe(true);
    expect(byokSettings.enableSummaryThinking).toBe(true);
    expect(byokSettings.ttsVoiceId).toBe('stella');
  });

  it('updateByokSettings 应更新设置并写入持久化仓储', () => {
    useMeetingStore.getState().updateByokSettings({
      llmProvider: 'qwen',
      llmApiKey: 'mock-user-qwen-key-999',
      llmBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      llmModel: 'qwen-plus',
      asrProvider: 'dashscope',
      asrApiKey: 'mock-asr-user-key',
    });

    const current = useMeetingStore.getState().byokSettings;
    expect(current.llmProvider).toBe('qwen');
    expect(current.llmApiKey).toBe('mock-user-qwen-key-999');
    expect(current.llmModel).toBe('qwen-plus');
    expect(current.asrProvider).toBe('dashscope');
    expect(current.asrApiKey).toBe('mock-asr-user-key');
  });

  it('resetByokSettings 应重置为出厂默认配置', () => {
    useMeetingStore.getState().updateByokSettings({
      llmProvider: 'ollama',
      llmApiKey: 'custom-key',
      llmModel: 'custom-model',
    });
    expect(useMeetingStore.getState().byokSettings.llmProvider).toBe('ollama');

    useMeetingStore.getState().resetByokSettings();
    expect(useMeetingStore.getState().byokSettings).toEqual(DEFAULT_BYOK_SETTINGS);
  });

  it('应支持配置 local_endpoint 本地独立端点与 local_embedded 内嵌模式 (Plan 027 T01)', () => {
    useMeetingStore.getState().updateByokSettings({
      asrProvider: 'local_endpoint',
      asrEndpoint: 'http://127.0.0.1:8000/v1/audio/transcriptions',
      localAsrProtocol: 'openai_http',
      localAsrModel: 'whisper-1',
    });

    const current = useMeetingStore.getState().byokSettings;
    expect(current.asrProvider).toBe('local_endpoint');
    expect(current.asrEndpoint).toBe('http://127.0.0.1:8000/v1/audio/transcriptions');
    expect(current.localAsrProtocol).toBe('openai_http');
    expect(current.localAsrModel).toBe('whisper-1');

    useMeetingStore.getState().updateByokSettings({
      asrProvider: 'local_embedded',
    });
    expect(useMeetingStore.getState().byokSettings.asrProvider).toBe('local_embedded');
  });

  it('recordLocalAiUsage: 单机模式下应实时累加 ASR、洞察、纪要、问答及 OCR/TTS 工具人民币成本并同步历史记录 (Plan 029)', () => {
    useMeetingStore.getState().startMeeting('全家桶成本核算测试会');
    const meetingId = useMeetingStore.getState().meetingId!;

    // 1. 记录 60 秒 DeepSeek ASR (0.39 / 3600 * 60 = 0.0065 元)
    useMeetingStore.getState().recordLocalAiUsage({
      meetingId,
      category: 'asr',
      costYuan: 0.0065,
      audioSeconds: 60,
    });

    // 2. 记录一次实时洞察 Token (2500 tokens, 0.0032 元)
    useMeetingStore.getState().recordLocalAiUsage({
      meetingId,
      category: 'insights',
      costYuan: 0.0032,
      tokens: 2500,
    });

    // 3. 记录一次 OCR 参考资料解析 (10 页, 0.015 元)
    useMeetingStore.getState().recordLocalAiUsage({
      meetingId,
      category: 'tools',
      costYuan: 0.015,
      ocrPages: 10,
    });

    const liveCost = useMeetingStore.getState().aiCost;
    expect(liveCost).not.toBeNull();
    expect(liveCost?.audioSeconds).toBe(60);
    expect(liveCost?.totalTokens).toBe(2500);
    expect(liveCost?.breakdown.asrCostYuan).toBeCloseTo(0.0065, 5);
    expect(liveCost?.breakdown.insightsCostYuan).toBeCloseTo(0.0032, 5);
    expect(liveCost?.breakdown.toolsCostYuan).toBeCloseTo(0.015, 5);
    expect(liveCost?.breakdown.ocrPages).toBe(10);
    expect(liveCost?.totalCostYuan).toBeCloseTo(0.0247, 5);
  });

  it('addMeetingReferenceDoc: 应支持在当前或历史会议中挂载无状态 OCR 解析的参考资料摘要', () => {
    useMeetingStore.getState().startMeeting('架构评审会');
    const meetingId = useMeetingStore.getState().meetingId!;

    useMeetingStore.getState().addMeetingReferenceDoc(meetingId, {
      id: 'ocr_doc_1',
      fileName: 'Q4架构规划.pdf',
      pageCount: 5,
      extractedText: '核心指标：P99 延迟低于 150ms，采用 DeepSeek-V4.1-Flash。',
      createdAt: '2026-11-14T15:30:00Z',
    });

    const docs = useMeetingStore.getState().referenceDocs;
    expect(docs).toHaveLength(1);
    expect(docs[0].fileName).toBe('Q4架构规划.pdf');
    expect(docs[0].extractedText).toContain('P99 延迟低于 150ms');
  });
});
