import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LlmTranscriptCorrector } from '../llmTranscriptCorrector';
import type { ByokSettings } from '../../types/meeting';

describe('LlmTranscriptCorrector - 会话级 LLM 实时语法与术语异步纠偏 (T04 TDD)', () => {
  const mockSettings: ByokSettings = {
    llmProvider: 'qwen',
    llmBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    llmApiKey: 'sk-test-valid-key',
    llmModel: 'qwen-plus',
    asrProvider: 'local_endpoint',
    asrEndpoint: 'http://127.0.0.1:8009/v1/audio/transcriptions',
    asrApiKey: '',
    localAsrProtocol: 'openai_http',
    localAsrModel: 'small',
    enableLlmCorrection: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('当未开启 enableLlmCorrection 或未配置 API Key 时，不应发起网络纠偏', async () => {
    const onCorrected = vi.fn();
    const corrector = new LlmTranscriptCorrector(onCorrected);

    // 未开启
    await corrector.correctTranscript('seg_1', '今天天气不错', {
      ...mockSettings,
      enableLlmCorrection: false,
    });
    expect(onCorrected).not.toHaveBeenCalled();

    // 未填 Key 且为云端服务
    await corrector.correctTranscript('seg_2', '今天天气不错', {
      ...mockSettings,
      llmApiKey: '',
    });
    expect(onCorrected).not.toHaveBeenCalled();
  });

  it('成功调用 LLM 并返回纠偏文本时，应正确触发 onCorrected 回调', async () => {
    const onCorrected = vi.fn();
    const corrector = new LlmTranscriptCorrector(onCorrected);

    // Mock fetch 返回 LLM 纠偏后的文本
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '听序是一款本地优先的会议助手。',
            },
          },
        ],
      }),
    });

    await corrector.correctTranscript('seg_123', '听绪是一款本地优显的会议住手', mockSettings);

    expect(onCorrected).toHaveBeenCalledWith(
      'seg_123',
      '听序是一款本地优先的会议助手。',
      '听绪是一款本地优显的会议住手'
    );
  });

  it('当 LLM 请求超时或异常时应静默熔断降级，不抛出异常打断会议', async () => {
    const onCorrected = vi.fn();
    const corrector = new LlmTranscriptCorrector(onCorrected);

    global.fetch = vi.fn().mockRejectedValue(new Error('Network timeout'));

    await expect(
      corrector.correctTranscript('seg_456', '异常测试文本', mockSettings)
    ).resolves.not.toThrow();

    expect(onCorrected).not.toHaveBeenCalled();
  });
});
