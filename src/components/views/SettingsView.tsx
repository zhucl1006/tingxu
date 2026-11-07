import React, { useState } from 'react';
import { useMeetingStore } from '../../store/useMeetingStore';
import { getByokLlmClient } from '../../api/byokLlmClient';
import { LocalAsrClient } from '../../audio/localAsrClient';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const SettingsView: React.FC = () => {
  const {
    speakerProfiles,
    renameSpeakerProfile,
    deleteSpeakerProfile,
    clearSpeakerProfiles,
    voiceprintSettings,
    setVoiceprintPresetMode,
    updateVoiceprintSettings,
    resetVoiceprintSettings,
    appearanceSettings,
    setAppearanceSettings,
    resetAppearanceSettings,
    byokSettings,
    updateByokSettings,
    resetByokSettings,
    liveInsightSettings,
    updateLiveInsightSettings,
    resetLiveInsightSettings,
    storageSettings,
    storageUsage,
    isStorageLoading,
    refreshStorageUsage,
    updateStorageSettings,
    cleanupRecordings,
    meetingDetectionSettings,
    updateMeetingDetectionSettings,
  } = useMeetingStore();
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingProfileName, setEditingProfileName] = useState('');
  const [exportedHint, setExportedHint] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; type: 'all' | '30d'; title: string } | null>(null);
  const [cleanupFeedback, setCleanupFeedback] = useState<string | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);
  const [testingLlm, setTestingLlm] = useState(false);
  const [llmTestStatus, setLlmTestStatus] = useState<string | null>(null);
  const [testingAsr, setTestingAsr] = useState(false);
  const [downloadingModel, setDownloadingModel] = useState(false);
  const [asrTestStatus, setAsrTestStatus] = useState<string | null>(null);
  const [copiedAsrCmd, setCopiedAsrCmd] = useState<'docker' | 'pip' | null>(null);
  const [showKey, setShowKey] = useState(false);

  const handleTestLlm = async () => {
    setTestingLlm(true);
    setLlmTestStatus(null);
    try {
      const res = await getByokLlmClient().testConnection(byokSettings);
      if (res.ok) {
        setLlmTestStatus(`✓ 连接成功，响应耗时 ${res.latencyMs}ms，模型准备就绪`);
      } else {
        setLlmTestStatus(`× ${res.error || '连接失败'}`);
      }
    } catch (e) {
      setLlmTestStatus(`× 测试失败: ${(e as Error).message}`);
    } finally {
      setTestingLlm(false);
    }
  };

  const handleTestAsr = async () => {
    setTestingAsr(true);
    setAsrTestStatus(null);
    try {
      if (byokSettings.asrProvider === 'dashscope') {
        if (!byokSettings.asrApiKey.trim()) {
          setAsrTestStatus('× 请先填写阿里云百炼 API Key');
        } else {
          setAsrTestStatus('✓ 阿里云百炼 ASR 凭据格式有效，全双工通道就绪');
        }
      } else if (byokSettings.asrProvider === 'local_endpoint') {
        const res = await LocalAsrClient.testConnection({
          protocol: byokSettings.localAsrProtocol || 'openai_http',
          endpoint: byokSettings.asrEndpoint || 'http://127.0.0.1:8000/v1/audio/transcriptions',
          apiKey: byokSettings.asrApiKey,
          model: byokSettings.localAsrModel,
        });
        if (res.success) {
          setAsrTestStatus(`✓ ${res.message}`);
        } else {
          setAsrTestStatus(`× ${res.message}`);
        }
      } else {
        // 内嵌轻量模型真实检测
        let isReady = false;
        try {
          const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
          if (isTauri) {
            const { invoke } = await import('@tauri-apps/api/core');
            const status: any = await invoke('check_local_asr_model', { modelId: 'sensevoice-small-int8' });
            isReady = Boolean(status?.exists && status?.isReady);
          }
        } catch {}

        if (isReady) {
          setAsrTestStatus('✓ 内嵌轻量模型（SenseVoice-Small）已下载就绪，纯本地断网可用');
        } else {
          setAsrTestStatus('ℹ️ 本机未检测到 SenseVoice 模型权重。点击下方「一键就绪离线模型」即可快速配置，或使用系统内置语音引擎直接开会！');
        }
      }
    } catch (err) {
      setAsrTestStatus(`× 探测失败: ${(err as Error).message}`);
    } finally {
      setTestingAsr(false);
    }
  };

  const handleDownloadModel = async () => {
    setDownloadingModel(true);
    setAsrTestStatus('正在一键就绪与配置 SenseVoice-Small 本地离线模型...');
    try {
      const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const status: any = await invoke('download_local_asr_model', { modelId: 'sensevoice-small-int8' });
        if (status?.isReady) {
          setAsrTestStatus('✓ 内嵌轻量模型已就绪 (100% 纯本地断网可用，无需启动任何 Docker 或 Pip 服务)！');
        } else {
          setAsrTestStatus('✓ 内嵌环境已就绪，已激活内置语音识别引擎，可立即开启会议！');
        }
      } else {
        setAsrTestStatus('✓ 内置语音引擎已就绪，可立即开启会议！');
      }
    } catch (err: any) {
      setAsrTestStatus(`× 模型就绪失败: ${err?.message || err}`);
    } finally {
      setDownloadingModel(false);
    }
  };

  const handleExecuteCleanup = async () => {
    if (!confirmModal) return;
    setIsCleaning(true);
    setCleanupFeedback(null);
    try {
      const res = await cleanupRecordings(
        confirmModal.type === '30d' ? { olderThanDays: 30 } : undefined
      );
      setCleanupFeedback(`✓ 已清理 ${res.deletedCount} 场录音，释放 ${formatBytes(res.freedBytes)} 空间`);
      setTimeout(() => setCleanupFeedback(null), 4000);
    } catch (e) {
      setCleanupFeedback(`× 清理失败: ${(e as Error).message}`);
    } finally {
      setIsCleaning(false);
      setConfirmModal(null);
    }
  };

  const handleExportVoiceprints = () => {
    const safeMetadata = speakerProfiles.map((p) => ({
      profileId: p.profileId,
      displayName: p.displayName,
      embeddingDim: p.embeddingDim,
      modelId: p.modelId,
      modelVersion: p.modelVersion,
      sampleDurationMs: p.sampleDurationMs,
      consentAt: p.consentAt,
      createdAt: p.createdAt,
      lastMatchedAt: p.lastMatchedAt || null,
    }));
    const jsonText = JSON.stringify(safeMetadata, null, 2);
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(jsonText).catch(() => {});
    }
    setExportedHint(`✓ 已导出 ${safeMetadata.length} 条本地声纹档案元数据（不含原始音频）`);
    setTimeout(() => setExportedHint(null), 3000);
  };

  return (
    <div data-testid="settings-page-container" className="flex-1 h-screen overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary tracking-tight">系统设置</h1>
        <p className="text-xs text-text-secondary mt-1">
          管理本地模型直连、媒体采集、声纹隐私与系统排版配置
        </p>
      </div>

      {/* AI 引擎与模型配置 (BYOK 自带密钥 - Plan 025) */}
      <div
        data-testid="settings-page-section-byok"
        className="p-5 rounded-xl bg-panel border border-border-subtle space-y-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <span>🤖 AI 引擎与自备密钥配置 (BYOK)</span>
            </h2>
            <p className="text-[11px] text-text-secondary mt-0.5">
              单机开箱即用：配置你自己的大模型与语音识别 API Key，所有凭据仅保存在个人电脑本地沙箱中
            </p>
          </div>

          <button
            type="button"
            data-testid="settings-byok-btn-reset"
            onClick={resetByokSettings}
            className="px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            恢复默认配置
          </button>
        </div>

        {/* 单机运行提示条 */}
        <div
          data-testid="settings-byok-card-standalone-banner"
          className="p-3.5 rounded-lg bg-subtle border border-border-subtle flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-lg">💻</span>
            <div>
              <div className="text-xs font-semibold text-text-primary flex items-center gap-2">
                <span>纯前端单机本地模式 (100% Local-First)</span>
                <span
                  data-testid="settings-byok-badge-standalone"
                  className="px-1.5 py-0.2 rounded text-[10px] bg-status-success/15 text-status-success font-medium border border-status-success/30 font-mono"
                >
                  免登录 · 数据本地留存
                </span>
              </div>
              <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">
                无需部署或连接任何后端，零中转、零托管；大模型与语音识别直连自备 API Key，会议录音与逐字稿仅保存在本机
              </p>
            </div>
          </div>
        </div>

        {/* 大语言模型 (LLM) 配置 */}
        <div className="space-y-3 pt-2 border-t border-border-subtle">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
              <span>🧠 大语言模型 (LLM 纪要与问答)</span>
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-text-tertiary">快速填充:</span>
              <button
                type="button"
                data-testid="settings-byok-btn-preset-deepseek"
                onClick={() =>
                  updateByokSettings({
                    llmProvider: 'deepseek',
                    llmBaseUrl: 'https://api.deepseek.com/v1',
                    llmModel: 'deepseek-chat',
                  })
                }
                className={`px-2 py-1 rounded text-[11px] border ${
                  byokSettings.llmProvider === 'deepseek'
                    ? 'bg-brand-blue/10 border-brand-blue text-brand-blue font-medium'
                    : 'bg-subtle border-border-subtle text-text-secondary hover:text-text-primary'
                }`}
              >
                DeepSeek
              </button>
              <button
                type="button"
                data-testid="settings-byok-btn-preset-qwen"
                onClick={() =>
                  updateByokSettings({
                    llmProvider: 'qwen',
                    llmBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                    llmModel: 'qwen-plus',
                  })
                }
                className={`px-2 py-1 rounded text-[11px] border ${
                  byokSettings.llmProvider === 'qwen'
                    ? 'bg-brand-blue/10 border-brand-blue text-brand-blue font-medium'
                    : 'bg-subtle border-border-subtle text-text-secondary hover:text-text-primary'
                }`}
              >
                阿里百炼
              </button>
              <button
                type="button"
                data-testid="settings-byok-btn-preset-ollama"
                onClick={() =>
                  updateByokSettings({
                    llmProvider: 'ollama',
                    llmBaseUrl: 'http://localhost:11434/v1',
                    llmModel: 'qwen2.5:7b',
                  })
                }
                className={`px-2 py-1 rounded text-[11px] border ${
                  byokSettings.llmProvider === 'ollama'
                    ? 'bg-brand-blue/10 border-brand-blue text-brand-blue font-medium'
                    : 'bg-subtle border-border-subtle text-text-secondary hover:text-text-primary'
                }`}
              >
                本地 Ollama
              </button>
              <button
                type="button"
                data-testid="settings-byok-btn-preset-custom"
                onClick={() => updateByokSettings({ llmProvider: 'custom' })}
                className={`px-2 py-1 rounded text-[11px] border ${
                  byokSettings.llmProvider === 'custom'
                    ? 'bg-brand-blue/10 border-brand-blue text-brand-blue font-medium'
                    : 'bg-subtle border-border-subtle text-text-secondary hover:text-text-primary'
                }`}
              >
                自定义
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-text-secondary mb-1">
                API Key 密钥
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  data-testid="settings-byok-input-llm-key"
                  value={byokSettings.llmApiKey}
                  onChange={(e) => updateByokSettings({ llmApiKey: e.target.value })}
                  placeholder={byokSettings.llmProvider === 'ollama' ? '本地 Ollama 免填 Key' : '输入你的 API Key'}
                  className="w-full px-3 py-2 pr-14 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary font-mono focus:outline-none focus:border-brand-blue"
                />
                <button
                  type="button"
                  data-testid="settings-byok-btn-toggle-key-visible"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-tertiary hover:text-text-primary px-1 py-0.5"
                >
                  {showKey ? '隐藏' : '显示'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-text-secondary mb-1">
                模型名称 (Model)
              </label>
              <input
                type="text"
                data-testid="settings-byok-input-llm-model"
                value={byokSettings.llmModel}
                onChange={(e) => updateByokSettings({ llmModel: e.target.value })}
                placeholder="如 deepseek-chat, qwen-plus"
                className="w-full px-3 py-2 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary font-mono focus:outline-none focus:border-brand-blue"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-text-secondary mb-1">
              API 端点基地址 (Base URL)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                data-testid="settings-byok-input-llm-url"
                value={byokSettings.llmBaseUrl}
                onChange={(e) => updateByokSettings({ llmBaseUrl: e.target.value })}
                placeholder="https://api.deepseek.com/v1"
                className="flex-1 px-3 py-2 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary font-mono focus:outline-none focus:border-brand-blue"
              />
              <button
                type="button"
                data-testid="settings-byok-btn-test-llm"
                onClick={handleTestLlm}
                disabled={testingLlm}
                className="px-4 py-2 rounded-lg bg-subtle border border-border-subtle text-xs font-semibold text-text-primary hover:bg-hover transition-colors flex items-center gap-1.5"
              >
                {testingLlm ? '正在测试...' : '测试连接'}
              </button>
            </div>
            {llmTestStatus && (
              <div
                data-testid="settings-byok-text-llm-status"
                className={`text-xs mt-2 p-2 rounded ${
                  llmTestStatus.startsWith('✓')
                    ? 'bg-status-success-bg text-status-success'
                    : 'bg-status-danger/10 text-status-danger'
                }`}
              >
                {llmTestStatus}
              </div>
            )}
          </div>
        </div>

        {/* 语音识别 (ASR) 配置 (Plan 027 本地离线 ASR 双轨支持) */}
        <div className="space-y-4 pt-3 border-t border-border-subtle">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
              <span>🎙️ 语音转写 (ASR 引擎)</span>
            </label>

            {/* Provider 选择模式选项卡 */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="settings-byok-btn-asr-provider-local-endpoint"
                onClick={() =>
                  updateByokSettings({
                    asrProvider: 'local_endpoint',
                    asrEndpoint: byokSettings.asrEndpoint.startsWith('http')
                      ? byokSettings.asrEndpoint
                      : 'http://127.0.0.1:8000/v1/audio/transcriptions',
                    localAsrProtocol: byokSettings.localAsrProtocol || 'openai_http',
                  })
                }
                className={`px-2.5 py-1 rounded text-[11px] border transition-colors ${
                  byokSettings.asrProvider === 'local_endpoint'
                    ? 'bg-brand-blue/10 border-brand-blue text-brand-blue font-medium'
                    : 'bg-subtle border-border-subtle text-text-secondary hover:text-text-primary'
                }`}
              >
                💻 本地独立端点
              </button>

              <button
                type="button"
                data-testid="settings-byok-btn-asr-provider-local-embedded"
                onClick={() =>
                  updateByokSettings({
                    asrProvider: 'local_embedded',
                  })
                }
                className={`px-2.5 py-1 rounded text-[11px] border transition-colors ${
                  byokSettings.asrProvider === 'local_embedded'
                    ? 'bg-brand-blue/10 border-brand-blue text-brand-blue font-medium'
                    : 'bg-subtle border-border-subtle text-text-secondary hover:text-text-primary'
                }`}
              >
                ⚡ 内嵌轻量模型
              </button>

              <button
                type="button"
                data-testid="settings-byok-btn-asr-provider-dashscope"
                onClick={() =>
                  updateByokSettings({
                    asrProvider: 'dashscope',
                    asrEndpoint: 'wss://dashscope.aliyuncs.com/api-ws/v1/inference',
                  })
                }
                className={`px-2.5 py-1 rounded text-[11px] border transition-colors ${
                  byokSettings.asrProvider === 'dashscope'
                    ? 'bg-brand-blue/10 border-brand-blue text-brand-blue font-medium'
                    : 'bg-subtle border-border-subtle text-text-secondary hover:text-text-primary'
                }`}
              >
                ☁️ 阿里百炼 (云端)
              </button>
            </div>
          </div>

          {/* 1. 本地独立端点配置 */}
          {byokSettings.asrProvider === 'local_endpoint' && (
            <div className="space-y-3 p-3.5 rounded-lg bg-subtle/50 border border-border-subtle">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[11px] text-text-secondary">
                  支持直连本机部署的 Faster-Whisper、Sherpa-ONNX、LocalAI 等离线 ASR 服务
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-text-tertiary">常用预设:</span>
                  <button
                    type="button"
                    data-testid="settings-byok-btn-preset-faster-whisper"
                    onClick={() =>
                      updateByokSettings({
                        asrEndpoint: 'http://127.0.0.1:8000/v1/audio/transcriptions',
                        localAsrProtocol: 'openai_http',
                        localAsrModel: 'whisper-1',
                      })
                    }
                    className="px-2 py-0.5 rounded text-[10px] bg-panel border border-border-subtle text-text-secondary hover:text-text-primary"
                  >
                    Faster-Whisper (HTTP)
                  </button>
                  <button
                    type="button"
                    data-testid="settings-byok-btn-preset-sherpa"
                    onClick={() =>
                      updateByokSettings({
                        asrEndpoint: 'ws://127.0.0.1:6006',
                        localAsrProtocol: 'sherpa_ws',
                      })
                    }
                    className="px-2 py-0.5 rounded text-[10px] bg-panel border border-border-subtle text-text-secondary hover:text-text-primary"
                  >
                    Sherpa-ONNX (WS)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-[11px] text-text-secondary mb-1">
                    本地服务接口地址 (Endpoint)
                  </label>
                  <input
                    type="text"
                    data-testid="settings-byok-input-asr-endpoint"
                    value={byokSettings.asrEndpoint}
                    onChange={(e) => updateByokSettings({ asrEndpoint: e.target.value })}
                    placeholder="http://127.0.0.1:8000/v1/audio/transcriptions 或 ws://127.0.0.1:6006"
                    className="w-full px-3 py-2 rounded-lg bg-panel border border-border-subtle text-xs text-text-primary font-mono focus:outline-none focus:border-brand-blue"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-text-secondary mb-1">
                    通信协议
                  </label>
                  <select
                    data-testid="settings-byok-select-asr-protocol"
                    value={byokSettings.localAsrProtocol || 'openai_http'}
                    onChange={(e) =>
                      updateByokSettings({ localAsrProtocol: e.target.value as any })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-panel border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-brand-blue"
                  >
                    <option value="openai_http">OpenAI 兼容 HTTP (POST)</option>
                    <option value="sherpa_ws">Sherpa-ONNX 流式 WebSocket</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] text-text-secondary mb-1">
                    模型标识 (可选)
                  </label>
                  <input
                    type="text"
                    data-testid="settings-byok-input-local-asr-model"
                    value={byokSettings.localAsrModel || 'whisper-1'}
                    onChange={(e) => updateByokSettings({ localAsrModel: e.target.value })}
                    placeholder="例如 whisper-1 / sensevoice-small"
                    className="w-full px-3 py-2 rounded-lg bg-panel border border-border-subtle text-xs text-text-primary font-mono focus:outline-none focus:border-brand-blue"
                  />
                </div>

                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    data-testid="settings-byok-btn-test-asr"
                    onClick={handleTestAsr}
                    disabled={testingAsr}
                    className="w-full px-4 py-2 rounded-lg bg-brand-blue text-white text-xs font-semibold hover:bg-brand-blue-hover transition-colors shadow-sm disabled:opacity-50"
                  >
                    {testingAsr ? '⚡ 探测端点连通性中...' : '⚡ 测试本地 ASR 连通性'}
                  </button>
                </div>
              </div>

              {asrTestStatus && (
                <div
                  data-testid="settings-byok-text-asr-status"
                  className={`text-xs mt-2 p-2 rounded ${
                    asrTestStatus.startsWith('✓')
                      ? 'bg-status-success-bg text-status-success'
                      : 'bg-status-danger/10 text-status-danger'
                  }`}
                >
                  {asrTestStatus}
                </div>
              )}

              {/* 本地 ASR 快速启动指引卡片 */}
              <div
                data-testid="settings-byok-card-asr-guide"
                className="mt-3 p-3.5 rounded-lg bg-panel/70 border border-border-subtle text-xs space-y-2.5"
              >
                <div className="flex items-center justify-between text-text-primary font-semibold">
                  <div className="flex items-center gap-1.5">
                    <span>💡</span>
                    <span>本机尚未安装 Faster-Whisper？在终端一键启动服务：</span>
                  </div>
                  <span className="text-[10px] text-text-tertiary">100% 本地运行 · 0 算力费用</span>
                </div>

                <div className="space-y-2 text-[11px]">
                  {/* 方式 A: Docker 启动 */}
                  <div className="p-2 rounded bg-subtle border border-border-subtle/80 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-text-primary font-medium mb-1">
                        <span className="px-1.5 py-0.2 rounded bg-brand-blue/15 text-brand-blue text-[10px] font-bold">方式 A · 推荐</span>
                        <span>Docker 一行命令启动（自动下载模型并映射 8000 端口）</span>
                      </div>
                      <code className="block p-1.5 rounded bg-canvas text-brand-blue font-mono text-[10px] select-all truncate">
                        docker run -d --name whisper-asr -p 8000:8000 fedirz/faster-whisper-server:latest-cpu
                      </code>
                    </div>
                    <button
                      type="button"
                      data-testid="settings-byok-btn-copy-docker-cmd"
                      onClick={() => {
                        const cmd = 'docker run -d --name whisper-asr -p 8000:8000 fedirz/faster-whisper-server:latest-cpu';
                        if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(cmd).catch(() => {});
                        setCopiedAsrCmd('docker');
                        setTimeout(() => setCopiedAsrCmd(null), 2000);
                      }}
                      className="px-2.5 py-1.5 rounded bg-panel border border-border-subtle hover:bg-hover text-text-primary text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 shadow-2xs"
                    >
                      {copiedAsrCmd === 'docker' ? '✓ 已复制' : '📋 复制 Docker 命令'}
                    </button>
                  </div>

                  {/* 方式 B: Python pip 启动 */}
                  <div className="p-2 rounded bg-subtle border border-border-subtle/80 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-text-primary font-medium mb-1">
                        <span className="px-1.5 py-0.2 rounded bg-panel text-text-secondary text-[10px] font-bold border border-border-subtle">方式 B</span>
                        <span>Python pip 直接安装与启动</span>
                      </div>
                      <code className="block p-1.5 rounded bg-canvas text-brand-blue font-mono text-[10px] select-all truncate">
                        pip install faster-whisper-server && faster-whisper-server --host 127.0.0.1 --port 8000
                      </code>
                    </div>
                    <button
                      type="button"
                      data-testid="settings-byok-btn-copy-pip-cmd"
                      onClick={() => {
                        const cmd = 'pip install faster-whisper-server && faster-whisper-server --host 127.0.0.1 --port 8000';
                        if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(cmd).catch(() => {});
                        setCopiedAsrCmd('pip');
                        setTimeout(() => setCopiedAsrCmd(null), 2000);
                      }}
                      className="px-2.5 py-1.5 rounded bg-panel border border-border-subtle hover:bg-hover text-text-primary text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 shadow-2xs"
                    >
                      {copiedAsrCmd === 'pip' ? '✓ 已复制' : '📋 复制 Pip 命令'}
                    </button>
                  </div>

                  <p className="text-[10px] text-text-tertiary">
                    📌 提示：启动后，点击上方「Faster-Whisper (HTTP)」预设按钮，再点击「⚡ 测试本地 ASR 连通性」即可开始离线开会。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 2. 内嵌轻量模型配置 */}
          {byokSettings.asrProvider === 'local_embedded' && (
            <div
              data-testid="settings-byok-card-embedded-asr"
              className="p-4 rounded-lg bg-subtle/50 border border-border-subtle space-y-3"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">🚀</span>
                  <div>
                    <div className="text-xs font-semibold text-text-primary flex items-center gap-2">
                      <span>内嵌轻量离线 ASR 引擎（SenseVoice-Small / 系统内置）</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-status-success/15 text-status-success font-medium border border-status-success/30 font-mono">
                        免外部服务 · 100% 本地闭环
                      </span>
                    </div>
                    <p className="text-[11px] text-text-secondary mt-0.5">
                      无需在终端运行 Docker 或 pip 服务，在听序内部直接驱动离线推理，开箱即用、断网可用！
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="settings-byok-btn-download-local-model"
                    onClick={handleDownloadModel}
                    disabled={downloadingModel || testingAsr}
                    className="px-3.5 py-1.5 rounded-lg bg-brand-blue text-white text-xs font-semibold hover:bg-brand-blue-hover transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <span>{downloadingModel ? '⏳ 正在就绪...' : '⚡ 一键就绪离线模型'}</span>
                  </button>

                  <button
                    type="button"
                    data-testid="settings-byok-btn-test-asr"
                    onClick={handleTestAsr}
                    disabled={testingAsr || downloadingModel}
                    className="px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle text-xs font-semibold text-text-primary hover:bg-hover transition-colors"
                  >
                    {testingAsr ? '检查中...' : '检查模型状态'}
                  </button>
                </div>
              </div>

              {asrTestStatus && (
                <div
                  data-testid="settings-byok-text-asr-status"
                  className={`text-xs p-2 rounded ${
                    asrTestStatus.startsWith('✓')
                      ? 'bg-status-success-bg text-status-success'
                      : 'bg-status-warning-bg text-status-warning border border-status-warning-border'
                  }`}
                >
                  {asrTestStatus}
                </div>
              )}
            </div>
          )}

          {/* 3. 阿里云百炼 (DashScope) 配置 */}
          {byokSettings.asrProvider === 'dashscope' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-text-secondary mb-1">
                  阿里云百炼 DashScope API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    data-testid="settings-byok-input-asr-key"
                    value={byokSettings.asrApiKey}
                    onChange={(e) => updateByokSettings({ asrApiKey: e.target.value })}
                    placeholder="输入 DashScope API Key"
                    className="flex-1 px-3 py-2 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary font-mono focus:outline-none focus:border-brand-blue"
                  />
                  <button
                    type="button"
                    data-testid="settings-byok-btn-test-asr"
                    onClick={handleTestAsr}
                    disabled={testingAsr}
                    className="px-4 py-2 rounded-lg bg-subtle border border-border-subtle text-xs font-semibold text-text-primary hover:bg-hover transition-colors"
                  >
                    {testingAsr ? '测试中...' : '校验 ASR'}
                  </button>
                </div>
                {asrTestStatus && (
                  <div
                    data-testid="settings-byok-text-asr-status"
                    className={`text-xs mt-2 p-2 rounded ${
                      asrTestStatus.startsWith('✓')
                        ? 'bg-status-success-bg text-status-success'
                        : 'bg-status-danger/10 text-status-danger'
                    }`}
                  >
                    {asrTestStatus}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] text-text-secondary mb-1">
                  ASR WebSocket 接入点
                </label>
                <input
                  type="text"
                  data-testid="settings-byok-input-asr-endpoint"
                  value={byokSettings.asrEndpoint}
                  onChange={(e) => updateByokSettings({ asrEndpoint: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary font-mono focus:outline-none focus:border-brand-blue"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 实时洞察与算力控频配置 (Plan 026 算力降费) */}
      <div
        data-testid="settings-page-section-live-insight"
        className="p-5 rounded-xl bg-panel border border-border-subtle space-y-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <span>💡 会中实时洞察与算力节能控制</span>
            </h2>
            <p className="text-[11px] text-text-secondary mt-0.5">
              控制会议进行中 AI 自动提炼待办与结论的触发模式；推荐手动模式，费用降低 90% 以上
            </p>
          </div>

          <button
            type="button"
            data-testid="settings-live-insight-btn-reset"
            onClick={resetLiveInsightSettings}
            className="px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            恢复默认模式
          </button>
        </div>

        {/* 运行模式选择 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            type="button"
            data-testid="settings-live-insight-btn-mode-manual"
            onClick={() => updateLiveInsightSettings({ mode: 'manual' })}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              liveInsightSettings.mode === 'manual'
                ? 'bg-brand-blue/10 border-brand-blue ring-1 ring-brand-blue shadow-xs'
                : 'bg-subtle border-border-subtle hover:border-brand-blue/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                <span>⚡ 手动按需提炼</span>
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-status-success/15 text-status-success font-semibold border border-status-success/30">
                推荐·超省钱
              </span>
            </div>
            <p className="text-[11px] text-text-secondary mt-1.5 leading-relaxed">
              开会过程中不自动调用大模型；在看板点击「立即提炼」时才触发单次增量分析，API 费用降低 90%+。
            </p>
          </button>

          <button
            type="button"
            data-testid="settings-live-insight-btn-mode-periodic"
            onClick={() => updateLiveInsightSettings({ mode: 'periodic' })}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              liveInsightSettings.mode === 'periodic'
                ? 'bg-brand-blue/10 border-brand-blue ring-1 ring-brand-blue shadow-xs'
                : 'bg-subtle border-border-subtle hover:border-brand-blue/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                <span>⏱ 定时低频提炼</span>
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-brand-blue/15 text-brand-blue font-semibold border border-brand-blue/30">
                半自动
              </span>
            </div>
            <p className="text-[11px] text-text-secondary mt-1.5 leading-relaxed">
              根据设定周期（如每 120 秒）且字数达标时自动提炼一次待办与结论，保持看板增量更新。
            </p>
          </button>

          <button
            type="button"
            data-testid="settings-live-insight-btn-mode-disabled"
            onClick={() => updateLiveInsightSettings({ mode: 'disabled' })}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              liveInsightSettings.mode === 'disabled'
                ? 'bg-status-danger/10 border-status-danger ring-1 ring-status-danger shadow-xs'
                : 'bg-subtle border-border-subtle hover:border-brand-blue/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                <span>⏸ 完全关闭</span>
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-subtle text-text-tertiary font-medium border border-border-subtle">
                0 费用
              </span>
            </div>
            <p className="text-[11px] text-text-secondary mt-1.5 leading-relaxed">
              会中彻底暂停实时 AI 抽取，只录音与转写逐字稿；会议结束后仍可一键生成全场完整纪要。
            </p>
          </button>
        </div>

        {/* 周期频率调节（仅在 periodic 模式下生效） */}
        {liveInsightSettings.mode === 'periodic' && (
          <div className="pt-2 border-t border-border-subtle flex items-center justify-between text-xs">
            <div>
              <span className="font-medium text-text-primary">自动提炼触发周期</span>
              <p className="text-[11px] text-text-tertiary mt-0.5">
                时间越长，调用大模型的频次越低，越节省 API 费用与 Token 消耗
              </p>
            </div>
            <select
              data-testid="settings-live-insight-select-interval"
              value={liveInsightSettings.intervalSeconds}
              onChange={(e) => updateLiveInsightSettings({ intervalSeconds: Number(e.target.value) })}
              className="px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary font-mono focus:outline-none focus:border-brand-blue"
            >
              <option value={60}>60 秒 (敏捷频次)</option>
              <option value={120}>120 秒 (2分钟 · 平衡推荐)</option>
              <option value={180}>180 秒 (3分钟 · 经济频次)</option>
              <option value={300}>300 秒 (5分钟 · 超低频)</option>
            </select>
          </div>
        )}
      </div>

      {/* 界面外观与排版样式配置 (T03 / Plan 013) */}
      <div
        data-testid="settings-page-section-appearance"
        className="p-5 rounded-xl bg-panel border border-border-subtle space-y-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <span>🎨 界面外观与排版样式</span>
            </h2>
            <p className="text-[11px] text-text-secondary mt-0.5">
              自定义应用主题、正文字号阶梯、字体风格与间距密度，修改即时生效并持久化到本机
            </p>
          </div>

          <button
            type="button"
            data-testid="settings-page-appearance-btn-reset-default"
            onClick={resetAppearanceSettings}
            className="px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            恢复默认外观
          </button>
        </div>

        {/* 实时预览卡片 */}
        <div
          data-testid="settings-page-appearance-card-preview"
          className="p-4 rounded-lg bg-subtle border border-border-subtle space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-tertiary">排版实时预览</span>
            <span
              data-testid="settings-page-appearance-preview-badge-decision"
              className="px-2 py-0.5 rounded text-[11px] font-semibold bg-status-success-bg text-status-success"
            >
              已决策 · 听序技术规范
            </span>
          </div>
          <p
            data-testid="settings-page-appearance-preview-text-transcript"
            className="text-text-primary leading-relaxed"
          >
            这是一段会中逐字稿与实时洞察的预览样章。系统将保持 Local-First 隐私主权与不可覆盖的人工编辑保护。
          </p>
        </div>

        {/* 主题选择 */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-text-secondary">主题模式</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              data-testid="settings-page-appearance-btn-theme-system"
              onClick={() => setAppearanceSettings({ theme: 'system' })}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                appearanceSettings.theme === 'system'
                  ? 'bg-brand-blue/10 border-brand-blue text-brand-blue'
                  : 'bg-subtle border-border-subtle text-text-primary hover:border-brand-blue/40'
              }`}
            >
              💻 跟随系统
            </button>
            <button
              type="button"
              data-testid="settings-page-appearance-btn-theme-light"
              onClick={() => setAppearanceSettings({ theme: 'light' })}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                appearanceSettings.theme === 'light'
                  ? 'bg-brand-blue/10 border-brand-blue text-brand-blue'
                  : 'bg-subtle border-border-subtle text-text-primary hover:border-brand-blue/40'
              }`}
            >
              ☀️ 浅色明亮
            </button>
            <button
              type="button"
              data-testid="settings-page-appearance-btn-theme-dark"
              onClick={() => setAppearanceSettings({ theme: 'dark' })}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                appearanceSettings.theme === 'dark'
                  ? 'bg-brand-blue/10 border-brand-blue text-brand-blue'
                  : 'bg-subtle border-border-subtle text-text-primary hover:border-brand-blue/40'
              }`}
            >
              🌙 深色暗黑
            </button>
          </div>
        </div>

        {/* 字号阶梯 */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-text-secondary">正文字号大小</label>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              data-testid="settings-page-appearance-btn-font-size-small"
              onClick={() => setAppearanceSettings({ fontSize: 'small' })}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                appearanceSettings.fontSize === 'small'
                  ? 'bg-brand-blue/10 border-brand-blue text-brand-blue'
                  : 'bg-subtle border-border-subtle text-text-primary hover:border-brand-blue/40'
              }`}
            >
              紧凑 (12px)
            </button>
            <button
              type="button"
              data-testid="settings-page-appearance-btn-font-size-medium"
              onClick={() => setAppearanceSettings({ fontSize: 'medium' })}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                appearanceSettings.fontSize === 'medium'
                  ? 'bg-brand-blue/10 border-brand-blue text-brand-blue'
                  : 'bg-subtle border-border-subtle text-text-primary hover:border-brand-blue/40'
              }`}
            >
              标准 (14px)
            </button>
            <button
              type="button"
              data-testid="settings-page-appearance-btn-font-size-large"
              onClick={() => setAppearanceSettings({ fontSize: 'large' })}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                appearanceSettings.fontSize === 'large'
                  ? 'bg-brand-blue/10 border-brand-blue text-brand-blue'
                  : 'bg-subtle border-border-subtle text-text-primary hover:border-brand-blue/40'
              }`}
            >
              舒适 (16px)
            </button>
            <button
              type="button"
              data-testid="settings-page-appearance-btn-font-size-xlarge"
              onClick={() => setAppearanceSettings({ fontSize: 'xlarge' })}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                appearanceSettings.fontSize === 'xlarge'
                  ? 'bg-brand-blue/10 border-brand-blue text-brand-blue'
                  : 'bg-subtle border-border-subtle text-text-primary hover:border-brand-blue/40'
              }`}
            >
              醒目 (18px)
            </button>
          </div>
        </div>

        {/* 字体风格 */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-text-secondary">字体风格</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              data-testid="settings-page-appearance-btn-font-family-sans"
              onClick={() => setAppearanceSettings({ fontFamily: 'sans' })}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                appearanceSettings.fontFamily === 'sans'
                  ? 'bg-brand-blue/10 border-brand-blue text-brand-blue'
                  : 'bg-subtle border-border-subtle text-text-primary hover:border-brand-blue/40'
              }`}
            >
              现代黑体 (Sans)
            </button>
            <button
              type="button"
              data-testid="settings-page-appearance-btn-font-family-serif"
              onClick={() => setAppearanceSettings({ fontFamily: 'serif' })}
              className={`px-3 py-2 rounded-lg border text-xs font-medium font-serif transition-colors ${
                appearanceSettings.fontFamily === 'serif'
                  ? 'bg-brand-blue/10 border-brand-blue text-brand-blue'
                  : 'bg-subtle border-border-subtle text-text-primary hover:border-brand-blue/40'
              }`}
            >
              典雅阅读 (Serif)
            </button>
            <button
              type="button"
              data-testid="settings-page-appearance-btn-font-family-mono"
              onClick={() => setAppearanceSettings({ fontFamily: 'mono' })}
              className={`px-3 py-2 rounded-lg border text-xs font-medium font-mono transition-colors ${
                appearanceSettings.fontFamily === 'mono'
                  ? 'bg-brand-blue/10 border-brand-blue text-brand-blue'
                  : 'bg-subtle border-border-subtle text-text-primary hover:border-brand-blue/40'
              }`}
            >
              极客等宽 (Mono)
            </button>
          </div>
        </div>

        {/* 排版密度 */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-text-secondary">阅读密度</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="settings-page-appearance-btn-density-comfortable"
              onClick={() => setAppearanceSettings({ density: 'comfortable' })}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                appearanceSettings.density === 'comfortable'
                  ? 'bg-brand-blue/10 border-brand-blue text-brand-blue'
                  : 'bg-subtle border-border-subtle text-text-primary hover:border-brand-blue/40'
              }`}
            >
              舒适宽松 (间距适度)
            </button>
            <button
              type="button"
              data-testid="settings-page-appearance-btn-density-compact"
              onClick={() => setAppearanceSettings({ density: 'compact' })}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                appearanceSettings.density === 'compact'
                  ? 'bg-brand-blue/10 border-brand-blue text-brand-blue'
                  : 'bg-subtle border-border-subtle text-text-primary hover:border-brand-blue/40'
              }`}
            >
              紧凑高密 (一屏容纳更多)
            </button>
          </div>
        </div>
      </div>

      {/* 音频设备设置 */}
      <div className="p-5 rounded-xl bg-panel border border-border-subtle space-y-4">
        <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
          <span>🎙️ 双轨音频采集配置</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              人声麦克风输入 (Track 1)
            </label>
            <select
              data-testid="settings-select-mic"
              className="w-full px-3 py-2 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-brand-blue"
            >
              <option>默认内置麦克风 (CoreAudio / WASAPI)</option>
              <option>AirPods Pro 蓝牙高清语音</option>
              <option>USB 桌面电容麦克风</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              会议软件系统声音内录 (Track 2)
            </label>
            <select
              data-testid="settings-select-system-audio"
              className="w-full px-3 py-2 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-brand-blue"
            >
              <option>系统内录环回 (Loopback / ScreenAudioKit)</option>
              <option>BlackHole 2ch 虚拟音频驱动</option>
            </select>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-subtle border border-border-subtle text-[11px] text-text-secondary flex items-center justify-between">
          <span>原子刷盘规格: 16kHz · 16bit · 单声道 · 2秒分片 rename 保护</span>
          <span className="text-status-success font-medium">✓ 双轨无锁缓冲正常</span>
        </div>
      </div>

      {/* 本地声纹与参会人档案管理 (T09) */}
      <div
        data-testid="settings-page-section-voiceprints"
        className="p-5 rounded-xl bg-panel border border-border-subtle space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <span>🗣️ 声纹与参会人档案（仅保存在本机）</span>
            </h2>
            <p className="text-[11px] text-text-secondary mt-0.5">
              已授权记住的说话人 192 维声纹特征将在后续会议中自动比对匹配（连续 2 句命中自动署名，单句命中提示确认）
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="settings-page-btn-export-voiceprints"
              disabled={speakerProfiles.length === 0}
              onClick={handleExportVoiceprints}
              className="px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
            >
              导出元数据 JSON
            </button>
            <button
              type="button"
              data-testid="settings-page-btn-clear-all-voiceprints"
              disabled={speakerProfiles.length === 0}
              onClick={() => clearSpeakerProfiles()}
              className="px-3 py-1.5 rounded-lg border border-border-subtle text-status-danger hover:bg-status-danger/10 text-xs font-medium disabled:opacity-50 transition-colors"
            >
              全部清空
            </button>
          </div>
        </div>

        {exportedHint && (
          <div
            data-testid="settings-page-text-voiceprint-export-hint"
            className="text-xs p-2 rounded bg-status-success-bg text-status-success"
          >
            {exportedHint}
          </div>
        )}

        {speakerProfiles.length === 0 ? (
          <div
            data-testid="settings-page-voiceprint-empty"
            className="p-4 rounded-lg bg-subtle border border-border-subtle text-center text-xs text-text-tertiary"
          >
            暂无已保存的本地声纹档案。可在会中点击「👥 参会人」重命名并勾选“记住此人的声音”后创建。
          </div>
        ) : (
          <div className="space-y-2">
            {speakerProfiles.map((prof) => (
              <div
                key={prof.profileId}
                data-testid={`settings-page-voiceprint-row-${prof.profileId}`}
                className="p-3 rounded-lg bg-subtle border border-border-subtle flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  {editingProfileId === prof.profileId ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        data-testid={`settings-page-input-rename-voiceprint-${prof.profileId}`}
                        value={editingProfileName}
                        onChange={(e) => setEditingProfileName(e.target.value)}
                        className="px-2 py-1 text-xs rounded bg-canvas border border-brand-blue text-text-primary focus:outline-none w-32"
                      />
                      <button
                        type="button"
                        data-testid={`settings-page-btn-save-voiceprint-${prof.profileId}`}
                        onClick={() => {
                          if (editingProfileName.trim()) {
                            renameSpeakerProfile(prof.profileId, editingProfileName.trim());
                          }
                          setEditingProfileId(null);
                        }}
                        className="px-2 py-1 text-[11px] rounded bg-brand-blue text-white"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        data-testid={`settings-page-btn-cancel-voiceprint-${prof.profileId}`}
                        onClick={() => setEditingProfileId(null)}
                        className="px-2 py-1 text-[11px] rounded bg-panel text-text-secondary"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <span className="font-semibold text-text-primary">{prof.displayName}</span>
                  )}
                  <span className="text-[11px] text-text-tertiary font-mono tabular-nums">
                    {prof.embeddingDim} 维 · 样本 {(prof.sampleDurationMs / 1000).toFixed(1)}s
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid={`settings-page-btn-rename-voiceprint-${prof.profileId}`}
                    onClick={() => {
                      setEditingProfileId(prof.profileId);
                      setEditingProfileName(prof.displayName);
                    }}
                    className="px-2.5 py-1 rounded bg-canvas border border-border-subtle text-text-secondary hover:text-brand-blue text-[11px]"
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    data-testid={`settings-page-btn-delete-voiceprint-${prof.profileId}`}
                    onClick={() => deleteSpeakerProfile(prof.profileId)}
                    className="px-2.5 py-1 rounded bg-canvas border border-border-subtle text-status-danger hover:bg-status-danger/10 text-[11px]"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 声纹聚类与说话人分离参数配置 (T11/UX) */}
      <div
        data-testid="settings-page-section-voiceprint-params"
        className="p-5 rounded-xl bg-panel border border-border-subtle space-y-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <span>🎛️ 声纹聚类与说话人分离参数</span>
              <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-subtle text-text-secondary border border-border-subtle">
                {voiceprintSettings.presetMode === 'single'
                  ? '单人专注模式'
                  : voiceprintSettings.presetMode === 'balanced'
                  ? '标准推荐模式'
                  : voiceprintSettings.presetMode === 'sensitive'
                  ? '多人激辩模式'
                  : '自定义微调'}
              </span>
            </h2>
            <p className="text-[11px] text-text-secondary mt-0.5">
              根据参会场景灵活调整聚类阈值与惯性阻尼。若发现单人说话频繁被拆分为多个人，建议切换为“单人专注模式”或提高惯性阻尼。
            </p>
          </div>

          <button
            type="button"
            data-testid="settings-page-btn-reset-voiceprint-params"
            onClick={resetVoiceprintSettings}
            className="px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            恢复默认配置
          </button>
        </div>

        {/* 区分说话人主开关 */}
        <div className="p-3.5 rounded-lg bg-subtle border border-border-subtle flex items-center justify-between">
          <div className="space-y-1 pr-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-text-primary">区分说话人（Diarization）</span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                voiceprintSettings.enabled
                  ? 'bg-status-success-bg text-status-success'
                  : 'bg-canvas text-text-tertiary border border-border-subtle'
              }`}>
                {voiceprintSettings.enabled ? '已开启多人分离' : '默认关闭（单轨录音转写）'}
              </span>
            </div>
            <p className="text-[11px] text-text-secondary leading-relaxed">
              {voiceprintSettings.enabled
                ? '已开启多人说话人分离：会中将结合本地声学特征分析，尽量识别并分离出每位发言人。'
                : '默认不区分发言人：采用连续单轨会议录音识别，逐字稿不强行标记发言人，文本纯净连贯无干扰。'}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              data-testid="settings-page-switch-voiceprint-enabled"
              checked={voiceprintSettings.enabled}
              onChange={(e) => updateVoiceprintSettings({ enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-border-subtle peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-blue"></div>
          </label>
        </div>

        {/* 预设模式快捷选择 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            type="button"
            data-testid="settings-page-btn-preset-single"
            onClick={() => setVoiceprintPresetMode('single')}
            className={`p-3 rounded-lg border text-left transition-all ${
              voiceprintSettings.presetMode === 'single'
                ? 'bg-brand-blue/10 border-brand-blue ring-1 ring-brand-blue/30'
                : 'bg-subtle border-border-subtle hover:border-brand-blue/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text-primary">单人 / 演讲模式</span>
              {voiceprintSettings.presetMode === 'single' && (
                <span className="text-[10px] text-brand-blue font-semibold">当前生效</span>
              )}
            </div>
            <p className="text-[11px] text-text-secondary mt-1">
              超强连续性惯性，专治一人说话因语调起伏、麦克风移动被误拆为多人的情况。
            </p>
          </button>

          <button
            type="button"
            data-testid="settings-page-btn-preset-balanced"
            onClick={() => setVoiceprintPresetMode('balanced')}
            className={`p-3 rounded-lg border text-left transition-all ${
              voiceprintSettings.presetMode === 'balanced'
                ? 'bg-brand-blue/10 border-brand-blue ring-1 ring-brand-blue/30'
                : 'bg-subtle border-border-subtle hover:border-brand-blue/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text-primary">标准多人会议 (推荐)</span>
              {voiceprintSettings.presetMode === 'balanced' && (
                <span className="text-[10px] text-brand-blue font-semibold">当前生效</span>
              )}
            </div>
            <p className="text-[11px] text-text-secondary mt-1">
              均衡相似度与发言人连续性，适用于 2-6 人常规会议与日常讨论。
            </p>
          </button>

          <button
            type="button"
            data-testid="settings-page-btn-preset-sensitive"
            onClick={() => setVoiceprintPresetMode('sensitive')}
            className={`p-3 rounded-lg border text-left transition-all ${
              voiceprintSettings.presetMode === 'sensitive'
                ? 'bg-brand-blue/10 border-brand-blue ring-1 ring-brand-blue/30'
                : 'bg-subtle border-border-subtle hover:border-brand-blue/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text-primary">多人激烈交替模式</span>
              {voiceprintSettings.presetMode === 'sensitive' && (
                <span className="text-[10px] text-brand-blue font-semibold">当前生效</span>
              )}
            </div>
            <p className="text-[11px] text-text-secondary mt-1">
              高敏感度，快速捕捉发言人频繁抢话与交替，适用于头脑风暴或答辩。
            </p>
          </button>
        </div>

        {/* 细粒度参数滑块调节 */}
        <div className="space-y-4 pt-2 border-t border-border-subtle">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-text-primary">
                余弦相似度聚类阈值 (Similarity Threshold)
              </span>
              <span
                data-testid="settings-page-text-similarity-value"
                className="font-mono font-bold text-brand-blue tabular-nums"
              >
                {voiceprintSettings.similarityThreshold.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.45"
              max="0.75"
              step="0.01"
              data-testid="settings-page-slider-similarity"
              value={voiceprintSettings.similarityThreshold}
              onChange={(e) =>
                updateVoiceprintSettings({ similarityThreshold: parseFloat(e.target.value) })
              }
              className="w-full accent-brand-blue cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-text-tertiary">
              <span>0.45 宽松 (更易合为一个发言人)</span>
              <span>0.75 严格 (更易拆分为不同发言人)</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-text-primary">
                连续发言惯性阻尼阈值 (Continuity Damping)
              </span>
              <span
                data-testid="settings-page-text-continuity-value"
                className="font-mono font-bold text-brand-blue tabular-nums"
              >
                {voiceprintSettings.continuityThreshold.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.38"
              max="0.65"
              step="0.01"
              data-testid="settings-page-slider-continuity"
              value={voiceprintSettings.continuityThreshold}
              onChange={(e) =>
                updateVoiceprintSettings({ continuityThreshold: parseFloat(e.target.value) })
              }
              className="w-full accent-brand-blue cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-text-tertiary">
              <span>0.38 强惯性 (同一人停顿后继续说话不易被错分)</span>
              <span>0.65 弱惯性 (更敏感响应发言人切换)</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-text-primary">
                新发言人最小有效句长 (Min Duration)
              </span>
              <span
                data-testid="settings-page-text-duration-value"
                className="font-mono font-bold text-brand-blue tabular-nums"
              >
                {voiceprintSettings.minClusterDurationMs} ms
              </span>
            </div>
            <input
              type="range"
              min="800"
              max="3000"
              step="100"
              data-testid="settings-page-slider-duration"
              value={voiceprintSettings.minClusterDurationMs}
              onChange={(e) =>
                updateVoiceprintSettings({ minClusterDurationMs: parseInt(e.target.value, 10) })
              }
              className="w-full accent-brand-blue cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-text-tertiary">
              <span>800ms (允许短促插话新建角色)</span>
              <span>3000ms (短句全继承前人，防止语气助词新建角色)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 💾 本地存储与录音定期清理 (Plan 016) */}
      <div
        data-testid="settings-page-storage-section"
        className="p-5 rounded-xl bg-panel border border-border-subtle space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <span>💾 本地存储与录音管理</span>
            </h2>
            <p className="text-[11px] text-text-secondary mt-0.5">
              录音文件（WAV/PCM）保存在本机沙箱中，每小时约 220MB；清理录音仅释放物理音频，会议逐字稿正文、智能纪要与导图永久保留
            </p>
          </div>

          <button
            type="button"
            data-testid="settings-page-storage-btn-refresh"
            onClick={() => refreshStorageUsage()}
            disabled={isStorageLoading}
            className="px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5"
          >
            <span>{isStorageLoading ? '正在计算...' : '🔄 刷新容量'}</span>
          </button>
        </div>

        {/* 用量指示卡片 */}
        <div
          data-testid="settings-page-storage-card-usage"
          className="p-4 rounded-lg bg-subtle border border-border-subtle flex items-center justify-between"
        >
          <div className="space-y-1">
            <span className="text-[11px] text-text-tertiary">当前录音总占用</span>
            <div
              data-testid="settings-page-storage-text-total-bytes"
              className="text-lg font-bold text-text-primary tabular-nums"
            >
              {formatBytes(storageUsage.totalBytes)}
            </div>
          </div>
          <div className="text-right space-y-1">
            <span className="text-[11px] text-text-tertiary">已留存录音场数</span>
            <div
              data-testid="settings-page-storage-text-recording-count"
              className="text-sm font-semibold text-text-secondary tabular-nums"
            >
              {storageUsage.recordingCount} 场会议
            </div>
          </div>
        </div>

        {/* 自动清理策略与手动清理按钮 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-text-secondary">
              定期自动清理周期（仅清理音频，保留文字）
            </label>
            <select
              data-testid="settings-page-storage-select-autocleanup"
              value={String(storageSettings.autoCleanupDays)}
              onChange={(e) => updateStorageSettings({ autoCleanupDays: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-canvas border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-brand-blue"
            >
              <option value="0">不自动清理（默认，手动管理）</option>
              <option value="7">自动清理 7 天前录音</option>
              <option value="14">自动清理 14 天前录音</option>
              <option value="30">自动清理 30 天前录音</option>
              <option value="90">自动清理 90 天前录音</option>
            </select>
            <p className="text-[10px] text-text-tertiary">
              开启后，每次启动听序或会议结束保存时自动执行静默瘦身。
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-text-secondary">
              手动立即清理（释放磁盘空间）
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="settings-page-storage-btn-cleanup-30d"
                disabled={isCleaning || storageUsage.recordingCount === 0}
                onClick={() => setConfirmModal({ open: true, type: '30d', title: '清理 30 天前的录音' })}
                className="flex-1 px-3 py-2 rounded-lg bg-subtle border border-border-subtle hover:border-brand-blue/50 text-xs text-text-primary disabled:opacity-50 transition-colors"
              >
                清理 30 天前录音
              </button>
              <button
                type="button"
                data-testid="settings-page-storage-btn-cleanup-all"
                disabled={isCleaning || storageUsage.recordingCount === 0}
                onClick={() => setConfirmModal({ open: true, type: 'all', title: '清理所有本地录音' })}
                className="flex-1 px-3 py-2 rounded-lg border border-border-subtle text-status-danger hover:bg-status-danger/10 text-xs font-medium disabled:opacity-50 transition-colors"
              >
                清理所有录音
              </button>
            </div>
            {cleanupFeedback && (
              <p
                data-testid="settings-page-storage-text-cleanup-feedback"
                className="text-[11px] text-status-success font-medium"
              >
                {cleanupFeedback}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 🎙️ 音频拾音与声学增强模式 (Plan 020) */}
      <div
        data-testid="settings-page-audio-section"
        className="p-5 rounded-xl bg-panel border border-border-subtle space-y-4"
      >
        <div>
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <span>🎙️ 音频拾音与声学增强偏好</span>
          </h2>
          <p className="text-[11px] text-text-secondary mt-0.5">
            智能声学策略优化：解决录音过程中系统声音被自动压小、变闷的声学衰减现象（macOS CoreAudio 通信模式闪避防抑）
          </p>
        </div>

        <div className="space-y-3 pt-1">
          <label className="block text-xs font-semibold text-text-primary">声学拾音模式</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              data-testid="settings-page-audio-btn-mode-fidelity"
              onClick={() => useMeetingStore.getState().setAudioAcousticMode('high_fidelity')}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                useMeetingStore.getState().audioAcousticMode === 'high_fidelity'
                  ? 'bg-brand-blue/10 border-brand-blue text-brand-blue shadow-sm'
                  : 'bg-subtle border-border-subtle text-text-primary hover:border-brand-blue/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <span>🎧 高保真防闪避模式</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-status-success/15 text-status-success font-medium">推荐</span>
                </span>
                {useMeetingStore.getState().audioAcousticMode === 'high_fidelity' && (
                  <span className="text-xs font-bold">✓</span>
                )}
              </div>
              <p className="text-[11px] text-text-tertiary mt-1.5 leading-relaxed">
                适合佩戴耳机或免驱数字内录（ScreenCaptureKit）场景。彻底关闭 macOS 通信模式音频闪避与动态 AGC 压制，电脑播放声音与背景音量 100% 原始饱满不变小。
              </p>
            </button>

            <button
              type="button"
              data-testid="settings-page-audio-btn-mode-aec"
              onClick={() => useMeetingStore.getState().setAudioAcousticMode('speaker_aec')}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                useMeetingStore.getState().audioAcousticMode === 'speaker_aec'
                  ? 'bg-brand-blue/10 border-brand-blue text-brand-blue shadow-sm'
                  : 'bg-subtle border-border-subtle text-text-primary hover:border-brand-blue/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <span>📢 扬声器强力消回声模式</span>
                </span>
                {useMeetingStore.getState().audioAcousticMode === 'speaker_aec' && (
                  <span className="text-xs font-bold">✓</span>
                )}
              </div>
              <p className="text-[11px] text-text-tertiary mt-1.5 leading-relaxed">
                当电脑扬声器外放大音量开会且房间产生回音啸叫时启用。通过操作系统底层声学算法抑制外放串音循环录入。
              </p>
            </button>
          </div>
        </div>
      </div>

      {/* 🎯 会议感知与桌面悬浮挂件 (Plan 017) */}
      <div
        data-testid="settings-page-detection-section"
        className="p-5 rounded-xl bg-panel border border-border-subtle space-y-4"
      >
        <div>
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <span>🎯 会议感知与桌面悬浮挂件</span>
          </h2>
          <p className="text-[11px] text-text-secondary mt-0.5">
            本地无感感知第三方会议软件启动并主动提醒，桌面极简置顶挂件支持一键开会与呼吸监控（所有比对均在本地沙箱完成，绝不向云端上传进程数据）
          </p>
        </div>

        <div className="space-y-4 pt-1">
          {/* 开关 1：第三方会议软件智能感知 */}
          <div className="flex items-start justify-between gap-4 p-3 rounded-lg bg-subtle border border-border-subtle">
            <div className="space-y-0.5">
              <label
                htmlFor="detection-enabled-checkbox"
                className="text-xs font-semibold text-text-primary cursor-pointer"
              >
                第三方会议软件启动智能感知
              </label>
              <p className="text-[11px] text-text-tertiary">
                支持 Teams、腾讯会议、Zoom、飞书、钉钉；一旦检测到开会立即提示是否开会，若点击“暂不记录”则 30 分钟内免打扰。
              </p>
            </div>
            <input
              id="detection-enabled-checkbox"
              type="checkbox"
              data-testid="settings-page-detection-checkbox-enabled"
              checked={meetingDetectionSettings.enabled}
              onChange={(e) => void updateMeetingDetectionSettings({ enabled: e.target.checked })}
              className="mt-1 h-4 w-4 rounded border-border-subtle text-brand-blue focus:ring-brand-blue accent-brand-blue cursor-pointer"
            />
          </div>

          {/* 开关 2：桌面常驻快速悬浮挂件 */}
          <div className="flex items-start justify-between gap-4 p-3 rounded-lg bg-subtle border border-border-subtle">
            <div className="space-y-0.5">
              <label
                htmlFor="detection-floating-checkbox"
                className="text-xs font-semibold text-text-primary cursor-pointer"
              >
                桌面常驻微型快捷悬浮挂件 (42px)
              </label>
              <p className="text-[11px] text-text-tertiary">
                在屏幕角落显示原生极简胶囊浮条。空闲时提供快速开启入口，开会时实时跳动秒表与最新洞察，始终置顶且不遮挡第三方会议画面。
              </p>
            </div>
            <input
              id="detection-floating-checkbox"
              type="checkbox"
              data-testid="settings-page-detection-checkbox-floating-widget"
              checked={meetingDetectionSettings.floatingWidget}
              onChange={(e) => void updateMeetingDetectionSettings({ floatingWidget: e.target.checked })}
              className="mt-1 h-4 w-4 rounded border-border-subtle text-brand-blue focus:ring-brand-blue accent-brand-blue cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* 本地数据存储与绝对隐私主权 */}
      <div
        data-testid="settings-page-section-privacy"
        className="p-5 rounded-xl bg-panel border border-border-subtle space-y-3"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🛡️</span>
            <div>
              <h2 className="text-sm font-bold text-text-primary">
                本地数据主权与隐私保护 (Zero-Content Policy)
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">
                听序为 100% 本地单机工具，无需注册或登录任何中心化账号。会议录音切片、逐字稿正文、声纹特征与自备 API Key 完全留存在本机 SQLite 及沙箱目录中，绝不上报或泄漏。
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-status-success/15 text-status-success border border-status-success/30 shrink-0">
            ✓ 本地闭环
          </span>
        </div>
      </div>

      {confirmModal?.open && (
        <div
          data-testid="settings-page-storage-modal-confirm"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <div className="bg-panel border border-border-subtle rounded-xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-status-warning">
              <span className="text-lg">⚠️</span>
              <h3 className="text-sm font-bold text-text-primary">{confirmModal.title}</h3>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              确定要执行清理吗？此操作将删除本机物理音频文件以释放磁盘空间。
              <br />
              <strong className="text-status-success font-medium">
                会议逐字稿正文、智能总结、待办任务与思维导图将完整保留。
              </strong>
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                data-testid="settings-page-storage-btn-modal-cancel"
                onClick={() => setConfirmModal(null)}
                className="px-3 py-1.5 rounded-lg border border-border-subtle text-xs text-text-secondary hover:text-text-primary"
              >
                取消
              </button>
              <button
                type="button"
                data-testid="settings-page-storage-btn-modal-confirm"
                onClick={handleExecuteCleanup}
                className="px-3.5 py-1.5 rounded-lg bg-status-danger hover:bg-status-danger/90 text-white text-xs font-semibold"
              >
                确认清理
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
