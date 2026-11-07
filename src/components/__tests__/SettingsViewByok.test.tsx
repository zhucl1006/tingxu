import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsView } from '../views/SettingsView';
import { useMeetingStore } from '../../store/useMeetingStore';
import { resetMeetingRepository } from '../../storage/meetingRepository';
import { setByokLlmClient, ByokLlmClient } from '../../api/byokLlmClient';
import { LocalAsrClient } from '../../audio/localAsrClient';

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

  it('本地 ASR 配置：切换至本地独立端点并应用 Faster-Whisper 与 Sherpa 预设 (Plan 027 T04)', async () => {
    render(<SettingsView />);

    // 切换至本地独立端点
    const localEpBtn = screen.getByTestId('settings-byok-btn-asr-provider-local-endpoint');
    fireEvent.click(localEpBtn);

    expect(useMeetingStore.getState().byokSettings.asrProvider).toBe('local_endpoint');

    // 点击 Faster-Whisper 预设
    const fwBtn = screen.getByTestId('settings-byok-btn-preset-faster-whisper');
    fireEvent.click(fwBtn);

    expect(useMeetingStore.getState().byokSettings.asrEndpoint).toBe('http://127.0.0.1:8000/v1/audio/transcriptions');
    expect(useMeetingStore.getState().byokSettings.localAsrProtocol).toBe('openai_http');

    // 点击 Sherpa-ONNX 预设
    const sherpaBtn = screen.getByTestId('settings-byok-btn-preset-sherpa');
    fireEvent.click(sherpaBtn);

    expect(useMeetingStore.getState().byokSettings.asrEndpoint).toBe('ws://127.0.0.1:6006');
    expect(useMeetingStore.getState().byokSettings.localAsrProtocol).toBe('sherpa_ws');
  });

  it('本地 ASR 连通性测试：调用 LocalAsrClient.testConnection 并展示返回的延迟毫秒', async () => {
    vi.spyOn(LocalAsrClient, 'testConnection').mockResolvedValueOnce({
      success: true,
      latencyMs: 38,
      message: '连接成功 (延迟: 38ms)',
    });

    render(<SettingsView />);

    // 切换至本地独立端点
    fireEvent.click(screen.getByTestId('settings-byok-btn-asr-provider-local-endpoint'));

    const testBtn = screen.getByTestId('settings-byok-btn-test-asr');
    fireEvent.click(testBtn);

    await waitFor(() => {
      const statusText = screen.getByTestId('settings-byok-text-asr-status');
      expect(statusText).toBeInTheDocument();
      expect(statusText.textContent).toContain('38ms');
    });
  });

  it('本地独立端点应渲染 Faster-Whisper 快速启动指引卡片，并支持一键复制 Docker 与 Pip 命令', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<SettingsView />);

    // 切换至本地独立端点
    fireEvent.click(screen.getByTestId('settings-byok-btn-asr-provider-local-endpoint'));

    const guideCard = screen.getByTestId('settings-byok-card-asr-guide');
    expect(guideCard).toBeInTheDocument();
    expect(guideCard.textContent).toContain('docker run -d');
    expect(guideCard.textContent).toContain('pip install faster-whisper-server');

    // 复制 Docker 命令
    const copyDockerBtn = screen.getByTestId('settings-byok-btn-copy-docker-cmd');
    fireEvent.click(copyDockerBtn);
    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining('docker run -d --name whisper-asr')
    );
    expect(copyDockerBtn.textContent).toContain('已复制');

    // 复制 Pip 命令
    const copyPipBtn = screen.getByTestId('settings-byok-btn-copy-pip-cmd');
    fireEvent.click(copyPipBtn);
    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining('pip install faster-whisper-server')
    );
    expect(copyPipBtn.textContent).toContain('已复制');
  });
});
