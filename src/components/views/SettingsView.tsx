import React, { useState } from 'react';
import { useMeetingStore } from '../../store/useMeetingStore';

export const SettingsView: React.FC = () => {
  const { currentUser, setIsLoginModalOpen, logoutUser } = useMeetingStore();
  const [gatewayUrl, setGatewayUrl] = useState('http://localhost:3201');
  const [gatewayStatus, setGatewayStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTestGateway = async () => {
    setTesting(true);
    setGatewayStatus(null);
    try {
      const res = await fetch(`${gatewayUrl}/gateway/v1/health`);
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
              value={gatewayUrl}
              onChange={(e) => setGatewayUrl(e.target.value)}
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
    </div>
  );
};
