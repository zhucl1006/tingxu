import { describe, it, expect, beforeEach } from 'vitest';
import { useMeetingStore } from '../useMeetingStore';
import { resetMeetingRepository } from '../../storage/meetingRepository';
import { DEFAULT_BYOK_SETTINGS } from '../../types/meeting';

describe('BYOK 自带密钥与运行模式状态管理 (Plan 025 TDD)', () => {
  beforeEach(() => {
    resetMeetingRepository();
    localStorage.clear();
    useMeetingStore.getState().resetByokSettings();
  });

  it('初始状态应为默认的 Standalone 单机模式与 DeepSeek 配置', () => {
    const { byokSettings } = useMeetingStore.getState();
    expect(byokSettings.mode).toBe('standalone');
    expect(byokSettings.llmProvider).toBe('deepseek');
    expect(byokSettings.llmApiKey).toBe('');
    expect(byokSettings.llmBaseUrl).toBe('https://api.deepseek.com/v1');
    expect(byokSettings.llmModel).toBe('deepseek-chat');
    expect(byokSettings.asrProvider).toBe('dashscope');
  });

  it('updateByokSettings 应更新设置并写入持久化仓储', () => {
    useMeetingStore.getState().updateByokSettings({
      llmProvider: 'qwen',
      llmApiKey: 'mock-user-qwen-key-999',
      llmBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      llmModel: 'qwen-plus',
      asrApiKey: 'mock-asr-user-key',
    });

    const current = useMeetingStore.getState().byokSettings;
    expect(current.llmProvider).toBe('qwen');
    expect(current.llmApiKey).toBe('mock-user-qwen-key-999');
    expect(current.llmModel).toBe('qwen-plus');
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
});
