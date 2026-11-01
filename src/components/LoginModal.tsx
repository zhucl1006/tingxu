import React, { useState, useEffect } from 'react';
import { useMeetingStore } from '../store/useMeetingStore';

export const LoginModal: React.FC = () => {
  const { isLoginModalOpen, setIsLoginModalOpen, loginUser, currentUser } = useMeetingStore();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  if (!isLoginModalOpen) return null;

  const handleSendCode = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      setErrorMsg('请输入正确的 11 位手机号码');
      return;
    }
    setErrorMsg('');
    setInfoMsg('');
    setLoading(true);

    try {
      // 真实调用本地控制面 Server 短信接口（连通阿里云短信网关）
      const res = await fetch('http://localhost:3200/v1/auth/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      }).catch((e) => {
        throw new Error(`无法连接控制面服务端 (http://localhost:3200): ${e.message}`);
      });

      const data = await res.json();
      if (!res.ok || data.code !== 0) {
        throw new Error(data.message || '短信验证码下发失败，请检查短信服务状态');
      }

      setInfoMsg(data.message || '短信验证码已下发至您的手机，请查收');
      setCountdown(60);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !code) {
      setErrorMsg('请填写手机号和短信验证码');
      return;
    }
    setErrorMsg('');
    setInfoMsg('');
    setLoading(true);

    try {
      const res = await fetch('http://localhost:3200/v1/auth/sms/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      }).catch((e) => {
        throw new Error(`无法连接控制面服务端: ${e.message}`);
      });

      const json = await res.json();
      if (!res.ok || json.code !== 0 || !json.data?.token) {
        throw new Error(json.message || '验证码核验失败或已失效，请重新获取');
      }

      // 仅接受真实签发的服务端凭据与用户身份
      loginUser({
        userId: json.data.user.userId,
        phone: json.data.user.phone,
        token: json.data.token,
        role: json.data.user.role || 'USER',
      });
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="login-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div
        data-testid="login-modal-container"
        className="w-full max-w-sm rounded-xl bg-canvas border border-border-subtle shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-150"
      >
        {/* 仅在已登录状态（切换账号或重新鉴权时）允许关闭；首次未登录强制要求完成认证 */}
        {currentUser && (
          <button
            type="button"
            data-testid="login-modal-btn-close"
            onClick={() => setIsLoginModalOpen(false)}
            className="absolute right-4 top-4 text-text-tertiary hover:text-text-primary text-xl leading-none"
          >
            ×
          </button>
        )}

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-brand-blue/15 text-brand-blue flex items-center justify-center font-bold text-lg">
            听
          </div>
          <div>
            <h2 className="text-base font-bold text-text-primary">登录听序 Tingxu</h2>
            <p className="text-xs text-text-secondary">开启极简无感 AI 会议记录</p>
          </div>
        </div>

        {errorMsg && (
          <div
            data-testid="login-modal-alert-error"
            className="mb-4 p-2.5 rounded bg-status-danger/10 border border-status-danger/30 text-status-danger text-xs leading-relaxed"
          >
            <div>{errorMsg}</div>
            {errorMsg.includes('后台') && (
              <a
                href="http://localhost:3200"
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-block text-brand-blue hover:underline font-medium"
              >
                前往控制面运营后台配置凭据 →
              </a>
            )}
          </div>
        )}

        {infoMsg && (
          <div
            data-testid="login-modal-alert-info"
            className="mb-4 p-2.5 rounded bg-status-success-bg border border-status-success-border text-status-success text-xs leading-relaxed"
          >
            {infoMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              中国大陆手机号
            </label>
            <input
              type="tel"
              data-testid="login-modal-input-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="请输入11位手机号"
              className="w-full px-3 py-2 rounded-lg bg-panel border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-brand-blue tabular-nums"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              短信验证码
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                data-testid="login-modal-input-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6位数字验证码"
                className="flex-1 px-3 py-2 rounded-lg bg-panel border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-brand-blue tabular-nums"
                required
              />
              <button
                type="button"
                data-testid="login-modal-btn-send-code"
                onClick={handleSendCode}
                disabled={countdown > 0 || loading}
                className="px-3 py-2 rounded-lg bg-subtle border border-border-subtle text-xs font-medium text-text-primary hover:bg-hover disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {countdown > 0 ? `${countdown}s 后重发` : '获取验证码'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            data-testid="login-modal-btn-submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 rounded-lg bg-brand-blue hover:bg-brand-blue-hover text-white text-sm font-semibold transition-all shadow-sm"
          >
            {loading ? '正在验证...' : '登 录 / 注 册'}
          </button>
        </form>
      </div>
    </div>
  );
};
