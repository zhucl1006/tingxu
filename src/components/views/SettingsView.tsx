import React, { useState } from 'react';
import { useMeetingStore } from '../../store/useMeetingStore';
import { streamingAsrUrl } from '../../audio/realStreamingAsrClient';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const SettingsView: React.FC = () => {
  const {
    currentUser,
    setIsLoginModalOpen,
    logoutUser,
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
    gatewayUrl,
    setGatewayUrl,
    storageSettings,
    storageUsage,
    isStorageLoading,
    refreshStorageUsage,
    updateStorageSettings,
    cleanupRecordings,
  } = useMeetingStore();
  const [gatewayDraft, setGatewayDraft] = useState(gatewayUrl);
  const [gatewayStatus, setGatewayStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingProfileName, setEditingProfileName] = useState('');
  const [exportedHint, setExportedHint] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; type: 'all' | '30d'; title: string } | null>(null);
  const [cleanupFeedback, setCleanupFeedback] = useState<string | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);

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

  const handleTestGateway = async () => {
    setTesting(true);
    setGatewayStatus(null);
    try {
      streamingAsrUrl(gatewayDraft);
      setGatewayUrl(gatewayDraft.trim());
      const res = await fetch(`${gatewayDraft.trim()}/gateway/v1/health`);
      if (res.ok) {
        setGatewayStatus('✓ AI Gateway 智能网关连接正常，全双工转写与推理通道就绪');
      } else {
        setGatewayStatus(`× 连接失败: HTTP ${res.status}`);
      }
    } catch (err) {
      setGatewayStatus(`× 无法连接到网关: ${(err as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div data-testid="settings-page-container" className="flex-1 h-screen overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary tracking-tight">系统设置</h1>
        <p className="text-xs text-text-secondary mt-1">
          管理底层媒体采集、自建 AI Gateway 路由与隐私数据配置
        </p>
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

      {/* AI Gateway 网络中继设置 */}
      <div className="p-5 rounded-xl bg-panel border border-border-subtle space-y-4">
        <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
          <span>⚡ 自建 AI Gateway 智能中继与容灾</span>
        </h2>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-text-secondary">
            AI Gateway 终端地址 (Base URL)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              data-testid="settings-input-gateway-url"
              value={gatewayDraft}
              onChange={(e) => setGatewayDraft(e.target.value)}
              onBlur={() => {
                try { streamingAsrUrl(gatewayDraft); setGatewayUrl(gatewayDraft.trim()); }
                catch { setGatewayStatus('× 网关地址需使用有效的 HTTP 或 HTTPS 地址'); }
              }}
              className="flex-1 px-3 py-2 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary font-mono focus:outline-none focus:border-brand-blue"
            />
            <button
              type="button"
              data-testid="settings-btn-test-gateway"
              onClick={handleTestGateway}
              disabled={testing}
              className="px-4 py-2 rounded-lg bg-subtle border border-border-subtle text-xs font-semibold text-text-primary hover:bg-hover transition-colors"
            >
              {testing ? '正在测试...' : '测试健康连接'}
            </button>
          </div>

          {gatewayStatus && (
            <div
              data-testid="settings-text-gateway-status"
              className={`text-xs p-2 rounded ${
                gatewayStatus.startsWith('✓')
                  ? 'bg-status-success-bg text-status-success'
                  : 'bg-status-danger/10 text-status-danger'
              }`}
            >
              {gatewayStatus}
            </div>
          )}
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

      {/* 账号与隐私数据主权 */}
      <div className="p-5 rounded-xl bg-panel border border-border-subtle space-y-4">
        <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
          <span>🔒 隐私主权与账号信息</span>
        </h2>

        <div className="flex items-center justify-between text-xs">
          <div>
            <div className="font-semibold text-text-primary">
              {currentUser ? `已绑定手机：${currentUser.phone}` : '当前未登录账号'}
            </div>
            <div className="text-text-tertiary mt-0.5">
              数据完全保存在本机 SQLite 沙箱目录，云端绝不持久化任何会议正文
            </div>
          </div>

          {currentUser ? (
            <button
              type="button"
              data-testid="settings-btn-logout"
              onClick={logoutUser}
              className="px-3 py-1.5 rounded-lg border border-border-subtle text-status-danger hover:bg-status-danger/10 text-xs font-medium"
            >
              退出当前账号
            </button>
          ) : (
            <button
              type="button"
              data-testid="settings-btn-login"
              onClick={() => setIsLoginModalOpen(true)}
              className="px-4 py-1.5 rounded-lg bg-brand-blue hover:bg-brand-blue-hover text-white text-xs font-semibold"
            >
              立即登录
            </button>
          )}
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
