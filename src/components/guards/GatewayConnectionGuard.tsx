import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Server, ShieldAlert } from 'lucide-react';
import { useMeetingStore } from '../../store/useMeetingStore';

interface GatewayConnectionGuardProps {
  children: ReactNode;
}

export function GatewayConnectionGuard({ children }: GatewayConnectionGuardProps) {
  const [isChecking, setIsChecking] = useState(true);
  const [isGatewayHealthy, setIsGatewayHealthy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const gatewayUrl = useMeetingStore((s) => s.gatewayUrl) || 'http://localhost:3201';

  const checkHealth = useCallback(async () => {
    setIsChecking(true);
    setLastError(null);
    try {
      const res = await fetch(`${gatewayUrl}/gateway/v1/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        setIsGatewayHealthy(true);
      } else {
        setIsGatewayHealthy(false);
        setLastError(`网关响应异常 HTTP ${res.status}`);
      }
    } catch (err) {
      setIsGatewayHealthy(false);
      setLastError((err as Error).message || '连接失败，网络不可达');
    } finally {
      setIsChecking(false);
    }
  }, [gatewayUrl]);

  useEffect(() => {
    checkHealth();
    // 每 15 秒轮询心跳
    const timer = setInterval(checkHealth, 15000);
    return () => clearInterval(timer);
  }, [checkHealth]);

  if (isGatewayHealthy) {
    return <>{children}</>;
  }

  return (
    <div
      data-testid="gateway-guard-modal-blocked"
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-md text-slate-100"
    >
      <div
        data-testid="gateway-guard-card-warning"
        className="max-w-md w-full bg-slate-900 border border-amber-500/40 rounded-2xl p-7 shadow-2xl shadow-amber-500/10 flex flex-col items-center text-center space-y-5"
      >
        <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <ShieldAlert className="w-9 h-9" />
        </div>

        <div className="space-y-2">
          <h2
            data-testid="gateway-guard-text-warning"
            className="text-lg font-bold text-slate-100 tracking-tight"
          >
            无法连接至听序 AI 网关 (AI Gateway)
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            根据听序安全与数据真实性铁律（Fail-Closed 原则），系统严禁在无网关环境下生成离线假数据。请确保自建
            AI Gateway 服务已启动且网络通畅。
          </p>
        </div>

        <div className="w-full bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-left space-y-1.5 font-mono text-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-slate-500" /> 网关监测地址
            </span>
            <span className="text-blue-400">{gatewayUrl}</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500/70" /> 探活状态
            </span>
            <span className="text-rose-400">{lastError || '未就绪'}</span>
          </div>
        </div>

        <div className="w-full flex gap-3 pt-2">
          <button
            data-testid="gateway-guard-btn-retry"
            onClick={checkHealth}
            disabled={isChecking}
            className="flex-1 py-2.5 px-4 rounded-xl font-medium text-xs bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
            {isChecking ? '正在重试连接...' : '重试连接网关'}
          </button>
        </div>
      </div>
    </div>
  );
}
