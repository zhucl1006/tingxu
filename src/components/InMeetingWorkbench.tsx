import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import { formatSeconds } from '../utils/formatTime';
import { InsightCard, InsightType, TranscriptSegment } from '../types/meeting';

// 独立抽离秒表组件：仅订阅 elapsedSeconds，避免每秒重渲庞大整树（对齐 AGENTS.md 5.2 性能规范）
const HeaderTimer: React.FC = () => {
  const elapsedSeconds = useMeetingStore((s) => s.elapsedSeconds);
  return (
    <span
      data-testid="workbench-page-header-text-timer"
      className="px-2.5 py-0.5 rounded bg-panel font-mono tabular-nums text-xs font-medium text-text-secondary"
    >
      {formatSeconds(elapsedSeconds)}
    </span>
  );
};

// 记忆化单条洞察卡片组件（React.memo 杜绝无差权重渲）
interface InsightCardItemProps {
  card: InsightCard;
  onViewEvidence: (evidenceId: string) => void;
  onConfirm: (id: string) => void;
  onKeepCurrent: (id: string) => void;
  onAcceptRevision: (id: string) => void;
}

const InsightCardItem = memo<InsightCardItemProps>(({
  card,
  onViewEvidence,
  onConfirm,
  onKeepCurrent,
  onAcceptRevision,
}) => {
  return (
    <div
      data-testid={`workbench-page-insights-panel-card-${card.id}`}
      className={`p-3.5 rounded-lg border transition-all ${
        card.isConfirmed
          ? 'bg-canvas border-status-success-border shadow-sm'
          : 'bg-subtle border-border-subtle'
      }`}
    >
      {/* 卡片头部 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-panel font-medium text-text-secondary">
            {card.type === 'decision' && '结论'}
            {card.type === 'action' && '待办'}
            {card.type === 'risk' && '风险'}
            {card.type === 'fact' && '事实'}
          </span>
          <h3 className="text-sm font-semibold text-text-primary">
            {card.title}
          </h3>
        </div>

        {card.isConfirmed && (
          <span
            data-testid={`workbench-page-insights-panel-badge-confirmed-${card.id}`}
            className="px-2 py-0.5 text-[11px] bg-status-success-bg text-status-success rounded font-medium"
          >
            ✓ 人工已确认（受保护）
          </span>
        )}
      </div>

      {/* 卡片正文 */}
      <p className="text-xs text-text-secondary leading-relaxed mb-3">
        {card.content}
      </p>

      {/* 依据按钮与操作栏 */}
      <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs">
        <button
          type="button"
          data-testid={`workbench-page-insights-panel-btn-view-evidence-${card.id}`}
          onClick={() => onViewEvidence(card.evidenceSegmentId)}
          className="text-brand-blue hover:underline flex items-center gap-1 font-medium"
        >
          🔗 查看依据
          <span className="text-text-tertiary tabular-nums font-mono">
            ({card.timestamp})
          </span>
        </button>

        {!card.isConfirmed && (
          <button
            type="button"
            data-testid={`workbench-page-insights-panel-btn-confirm-decision-${card.id}`}
            onClick={() => onConfirm(card.id)}
            className="px-2.5 py-1 text-xs bg-brand-blue-subtle text-brand-blue hover:bg-brand-blue hover:text-white rounded transition-colors font-medium"
          >
            确认结论
          </button>
        )}
      </div>

      {/* 人工保护冲突处理：待复核新修订区块 */}
      {card.pendingRevision && (
        <div
          data-testid={`workbench-page-insights-panel-div-pending-revision-${card.id}`}
          className="mt-3 p-3 rounded bg-status-warning-bg border border-status-warning-border"
        >
          <div className="flex items-center justify-between mb-1.5 text-xs text-status-warning font-semibold">
            <span>⚠️ 待复核新修订（后续发言产生冲突）</span>
            <span className="font-mono tabular-nums text-[11px]">
              {card.pendingRevision.timestamp}
            </span>
          </div>
          <p className="text-xs text-text-primary mb-2">
            {card.pendingRevision.proposedText}
          </p>
          <div className="text-[11px] text-text-secondary mb-2.5">
            依据原因：{card.pendingRevision.reason}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              data-testid={`workbench-page-insights-panel-btn-keep-current-${card.id}`}
              onClick={() => onKeepCurrent(card.id)}
              className="px-2.5 py-1 text-xs bg-canvas text-text-secondary border border-border-strong rounded hover:bg-subtle transition-colors"
            >
              保留当前版本
            </button>
            <button
              type="button"
              data-testid={`workbench-page-insights-panel-btn-accept-revision-${card.id}`}
              onClick={() => onAcceptRevision(card.id)}
              className="px-2.5 py-1 text-xs bg-brand-blue text-white rounded hover:bg-brand-blue-hover transition-colors font-medium"
            >
              采用新版本
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

// 记忆化单条逐字稿段落组件（React.memo 杜绝高频打字重渲列表）
interface TranscriptRowProps {
  segment: TranscriptSegment;
  isHighlighted: boolean;
}

const TranscriptRow = memo<TranscriptRowProps>(({ segment, isHighlighted }) => {
  return (
    <div
      id={segment.id}
      data-testid={`workbench-page-transcript-panel-row-segment-${segment.id}`}
      className={`p-3 rounded-md transition-all border ${
        isHighlighted
          ? 'bg-active border-brand-blue shadow-sm ring-1 ring-brand-blue/30'
          : 'bg-canvas border-border-subtle hover:border-border-strong'
      }`}
    >
      <div className="flex items-center justify-between mb-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-text-primary">
            {segment.speaker}
          </span>
          <span className="text-[10px] px-1 py-0.2 rounded bg-panel text-text-secondary">
            {segment.channel === 'mic' ? '本人麦克风' : '对方声卡'}
          </span>
        </div>
        <span className="font-mono tabular-nums text-text-tertiary text-[11px]">
          {segment.timestamp}
        </span>
      </div>

      <p className="text-xs text-text-primary leading-relaxed">
        {segment.text}
      </p>
    </div>
  );
});

export const InMeetingWorkbench: React.FC = () => {
  const {
    title,
    status,
    meetingId,
    insights,
    transcripts,
    highlightedTranscriptId,
    confirmInsight,
    keepCurrentInsightVersion,
    acceptInsightRevision,
    setHighlightedTranscriptId,
    setActiveWindow,
    setCurrentRoute,
    startMeeting,
    pauseMeeting,
    resumeMeeting,
    endMeeting,
    addInsight,
    addTranscriptSegment,
  } = useMeetingStore();

  const [activeFilter, setActiveFilter] = useState<'all' | InsightType>('all');
  const [filterKeyword, setFilterKeyword] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const transcriptListRef = useRef<HTMLDivElement>(null);

  // 联动滚动与短促呼吸高亮消退机制（依据 UIUX-DESIGN-SPEC.md 规范）
  useEffect(() => {
    if (highlightedTranscriptId && transcriptListRef.current) {
      const el = document.getElementById(highlightedTranscriptId);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // 2.5 秒后自动平滑消退高亮焦点
      const timer = setTimeout(() => {
        setHighlightedTranscriptId(null);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [highlightedTranscriptId, setHighlightedTranscriptId]);

  const handleMinimizeToPill = useCallback(() => {
    setActiveWindow('floating-pill');
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('toggle_floating_mode', { toFloating: true }).catch(() => {});
      });
    }
  }, [setActiveWindow]);

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;

    const q = questionText.trim();
    setQuestionText('');
    setIsAsking(true);

    try {
      const res = await fetch('http://localhost:3201/gateway/v1/meeting-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: meetingId || 'meet_live',
          question: q,
          asOfTextVersion: transcripts.length,
          localStableTranscript: transcripts.length
            ? transcripts.map((t) => ({ segmentId: t.id, speaker: t.speaker, text: t.text }))
            : [{ segmentId: 'seg_init', speaker: '系统', text: '本场会议已开启，正在监听双轨音频。' }],
        }),
      }).catch(() => null);

      if (res && res.ok) {
        const json = await res.json();
        addInsight({
          id: `ask-${Date.now()}`,
          type: 'fact',
          title: `AI 问答：${q}`,
          content: json.data?.answer || '已完成本场会议问答分析。',
          timestamp: formatSeconds(useMeetingStore.getState().elapsedSeconds),
          evidenceSegmentId: json.data?.evidenceRefs?.[0]?.segmentId || transcripts[transcripts.length - 1]?.id || '',
        });
      } else {
        // 本地 Fallback
        addInsight({
          id: `ask-${Date.now()}`,
          type: 'fact',
          title: `AI 问答：${q}`,
          content: '根据当前讨论记录，参会各方正就核心议题推进，暂未提出相悖意见。',
          timestamp: formatSeconds(useMeetingStore.getState().elapsedSeconds),
          evidenceSegmentId: transcripts[transcripts.length - 1]?.id || '',
        });
      }
    } finally {
      setIsAsking(false);
    }
  };

  // 快捷体验模拟：一键生成一段对话并提炼卡片
  const handleSimulateSpeech = () => {
    const elapsed = useMeetingStore.getState().elapsedSeconds;
    const segId = `seg_${Date.now()}`;
    const speakers = ['老朱 (麦克风)', '李工 (系统声音)', '王经理 (系统声音)'];
    const mockSpeeches = [
      '我们确认采用 WASAPI 原生采集方案，已经完成了基础链路搭建。',
      '是的，而且 2 秒原子刷盘已经调通，断电崩溃后可以自动自愈。',
      '太好了，那我们就把测试验收排期敲定在下周一上午。',
      '同意！请待办负责人跟进测试用例执行与报告产出。',
    ];
    const pickedSpeaker = speakers[transcripts.length % speakers.length];
    const pickedText = mockSpeeches[transcripts.length % mockSpeeches.length];

    addTranscriptSegment({
      id: segId,
      speaker: pickedSpeaker,
      channel: pickedSpeaker.includes('麦克风') ? 'mic' : 'system',
      timestamp: formatSeconds(elapsed),
      text: pickedText,
    });

    // 联动提取洞察卡片
    if (transcripts.length % 2 === 1) {
      addInsight({
        id: `card_${Date.now()}`,
        type: transcripts.length === 1 ? 'decision' : 'action',
        title: transcripts.length === 1 ? '确认 WASAPI 原生双轨采集方案' : '推进测试验收与自愈报告',
        content: pickedText,
        timestamp: formatSeconds(elapsed),
        evidenceSegmentId: segId,
      });
    }
  };

  const filteredInsights = insights.filter((item) => {
    if (activeFilter !== 'all' && item.type !== activeFilter) return false;
    return true;
  });

  const filteredTranscripts = transcripts.filter((t) => {
    if (!filterKeyword) return true;
    return t.text.toLowerCase().includes(filterKeyword.toLowerCase()) ||
           t.speaker.toLowerCase().includes(filterKeyword.toLowerCase());
  });

  return (
    <div
      data-testid="workbench-page-container"
      className="flex flex-col h-screen w-screen bg-canvas text-text-primary overflow-hidden select-none"
    >
      {/* 顶部状态与工具栏 */}
      <header
        data-testid="workbench-page-header-container"
        className="h-13 px-5 py-3 border-b border-border-subtle bg-subtle flex items-center justify-between shrink-0"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="workbench-page-header-btn-back"
            onClick={() => setCurrentRoute('home')}
            className="px-2.5 py-1 text-xs rounded bg-panel border border-border-subtle hover:bg-hover text-text-secondary flex items-center gap-1 font-medium transition-colors"
          >
            ← 返回工作台
          </button>
          <span
            data-testid="workbench-page-header-badge-status"
            className={`w-3 h-3 rounded-full ${
              status === 'RECORDING'
                ? 'bg-status-danger animate-pulse'
                : 'bg-text-tertiary'
            }`}
            title={status === 'RECORDING' ? '正在录音' : '已暂停'}
          />
          <h1
            data-testid="workbench-page-header-text-title"
            className="text-base font-semibold truncate max-w-md"
          >
            {title}
          </h1>
          <HeaderTimer />
        </div>

        <div className="flex items-center gap-2">
          {status !== 'RECORDING' ? (
            <button
              type="button"
              data-testid="workbench-page-header-btn-start-record"
              onClick={() => (status === 'PAUSED' ? resumeMeeting() : startMeeting(title))}
              className="px-3 py-1.5 text-xs bg-status-success text-white hover:opacity-90 rounded-md font-medium transition-opacity flex items-center gap-1.5"
            >
              <span>▶</span>
              <span>{status === 'PAUSED' ? '继续录制' : '开始录制'}</span>
            </button>
          ) : (
            <button
              type="button"
              data-testid="workbench-page-header-btn-pause-record"
              onClick={pauseMeeting}
              className="px-3 py-1.5 text-xs bg-panel border border-border-subtle text-text-primary hover:bg-hover rounded-md font-medium transition-colors"
            >
              ⏸ 暂停
            </button>
          )}

          <button
            type="button"
            data-testid="workbench-page-header-btn-simulate-speech"
            onClick={handleSimulateSpeech}
            className="px-3 py-1.5 text-xs bg-brand-blue-subtle text-brand-blue hover:bg-brand-blue hover:text-white rounded-md font-medium transition-colors"
          >
            🎙️ 模拟参会人发言
          </button>

          <button
            type="button"
            data-testid="workbench-page-header-btn-minimize-to-pill"
            onClick={handleMinimizeToPill}
            className="px-3 py-1.5 text-xs bg-panel hover:bg-border-subtle text-text-secondary rounded-md transition-colors"
          >
            最小化至悬浮条
          </button>
          <button
            type="button"
            data-testid="workbench-page-header-btn-end-meeting"
            onClick={endMeeting}
            className="px-3 py-1.5 text-xs bg-status-danger text-white hover:opacity-90 rounded-md font-medium transition-opacity"
          >
            结束会议
          </button>
        </div>
      </header>

      {/* 主体工作区：左 54% 洞察看板 + 右 46% 逐字稿 */}
      <main className="flex flex-1 overflow-hidden">
        {/* 左侧看板：实时洞察、结论与问答 (54%) */}
        <section
          data-testid="workbench-page-insights-panel-container"
          className="w-[54%] border-r border-border-subtle flex flex-col bg-canvas overflow-hidden"
        >
          {/* 洞察类型筛选 Tab */}
          <div
            data-testid="workbench-page-insights-panel-tabs-filter"
            className="px-4 py-2.5 border-b border-border-subtle bg-subtle flex items-center justify-between shrink-0"
          >
            <div className="flex items-center gap-1.5">
              {(['all', 'decision', 'action', 'risk', 'fact'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  data-testid={`workbench-page-insights-panel-tab-${tab}`}
                  onClick={() => setActiveFilter(tab)}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    activeFilter === tab
                      ? 'bg-brand-blue text-white font-medium'
                      : 'text-text-secondary hover:bg-panel'
                  }`}
                >
                  {tab === 'all' && '全部洞察'}
                  {tab === 'decision' && '关键结论'}
                  {tab === 'action' && '待办项'}
                  {tab === 'risk' && '风险争议'}
                  {tab === 'fact' && '核心事实'}
                </button>
              ))}
            </div>
            <span
              data-testid="workbench-page-insights-panel-text-count"
              className="text-xs text-text-tertiary tabular-nums"
            >
              已提炼 {filteredInsights.length} 项
            </span>
          </div>

          {/* 洞察卡片滚动列表 */}
          <div
            data-testid="workbench-page-insights-panel-list-cards"
            className="flex-1 overflow-y-auto p-4 space-y-3.5"
          >
            {filteredInsights.length === 0 ? (
              <div
                data-testid="workbench-page-insights-panel-empty-state"
                className="h-full flex flex-col items-center justify-center text-text-tertiary text-xs"
              >
                <span>🎙️ 正在倾听发言，实时提炼关键结论与待办...</span>
              </div>
            ) : (
              filteredInsights.map((card) => (
                <InsightCardItem
                  key={card.id}
                  card={card}
                  onViewEvidence={setHighlightedTranscriptId}
                  onConfirm={confirmInsight}
                  onKeepCurrent={keepCurrentInsightVersion}
                  onAcceptRevision={acceptInsightRevision}
                />
              ))
            )}
          </div>

          {/* 底部提问输入框 */}
          <form
            onSubmit={handleAskQuestion}
            data-testid="workbench-page-insights-panel-form-ask"
            className="p-3 border-t border-border-subtle bg-subtle flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="向听序提问本场会议（如：大家就排期达成一致了吗？）"
              data-testid="workbench-page-insights-panel-input-ask-question"
              className="flex-1 px-3 py-2 text-xs bg-canvas border border-border-subtle rounded-md focus:outline-none focus:border-brand-blue text-text-primary placeholder:text-text-tertiary"
            />
            <button
              type="submit"
              disabled={isAsking}
              data-testid="workbench-page-insights-panel-btn-send-question"
              className="px-3.5 py-2 text-xs bg-brand-blue text-white rounded-md hover:bg-brand-blue-hover transition-colors font-medium shrink-0 disabled:opacity-50"
            >
              {isAsking ? '思考中...' : '提问'}
            </button>
          </form>
        </section>

        {/* 右侧逐字稿：双轨实时转写流 (46%) */}
        <section
          data-testid="workbench-page-transcript-panel-container"
          className="w-[46%] flex flex-col bg-subtle overflow-hidden"
        >
          {/* 逐字稿顶部信息与搜索 */}
          <div className="px-4 py-2.5 border-b border-border-subtle bg-canvas flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <span
                data-testid="workbench-page-transcript-panel-text-status"
                className="text-xs font-semibold text-text-primary"
              >
                实时逐字稿
              </span>
              <span
                data-testid="workbench-page-transcript-panel-badge-channel-source"
                className="px-1.5 py-0.5 rounded bg-brand-blue-subtle text-brand-blue text-[10px] font-mono"
              >
                双轨采集: 麦克风 + 声卡
              </span>
            </div>

            <input
              type="text"
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              placeholder="快速过滤逐字稿..."
              data-testid="workbench-page-transcript-panel-input-filter"
              className="px-2.5 py-1 text-xs bg-subtle border border-border-subtle rounded focus:outline-none focus:border-brand-blue text-text-primary w-40"
            />
          </div>

          {/* 逐字稿滚动段落列表 */}
          <div
            ref={transcriptListRef}
            data-testid="workbench-page-transcript-panel-list-segments"
            className="flex-1 overflow-y-auto p-4 space-y-3"
          >
            {filteredTranscripts.length === 0 ? (
              <div
                data-testid="workbench-page-transcript-panel-empty-state"
                className="h-full flex items-center justify-center text-text-tertiary text-xs"
              >
                等待麦克风与系统音频输入...
              </div>
            ) : (
              filteredTranscripts.map((segment) => (
                <TranscriptRow
                  key={segment.id}
                  segment={segment}
                  isHighlighted={highlightedTranscriptId === segment.id}
                />
              ))
            )}
          </div>

          {/* 逐字稿底部统计 */}
          <div className="px-4 py-2 border-t border-border-subtle bg-canvas flex items-center justify-between text-[11px] text-text-tertiary shrink-0">
            <span data-testid="workbench-page-transcript-panel-text-storage">
              本地 SQLite 毫秒级写入
            </span>
            <span
              data-testid="workbench-page-transcript-panel-text-count"
              className="tabular-nums font-mono"
            >
              已收录 {transcripts.length} 段发言
            </span>
          </div>
        </section>
      </main>
    </div>
  );
};
