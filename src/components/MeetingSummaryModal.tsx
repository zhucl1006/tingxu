import React, { useState, useEffect } from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import { formatSeconds } from '../utils/formatTime';
import { parseTimecode, segmentPlaybackSeconds } from '../utils/transcriptTime';
import { MeetingMindmap } from './MeetingMindmap';

export const MeetingSummaryModal: React.FC = () => {
  const { activeSummaryMeeting, setActiveSummaryMeeting, activeTargetSegmentId } = useMeetingStore();
  const [activeTab, setActiveTab] = useState<'summary' | 'mindmap' | 'transcripts'>('summary');
  const [copied, setCopied] = useState(false);

  // 若携带特定发言段落定位目标，自动跳转至逐字稿选项卡
  useEffect(() => {
    if (activeTargetSegmentId) {
      setActiveTab('transcripts');
    }
  }, [activeTargetSegmentId]);

  // 联动平滑滚动聚焦指定段落
  useEffect(() => {
    if (activeTab === 'transcripts' && activeTargetSegmentId) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`modal-seg-${activeTargetSegmentId}`);
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab, activeTargetSegmentId]);

  if (!activeSummaryMeeting) return null;

  const meeting = activeSummaryMeeting;
  const summary = meeting.structuredSummary;
  const insights = meeting.insights || [];
  const transcripts = meeting.transcripts || [];

  const speakers = meeting.speakers && meeting.speakers.length > 0
    ? meeting.speakers
    : Array.from(new Set(transcripts.map((t) => t.speaker).filter(Boolean)));

  // 提取四类洞察
  const decisions = summary?.decisions || insights.filter((i) => i.type === 'decision').map((d) => ({
    title: d.title,
    content: d.content,
    evidenceQuote: d.timestamp ? `(${d.timestamp})` : undefined,
  }));

  const actions = summary?.actions || insights.filter((i) => i.type === 'action').map((a) => ({
    title: a.title,
    content: a.content,
    assignee: '待确认',
    dueDate: '尽快落实',
    evidenceQuote: a.timestamp ? `(${a.timestamp})` : undefined,
  }));

  const risks = summary?.risks || insights.filter((i) => i.type === 'risk').map((r) => ({
    title: r.title,
    content: r.content,
  }));

  const facts = summary?.facts || insights.filter((i) => i.type === 'fact').map((f) => ({
    title: f.title,
    content: f.content,
  }));

  const overviewText = summary?.overview || meeting.summary;

  // 生成 Markdown 文本
  const generateMarkdown = () => {
    let md = `# 听序会议纪要 — ${meeting.title}\n\n`;
    md += `- **开会时间**：${meeting.date}\n`;
    md += `- **会议时长**：${formatSeconds(meeting.durationSeconds)}\n`;
    md += `- **数据存储**：本地优先（Local-First SQLite 沙箱，Zero-Content 云端零留存）\n\n`;

    md += `## 📋 全局主旨综述\n${overviewText}\n\n`;

    md += `## 💡 关键结论与决策 (${decisions.length})\n`;
    if (decisions.length === 0) {
      md += `*暂无提炼结论*\n\n`;
    } else {
      decisions.forEach((d, idx) => {
        md += `${idx + 1}. **${d.title}**：${d.content}${d.evidenceQuote ? ` *(依据: ${d.evidenceQuote})*` : ''}\n`;
      });
      md += `\n`;
    }

    md += `## ☑️ 待办事项与跟进 (${actions.length})\n`;
    if (actions.length === 0) {
      md += `*暂无行动待办*\n\n`;
    } else {
      actions.forEach((a) => {
        const assignee = a.assignee ? ` [负责人: ${a.assignee}]` : '';
        const due = a.dueDate ? ` [期限: ${a.dueDate}]` : '';
        md += `- [ ] **${a.title}**${assignee}${due}\n`;
      });
      md += `\n`;
    }

    if (risks.length > 0) {
      md += `## ⚠️ 风险预警与分歧争议 (${risks.length})\n`;
      risks.forEach((r, idx) => {
        md += `${idx + 1}. **${r.title}**：${r.content}\n`;
      });
      md += `\n`;
    }

    if (facts.length > 0) {
      md += `## 📌 核心事实与数据背景 (${facts.length})\n`;
      facts.forEach((f, idx) => {
        md += `${idx + 1}. **${f.title}**：${f.content}\n`;
      });
      md += `\n`;
    }

    if (transcripts.length > 0) {
      md += `## 🎙️ 完整逐字稿附录 (${transcripts.length} 段)\n`;
      transcripts.forEach((t) => {
        md += `- **[${t.timestamp || '00:00'}] ${t.speaker}**：${t.text}\n`;
      });
      md += `\n`;
    }

    return md;
  };

  const handleExportMarkdown = () => {
    const md = generateMarkdown();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${meeting.title.replace(/[\\/:*?"<>|]/g, '_')}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySummary = () => {
    const md = generateMarkdown();
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      data-testid="meeting-summary-modal-overlay"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 md:p-6 select-none animate-fadeIn"
    >
      <div
        data-testid="meeting-summary-modal-container"
        className="bg-canvas border border-border-strong rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* 顶部标题与操作栏 */}
        <header
          data-testid="meeting-summary-modal-header"
          className="px-6 py-4 border-b border-border-subtle bg-subtle flex items-center justify-between shrink-0"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-brand-blue-subtle text-brand-blue">
                会议总结报告
              </span>
              <h2
                data-testid="meeting-summary-modal-text-title"
                className="text-base font-bold text-text-primary truncate max-w-xl"
              >
                {meeting.title}
              </h2>
            </div>
            <div className="flex items-center gap-3 text-xs text-text-tertiary font-mono">
              <span>📅 {meeting.date}</span>
              <span>·</span>
              <span className="tabular-nums">⏱ 时长: {formatSeconds(meeting.durationSeconds)}</span>
              <span>·</span>
              <span>已收录 {transcripts.length} 段发言</span>
              {speakers.length > 0 && (
                <>
                  <span>·</span>
                  <span className="text-text-secondary">👥 参会人: {speakers.join('、')}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="meeting-summary-modal-btn-copy"
              onClick={handleCopySummary}
              className="px-3 py-1.5 rounded-lg bg-panel border border-border-subtle hover:bg-hover text-text-primary text-xs font-medium transition-colors"
            >
              {copied ? '✓ 已复制纪要' : '📋 复制全文'}
            </button>
            <button
              type="button"
              data-testid="meeting-summary-modal-btn-export-markdown"
              onClick={handleExportMarkdown}
              className="px-3 py-1.5 rounded-lg bg-brand-blue text-white hover:bg-brand-blue-hover text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
            >
              <span>⬇ 导出 Markdown</span>
            </button>
            <button
              type="button"
              data-testid="meeting-summary-modal-btn-close"
              onClick={() => setActiveSummaryMeeting(null)}
              className="w-8 h-8 rounded-lg bg-panel hover:bg-hover text-text-secondary flex items-center justify-center text-sm font-bold transition-colors ml-1"
            >
              ✕
            </button>
          </div>
        </header>

        {/* Tab 导航切换 */}
        <div
          data-testid="meeting-summary-modal-tabs"
          className="px-6 border-b border-border-subtle bg-canvas flex items-center gap-6 shrink-0 text-xs"
        >
          <button
            type="button"
            data-testid="meeting-summary-modal-tab-summary"
            onClick={() => setActiveTab('summary')}
            className={`py-3 border-b-2 font-medium transition-colors ${
              activeTab === 'summary'
                ? 'border-brand-blue text-brand-blue font-semibold'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            📊 结构化总结提炼（结论/待办/风险/事实）
          </button>
          <button
            type="button"
            data-testid="meeting-summary-modal-tab-mindmap"
            onClick={() => setActiveTab('mindmap')}
            className={`py-3 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'mindmap'
                ? 'border-brand-blue text-brand-blue font-semibold'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <span>🧠</span>
            <span>讯飞听见式思维导图</span>
          </button>
          <button
            type="button"
            data-testid="meeting-summary-modal-tab-transcripts"
            onClick={() => setActiveTab('transcripts')}
            className={`py-3 border-b-2 font-medium transition-colors ${
              activeTab === 'transcripts'
                ? 'border-brand-blue text-brand-blue font-semibold'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            🎙️ 全场原始逐字稿 ({transcripts.length})
          </button>
        </div>

        {/* 主体报告滚动区 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'mindmap' ? (
            /* 思维导图视图 */
            <div className="h-[620px] w-full">
              <MeetingMindmap meeting={meeting} onSeekSegment={id => { setActiveSummaryMeeting(meeting, id); setActiveTab('transcripts'); }} onSeekTimestamp={time => {
                const seconds = parseTimecode(time);
                if (seconds === null) return;
                const segment = [...transcripts].reverse().find(t => {
                  const start = segmentPlaybackSeconds(t); return start !== null && start <= seconds;
                });
                setActiveSummaryMeeting(meeting, segment?.id);
                setActiveTab('transcripts');
              }} />
            </div>
          ) : activeTab === 'summary' ? (
            <>
              {/* 1. 全局主旨综述 */}
              <div
                data-testid="meeting-summary-modal-card-overview"
                className="p-4 rounded-xl bg-panel border border-border-subtle space-y-2 shadow-xs"
              >
                <div className="flex items-center gap-2 text-xs font-bold text-text-primary">
                  <span>📋 会议全局综述</span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  {overviewText}
                </p>
              </div>

              {/* 2. 四维看板网格 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 关键结论 */}
                <div
                  data-testid="meeting-summary-modal-section-decisions"
                  className="p-4 rounded-xl bg-subtle border border-border-subtle space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-status-success" />
                      <span className="text-xs font-bold text-text-primary">关键结论与决策</span>
                    </div>
                    <span className="text-[11px] text-text-tertiary tabular-nums font-mono">
                      {decisions.length} 项
                    </span>
                  </div>

                  <div className="space-y-2">
                    {decisions.length === 0 ? (
                      <div className="text-[11px] text-text-tertiary py-3 text-center">本场无结论争议项</div>
                    ) : (
                      decisions.map((d, i) => (
                        <div
                          key={i}
                          data-testid={`meeting-summary-modal-item-decision-${i}`}
                          className="p-2.5 rounded-lg bg-canvas border border-border-subtle space-y-1"
                        >
                          <div className="text-xs font-semibold text-text-primary">{d.title}</div>
                          <p className="text-xs text-text-secondary leading-snug">{d.content}</p>
                          {d.evidenceQuote && (
                            <div className="text-[10px] text-text-tertiary font-mono pt-1">
                              依据: {d.evidenceQuote}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 待办事项 */}
                <div
                  data-testid="meeting-summary-modal-section-actions"
                  className="p-4 rounded-xl bg-subtle border border-border-subtle space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-brand-blue" />
                      <span className="text-xs font-bold text-text-primary">待办任务与行动</span>
                    </div>
                    <span className="text-[11px] text-text-tertiary tabular-nums font-mono">
                      {actions.length} 项
                    </span>
                  </div>

                  <div className="space-y-2">
                    {actions.length === 0 ? (
                      <div className="text-[11px] text-text-tertiary py-3 text-center">本场未产生待办</div>
                    ) : (
                      actions.map((a, i) => (
                        <div
                          key={i}
                          data-testid={`meeting-summary-modal-item-action-${i}`}
                          className="p-2.5 rounded-lg bg-canvas border border-border-subtle space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-text-primary">{a.title}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-subtle font-mono text-text-secondary">
                              {a.assignee || '待分配'}
                            </span>
                          </div>
                          {a.dueDate && (
                            <div className="text-[11px] text-text-tertiary">预计截止: {a.dueDate}</div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 风险争议 */}
                <div
                  data-testid="meeting-summary-modal-section-risks"
                  className="p-4 rounded-xl bg-subtle border border-border-subtle space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-status-warning" />
                      <span className="text-xs font-bold text-text-primary">风险争议与阻碍</span>
                    </div>
                    <span className="text-[11px] text-text-tertiary tabular-nums font-mono">
                      {risks.length} 项
                    </span>
                  </div>

                  <div className="space-y-2">
                    {risks.length === 0 ? (
                      <div className="text-[11px] text-text-tertiary py-3 text-center">暂无识别到重大风险</div>
                    ) : (
                      risks.map((r, i) => (
                        <div
                          key={i}
                          data-testid={`meeting-summary-modal-item-risk-${i}`}
                          className="p-2.5 rounded-lg bg-canvas border border-border-subtle space-y-1"
                        >
                          <div className="text-xs font-semibold text-status-warning">{r.title}</div>
                          <p className="text-xs text-text-secondary leading-snug">{r.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 核心事实与数据 */}
                <div
                  data-testid="meeting-summary-modal-section-facts"
                  className="p-4 rounded-xl bg-subtle border border-border-subtle space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-text-tertiary" />
                      <span className="text-xs font-bold text-text-primary">核心事实与背景</span>
                    </div>
                    <span className="text-[11px] text-text-tertiary tabular-nums font-mono">
                      {facts.length} 项
                    </span>
                  </div>

                  <div className="space-y-2">
                    {facts.length === 0 ? (
                      <div className="text-[11px] text-text-tertiary py-3 text-center">暂无特殊事实记录</div>
                    ) : (
                      facts.map((f, i) => (
                        <div
                          key={i}
                          data-testid={`meeting-summary-modal-item-fact-${i}`}
                          className="p-2.5 rounded-lg bg-canvas border border-border-subtle space-y-1"
                        >
                          <div className="text-xs font-semibold text-text-primary">{f.title}</div>
                          <p className="text-xs text-text-secondary leading-snug">{f.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* 原始逐字稿列表 */
            <div data-testid="meeting-summary-modal-list-transcripts" className="space-y-3">
              {transcripts.length === 0 ? (
                <div className="text-center py-12 text-xs text-text-tertiary">
                  本场会议暂无逐字稿语音切片记录
                </div>
              ) : (
                transcripts.map((t) => (
                  <div
                    key={t.id}
                    id={`modal-seg-${t.id}`}
                    data-testid={`meeting-summary-modal-row-transcript-${t.id}`}
                    className={`p-3 rounded-lg border transition-all space-y-1 ${
                      t.id === activeTargetSegmentId
                        ? 'bg-brand-blue/10 border-brand-blue ring-2 ring-brand-blue/30 shadow-xs'
                        : 'bg-subtle border-border-subtle'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-text-primary">{t.speaker}</span>
                      <span className="font-mono text-[11px] text-text-tertiary tabular-nums">
                        {t.timestamp}
                      </span>
                    </div>
                    <p className="text-xs text-text-primary leading-relaxed">{t.text}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
