import React, { useState } from 'react';
import { useMeetingStore } from '../../store/useMeetingStore';
import { getTingxuClient } from '../../api/tingxuClient';

export const BillingView: React.FC = () => {
  const { quotaMinutes, setQuotaMinutes, refreshUserBalance, currentUser } = useMeetingStore();
  const [selectedPlan, setSelectedPlan] = useState<'plan_starter' | 'plan_pro_monthly' | 'plan_pro_annual'>('plan_pro_monthly');
  const [orderModal, setOrderModal] = useState<{
    orderNo: string;
    planName: string;
    priceYuan: number;
    codeUrl: string;
  } | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [paySuccessMsg, setPaySuccessMsg] = useState('');

  const plans = [
    {
      id: 'plan_starter' as const,
      name: '10 小时会议时长包',
      hours: 10,
      price: 9.9,
      desc: '轻量尝鲜，全量包含实时双通道 ASR 与 AI 实时洞察',
    },
    {
      id: 'plan_pro_monthly' as const,
      name: '30 小时会议时长包',
      hours: 30,
      price: 39.0,
      desc: '职场高频推荐，AI 全包无单次问答扣点，双轨录音高保真保障',
      recommend: true,
    },
    {
      id: 'plan_pro_annual' as const,
      name: '100 小时大额时长包',
      hours: 100,
      price: 99.0,
      desc: '大额深度使用，纯按会议实际消耗秒数结算，长期有效',
    },
  ];

  const handleCreateOrder = async (planId: typeof selectedPlan) => {
    try {
      const order = await getTingxuClient().billing.createOrder(
        planId,
        currentUser?.userId || 'usr_client_local'
      );
      setOrderModal({
        orderNo: order.orderNo,
        planName: order.planName,
        priceYuan: order.priceYuan,
        codeUrl: order.codeUrl || '',
      });
    } catch (e) {
      alert(`创建订单异常: ${(e as Error).message}`);
    }
  };

  const handleSimulatePaySuccess = async () => {
    if (!orderModal) return;
    setIsPaying(true);

    try {
      // 触发控制面异步回调接口
      await getTingxuClient().billing.notifyPayment(orderModal.orderNo, orderModal.priceYuan);

      const targetPlan = plans.find((p) => p.name === orderModal.planName);
      const addedMinutes = (targetPlan?.hours || 30) * 60;
      setQuotaMinutes(quotaMinutes + addedMinutes);
      // 向控制面同步真实最新账本余额
      await refreshUserBalance();

      setPaySuccessMsg(`🎉 微信支付成功！已成功充值 ${targetPlan?.hours} 小时会议时长。`);
      setOrderModal(null);
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div data-testid="billing-page-container" className="flex-1 h-screen overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary tracking-tight">会议时长账户与用量</h1>
        <p className="text-xs text-text-secondary mt-1">
          团队商业核心决策：纯按会议时长计费，无版本等级差异，双通道 ASR 与 AI 智能洞察全量纳入时长包，无额外扣点
        </p>
      </div>

      {paySuccessMsg && (
        <div
          data-testid="billing-page-alert-success"
          className="p-3 rounded-lg bg-status-success-bg border border-status-success-border text-status-success text-xs font-medium"
        >
          {paySuccessMsg}
        </div>
      )}

      {/* 当前用量看板 */}
      <div className="p-5 rounded-xl bg-panel border border-border-subtle space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-xs text-text-secondary">当前可用总时长余额</div>
            <div className="text-2xl font-bold text-text-primary font-mono tabular-nums">
              {quotaMinutes} <span className="text-xs font-normal text-text-secondary">分钟 ({Math.round((quotaMinutes / 60) * 10) / 10} 小时)</span>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-brand-blue/15 text-brand-blue border border-brand-blue/30">
            ✓ 权益生效中
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border-subtle text-xs">
          <div>
            <div className="text-text-tertiary">进行中会议预占</div>
            <div className="text-text-primary font-mono font-semibold mt-0.5">0 分钟</div>
          </div>
          <div>
            <div className="text-text-tertiary">已累计使用会议</div>
            <div className="text-text-primary font-mono font-semibold mt-0.5">3 场</div>
          </div>
          <div>
            <div className="text-text-tertiary">大模型点数限制</div>
            <div className="text-status-success font-semibold mt-0.5">无限量全包</div>
          </div>
        </div>
      </div>

      {/* 套餐选购卡片列表 */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-text-primary">选购时长包</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((p) => {
            const isSelected = selectedPlan === p.id;
            return (
              <div
                key={p.id}
                data-testid={`billing-page-card-plan-${p.id}`}
                onClick={() => setSelectedPlan(p.id)}
                className={`p-5 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                  isSelected
                    ? 'bg-panel border-brand-blue ring-1 ring-brand-blue shadow-sm'
                    : 'bg-subtle border-border-subtle hover:border-brand-blue/40'
                }`}
              >
                {p.recommend && (
                  <span className="absolute -top-2.5 right-4 px-2 py-0.5 rounded text-[10px] font-bold bg-brand-blue text-white shadow-xs">
                    推荐
                  </span>
                )}

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-text-primary">{p.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black font-mono text-brand-blue">¥{p.price}</span>
                    <span className="text-xs text-text-tertiary font-mono">/ {p.hours}小时</span>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">{p.desc}</p>
                </div>

                <button
                  type="button"
                  data-testid={`billing-page-btn-buy-${p.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCreateOrder(p.id);
                  }}
                  className={`w-full mt-5 py-2 rounded-lg text-xs font-semibold transition-all shadow-xs ${
                    isSelected
                      ? 'bg-brand-blue hover:bg-brand-blue-hover text-white'
                      : 'bg-panel border border-border-subtle hover:bg-hover text-text-primary'
                  }`}
                >
                  微信扫码购买
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 支付二维码弹窗 */}
      {orderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl bg-canvas border border-border-subtle shadow-2xl p-6 relative text-center space-y-4">
            <button
              type="button"
              onClick={() => setOrderModal(null)}
              className="absolute right-4 top-4 text-text-tertiary hover:text-text-primary text-xl"
            >
              ×
            </button>

            <h3 className="text-base font-bold text-text-primary">微信扫码支付</h3>
            <p className="text-xs text-text-secondary font-mono">订单号: {orderModal.orderNo}</p>

            <div className="w-48 h-48 mx-auto p-3 bg-white rounded-xl shadow-inner flex flex-col items-center justify-center border border-slate-200">
              <div className="w-36 h-36 bg-slate-900 rounded-lg flex items-center justify-center text-white text-xs font-mono p-2 text-center">
                [微信 Native 二维码]
              </div>
              <span className="text-[10px] text-slate-500 mt-2 font-mono">实付: ¥{orderModal.priceYuan.toFixed(2)}</span>
            </div>

            <p className="text-[11px] text-text-tertiary">
              请在手机微信中“扫一扫”完成支付，系统将在 1 秒内幂等入账
            </p>

            <button
              type="button"
              data-testid="billing-page-btn-simulate-pay"
              onClick={handleSimulatePaySuccess}
              disabled={isPaying}
              className="w-full py-2.5 rounded-lg bg-status-success hover:opacity-90 text-white text-xs font-semibold shadow-xs"
            >
              {isPaying ? '正在核销入账...' : '✓ 模拟支付成功 (触发微信异步回调)'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
