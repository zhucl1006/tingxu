import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsView } from '../views/SettingsView';
import { useMeetingStore } from '../../store/useMeetingStore';
import { resetMeetingRepository } from '../../storage/meetingRepository';
import { setByokLlmClient, ByokLlmClient } from '../../api/byokLlmClient';

describe('SettingsView BYOK 设置卡片测试 (Plan 025 TDD)', () => {
  beforeEach(() => {
    resetMeetingRepository();
    localStorage.clear();
    useMeetingStore.getState().resetByokSettings();
  });

  it('应渲染 BYOK 核心面板并展示当前单机模式与默认配置', () => {
    render(<SettingsView />);

    expect(screen.getByTestId('settings-page-section-byok')).toBeInTheDocument();
    expect(screen.getByTestId('settings-byok-card-standalone-banner')).toBeInTheDocument();
    expect(screen.getByTestId('settings-byok-badge-standalone')).toHaveTextContent('免登录 · 数据本地留存');

    const keyInput = screen.getByTestId('settings-byok-input-llm-key') as HTMLInputElement;
    expect(keyInput.value).toBe('');
  });

  it('点击 Qwen 快捷预设按钮应快速填充阿里云百炼端点与模型', async () => {
    render(<SettingsView />);

    const qwenBtn = screen.getByTestId('settings-byok-btn-preset-qwen');
    fireEvent.click(qwenBtn);

    const { byokSettings } = useMeetingStore.getState();
    expect(byokSettings.llmProvider).toBe('qwen');
    expect(byokSettings.llmBaseUrl).toContain('dashscope.aliyuncs.com');
    expect(byokSettings.llmModel).toBe('qwen-plus');
  });

  it('点击 Ollama 快捷预设按钮应快速填充本地端点与模型', async () => {
    render(<SettingsView />);

    const ollamaBtn = screen.getByTestId('settings-byok-btn-preset-ollama');
    fireEvent.click(ollamaBtn);

    const { byokSettings } = useMeetingStore.getState();
    expect(byokSettings.llmProvider).toBe('ollama');
    expect(byokSettings.llmBaseUrl).toBe('http://localhost:11434/v1');
    expect(byokSettings.llmModel).toBe('qwen2.5:7b');
  });

  it('点击测试连接按钮应调用 ByokLlmClient 并渲染结果', async () => {
    const mockClient = new ByokLlmClient();
    vi.spyOn(mockClient, 'testConnection').mockResolvedValueOnce({
      ok: true,
      latencyMs: 145,
    });
    setByokLlmClient(mockClient);

    render(<SettingsView />);

    const testBtn = screen.getByTestId('settings-byok-btn-test-llm');
    fireEvent.click(testBtn);

    await waitFor(() => {
      const statusText = screen.getByTestId('settings-byok-text-llm-status');
      expect(statusText).toBeInTheDocument();
      expect(statusText.textContent).toContain('145ms');
    });
  });
});
