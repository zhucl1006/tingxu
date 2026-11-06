import React from 'react';
import { useMeetingStore } from '../../store/useMeetingStore';

export const BillingView: React.FC = () => {
  const { historyMeetings, setActiveSummaryMeeting } = useMeetingStore();

  const allMeetings = historyMeetings || [];
  const costMeetings = allMeetings.filter(
    (m) => m.aiCost && typeof m.aiCost.totalCostYuan === 'number'
  );
  const totalAiCost = costMeetings.reduce((acc, m) => acc + (m.aiCost?.totalCostYuan || 0), 0);
  const avgCost = costMeetings.length > 0 ? (totalAiCost / costMeetings.length).toFixed(2) : '0.00';
  const totalTokens = costMeetings.reduce((acc, m) => acc + (m.aiCost?.totalTokens || 0), 0);
  const totalAudioSeconds = costMeetings.reduce((acc, m) => acc + (m.aiCost?.audioSeconds || 0), 0);

  // 统计全部会议总时长
  const totalDurationSeconds = allMeetings.reduce(
    (acc, m) => acc + (m.durationSeconds || 0),
    0
  );
  const totalHours = Math.floor(totalDurationSeconds / 3600);
  const totalMins = Math.floor((totalDurationSeconds % 3600) / 60);

  return (
    <div
      data-testid="billing-page-container"
      className="flex-1 h-screen overflow-y-auto p-6 space-y-6"
    >
      {/* 头部标题与说明 */}
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-bold text-text-primary tracking-tight">
            会议时长与 AI 用量中心
          </h1>
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-brand-blue/10 text-brand-blue border border-brand-blue/20">
            100% 本地单机统计
          </span>
        </div>
        <p className="text-xs text-text-secondary mt-1">
          单机开源模式：所有会议音频与文本 100% 留存在本地设备，AI 模型直连用户自备 API Key（BYOK），零中转抽成、费用透明可溯
        </p>
      </div>

      {/* 本地会议用量概览看板 */}
      <div className="p-5 rounded-xl bg-panel border border-border-subtle space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-xs text-text-secondary">累计记录会议总时长</div>
            <div className="text-2xl font-bold text-text-primary font-mono tabular-nums">
              {totalHours > 0 ? `${totalHours} 小时 ` : ''}{totalMins} <span className="text-xs font-normal text-text-secondary">分钟 ({Math.round((totalDurationSeconds / 3600) * 10) / 10} 小时)</span>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-status-success/15 text-status-success border border-status-success/30">
            ✓ 本地免登录模式
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border-subtle text-xs">
          <div>
            <div className="text-text-tertiary">本地已归档会议</div>
            <div className="text-text-primary font-mono font-semibold mt-0.5">
              {allMeetings.length} 场
            </div>
          </div>
          <div>
            <div className="text-text-tertiary">已统计 AI 消耗场次</div>
            <div className="text-text-primary font-mono font-semibold mt-0.5">
              {costMeetings.length} 场
            </div>
          </div>
          <div>
            <div className="text-text-tertiary">架构模式</div>
            <div className="text-brand-blue font-semibold mt-0.5">
              单机自备密钥 (BYOK)
            </div>
          </div>
        </div>
      </div>

      {/* 会议 AI 实际消耗明细与成本透明度看板 */}
      <div
        data-testid="billing-page-section-meeting-costs"
        className="p-5 rounded-xl bg-panel border border-border-subtle space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-text-primary">
                单场会议 AI 算力与 Token 透视
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-brand-blue/10 text-brand-blue border border-brand-blue/20">
                成本透明公开
              </span>
            </div>
            <p className="text-xs text-text-secondary">
              真实呈现每场会议本地调用语音识别（ASR）与大模型（DeepSeek / 百炼）产生的估算 Token 与 API 成本。
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-text-tertiary">场均 AI 算力成本</div>
            <div
              data-testid="billing-page-text-average-cost"
              className="text-xl font-bold text-brand-blue font-mono tabular-nums"
            >
              ¥{avgCost} <span className="text-xs font-normal text-text-secondary">/ 场</span>
            </div>
          </div>
        </div>

        {/* 统计指标小卡片 */}
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border-subtle text-xs">
          <div>
            <div className="text-text-tertiary">已统计场次</div>
            <div className="text-text-primary font-mono tabular-nums font-semibold mt-0.5">
              {costMeetings.length} 场
            </div>
          </div>
          <div>
            <div className="text-text-tertiary">累计 AI 估算花费</div>
            <div className="text-text-primary font-mono tabular-nums font-semibold mt-0.5">
              ¥{totalAiCost.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-text-tertiary">累计 Token / 语音</div>
            <div className="text-text-primary font-mono tabular-nums font-semibold mt-0.5">
              {Math.round(totalTokens / 1000)}k tok / {Math.round(totalAudioSeconds / 60)} 分钟
            </div>
          </div>
        </div>

        {/* 明细列表 */}
        <div data-testid="billing-page-table-meeting-costs" className="space-y-2 pt-2">
          {costMeetings.length === 0 ? (
            <div className="text-xs text-text-tertiary text-center py-6">
              暂无已结算 AI 成本的会议记录
            </div>
          ) : (
            costMeetings.map((m) => {
              const minutes = Math.ceil((m.durationSeconds || 0) / 60);
              const cost = m.aiCost?.totalCostYuan?.toFixed(2) || '0.00';
              const tokens = m.aiCost?.totalTokens
                ? `${Math.round(m.aiCost.totalTokens / 1000)}k`
                : '-';
              return (
                <div
                  key={m.id}
                  data-testid={`billing-page-row-meeting-cost-${m.id}`}
                  onClick={() => setActiveSummaryMeeting(m)}
                  className="flex items-center justify-between p-3 rounded-lg bg-subtle hover:bg-hover border border-border-subtle transition-colors cursor-pointer group"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-text-primary group-hover:text-brand-blue transition-colors">
                        {m.title}
                      </span>
                      <span className="text-[10px] text-text-tertiary font-mono tabular-nums">
                        {m.date}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-tertiary flex items-center gap-3">
                      <span>
                        录音时长: <span className="font-mono tabular-nums text-text-secondary">{minutes}分钟</span>
                      </span>
                      <span>
                        Token消耗: <span className="font-mono tabular-nums text-text-secondary">{tokens}</span>
                      </span>
                      {m.aiCost?.breakdown && (
                        <span>
                          ASR ¥{m.aiCost.breakdown.asrCostYuan.toFixed(2)} + AI ¥
                          {(
                            m.aiCost.breakdown.insightsCostYuan +
                            m.aiCost.breakdown.summaryCostYuan +
                            m.aiCost.breakdown.chatCostYuan
                          ).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xs font-bold text-text-primary font-mono tabular-nums">
                        ¥{cost}
                      </div>
                      <div className="text-[10px] text-brand-blue font-medium">BYOK 直连结算</div>
                    </div>
                    <span className="text-text-tertiary text-xs group-hover:translate-x-0.5 transition-transform">
                      →
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 单机说明卡片 */}
      <div className="p-4 rounded-xl bg-panel border border-border-subtle space-y-2 text-xs">
        <div className="font-semibold text-text-primary flex items-center gap-1.5">
          <span>💡</span>
          <span>自备密钥 (BYOK) 计费机制说明</span>
        </div>
        <p className="text-text-secondary leading-relaxed">
          单机版听序不设立任何中心化计费账本。语音识别（DashScope）与大模型（DeepSeek / 阿里百炼 / 本地 Ollama 等）的 API 费用直接在您的云服务商后台以账单或免费额度结算。上方显示的费用为按照公开 API 定价规则换算的参考数据，帮助您直观掌握个人办公的 AI 算力开销。
        </p>
      </div>
    </div>
  );
};
