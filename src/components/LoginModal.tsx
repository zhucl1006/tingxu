import React, { useState, useEffect } from 'react';
import { useMeetingStore } from '../store/useMeetingStore';

export const LoginModal: React.FC = () => {
  const { isLoginModalOpen, setIsLoginModalOpen, loginUser } = useMeetingStore();
  const [phone, setPhone] = useState('13800138000');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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
    setLoading(true);

    try {
      // 优先调用本地控制面 Server 接口
      const res = await fetch('http://localhost:3200/v1/auth/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        if (data.debugCode) {
          setCode(data.debugCode); // 开发便利：自动填入下发的 debugCode
        }
      } else {
        // 若控制面未开启，前端本地模拟下发
        setCode('123456');
      }

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
      setErrorMsg('请填写手机号和验证码');
      return;
    }
    setErrorMsg('');
    setLoading(true);

    try {
      const res = await fetch('http://localhost:3200/v1/auth/sms/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      }).catch(() => null);

      if (res && res.ok) {
        const json = await res.json();
        loginUser({
          userId: json.data?.user?.userId || `usr_${phone.slice(-4)}`,
          phone,
          token: json.data?.token || 'mock_jwt_token',
          role: json.data?.user?.role || 'USER',
        });
      } else {
        // 离线/开发模式一键登录
        loginUser({
          userId: `usr_${phone.slice(-4)}`,
          phone,
          token: 'mock_jwt_token_local',
          role: 'USER',
        });
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = () => {
    loginUser({
      userId: 'usr_8000',
      phone: '13800138000',
      token: 'jwt_mock_quick_token',
      role: 'USER',
    });
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
        <button
          type="button"
          data-testid="login-modal-btn-close"
          onClick={() => setIsLoginModalOpen(false)}
          className="absolute right-4 top-4 text-text-tertiary hover:text-text-primary text-xl leading-none"
        >
          ×
        </button>

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
            className="mb-4 p-2.5 rounded bg-status-danger/10 border border-status-danger/30 text-status-danger text-xs"
          >
            {errorMsg}
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

        <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between text-xs">
          <span className="text-text-tertiary">测试快速通道：</span>
          <button
            type="button"
            data-testid="login-modal-btn-quick-login"
            onClick={handleQuickLogin}
            className="text-brand-blue hover:underline font-medium"
          >
            一键体验免密登录 →
          </button>
        </div>
      </div>
    </div>
  );
};
