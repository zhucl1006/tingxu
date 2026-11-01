import React, { useState, useEffect } from 'react';
import { useMeetingStore } from '../../store/useMeetingStore';
import { formatSeconds } from '../../utils/formatTime';
import { MeetingMindmap } from '../MeetingMindmap';

export const MeetingSummaryView: React.FC = () => {
  const {
    activeSummaryMeeting,
    setActiveSummaryMeeting,
    activeTargetSegmentId,
    setCurrentRoute,
    renameSpeaker,
  } = useMeetingStore();

  const [activeTab, setActiveTab] = useState<'summary' | 'mindmap' | 'transcripts'>('summary');
  const [copied, setCopied] = useState(false);
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [newSpeakerName, setNewSpeakerName] = useState('');

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
        const el = document.getElementById(`summary-seg-${activeTargetSegmentId}`);
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab, activeTargetSegmentId]);

  if (!activeSummaryMeeting) {
    return (
      <div
        data-testid="summary-page-empty-container"
        className="flex-1 h-screen flex flex-col items-center justify-center space-y-3 text-text-tertiary"
      >
        <span className="text-3xl">📋</span>
        <p className="text-xs">暂无选中的会议纪要</p>
        <button
          type="button"
          data-testid="summary-page-btn-back-home"
          onClick={() => setCurrentRoute('home')}
          className="px-3 py-1.5 rounded-lg bg-brand-blue text-white text-xs font-medium"
        >
          返回工作台
        </button>
      </div>
    );
  }

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
    assignee: a.assignee || '待确认',
    dueDate: a.dueDate || '尽快推进',
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
    md += `- **参会人员**：${speakers.join('、') || '全员'}\n`;
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

  const handleSaveSpeakerRename = (oldName: string) => {
    if (newSpeakerName.trim() && newSpeakerName.trim() !== oldName) {
      renameSpeaker(oldName, newSpeakerName.trim());
    }
    setEditingSpeaker(null);
    setNewSpeakerName('');
  };

  return (
    <div
      data-testid="summary-page-container"
      className="flex-1 h-screen overflow-hidden flex flex-col bg-canvas text-text-primary select-none animate-fadeIn"
    >
      {/* 沉浸式顶部标题与导航栏 */}
      <header
        data-testid="summary-page-header"
        className="px-6 py-3.5 border-b border-border-subtle bg-subtle flex items-center justify-between shrink-0"
      >
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            data-testid="summary-page-btn-back"
            onClick={() => {
              setActiveSummaryMeeting(null);
              setCurrentRoute('home');
            }}
            className="px-3 py-1.5 text-xs rounded-lg bg-panel border border-border-subtle hover:bg-hover text-text-secondary flex items-center gap-1.5 font-medium transition-colors shrink-0"
          >
            <span>←</span>
            <span>返回工作台</span>
          </button>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-brand-blue-subtle text-brand-blue shrink-0">
                会议总结报告
              </span>
              <h1
                data-testid="summary-page-text-title"
                className="text-base font-bold text-text-primary truncate max-w-xl"
              >
                {meeting.title}
              </h1>
            </div>

            <div className="flex items-center gap-3 text-xs text-text-tertiary font-mono flex-wrap">
              <span>📅 {meeting.date}</span>
              <span>·</span>
              <span className="tabular-nums">⏱ 时长: {formatSeconds(meeting.durationSeconds)}</span>
              <span>·</span>
              <span>已收录 {transcripts.length} 段发言</span>
              {speakers.length > 0 && (
                <>
                  <span>·</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-text-secondary">👥 参会人:</span>
                    {speakers.map((sp, idx) => (
                      <span
                        key={idx}
                        onClick={() => {
                          setEditingSpeaker(sp);
                          setNewSpeakerName(sp);
                        }}
                        className="px-1.5 py-0.2 rounded bg-canvas border border-border-subtle hover:border-brand-blue cursor-pointer transition-colors text-text-primary text-[11px]"
                        title="点击重命名参会人"
                      >
                        {sp}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 顶部操作区 */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="summary-page-btn-copy"
            onClick={handleCopySummary}
            className="px-3 py-1.5 rounded-lg bg-panel border border-border-subtle hover:bg-hover text-text-primary text-xs font-medium transition-colors"
          >
            {copied ? '✓ 已复制纪要' : '📋 复制全文'}
          </button>
          <button
            type="button"
            data-testid="summary-page-btn-export-markdown"
            onClick={handleExportMarkdown}
            className="px-3 py-1.5 rounded-lg bg-brand-blue text-white hover:bg-brand-blue-hover text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
          >
            <span>⬇ 导出 Markdown</span>
          </button>
        </div>
      </header>

      {/* 参会人快速编辑悬浮框 */}
      {editingSpeaker && (
        <div
          data-testid="summary-page-modal-rename-speaker"
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        >
          <div className="bg-canvas border border-border-strong rounded-xl p-4 w-80 space-y-3 shadow-xl">
            <h3 className="text-xs font-bold text-text-primary">
              重命名参会人「{editingSpeaker}」
            </h3>
            <p className="text-[11px] text-text-secondary">
              修改后将同步更新本场会议的所有逐字稿发言人与脑图统计。
            </p>
            <input
              type="text"
              data-testid="summary-page-input-rename-speaker"
              value={newSpeakerName}
              onChange={(e) => setNewSpeakerName(e.target.value)}
              placeholder="输入真实姓名（例如：张总、王架构师）"
              className="w-full px-3 py-1.5 text-xs bg-subtle border border-border-subtle rounded-md focus:outline-none focus:border-brand-blue text-text-primary"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingSpeaker(null)}
                className="px-2.5 py-1 text-xs rounded bg-subtle text-text-secondary hover:bg-hover"
              >
                取消
              </button>
              <button
                type="button"
                data-testid="summary-page-btn-confirm-rename"
                onClick={() => handleSaveSpeakerRename(editingSpeaker)}
                className="px-3 py-1 text-xs rounded bg-brand-blue text-white font-medium hover:bg-brand-blue-hover"
              >
                确认修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 一级选项卡切换 */}
      <div
        data-testid="summary-page-tabs"
        className="px-6 border-b border-border-subtle bg-canvas flex items-center gap-6 shrink-0 text-xs"
      >
        <button
          type="button"
          data-testid="summary-page-tab-summary"
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
          data-testid="summary-page-tab-mindmap"
          onClick={() => setActiveTab('mindmap')}
          className={`py-3 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'mindmap'
              ? 'border-brand-blue text-brand-blue font-semibold'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <span>🧠</span>
          <span>听序思维导图</span>
        </button>
        <button
          type="button"
          data-testid="summary-page-tab-transcripts"
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

      {/* 主体工作区 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'mindmap' ? (
          /* 思维导图全屏画布 */
          <div className="h-[calc(100vh-175px)] w-full">
            <MeetingMindmap meeting={meeting} />
          </div>
        ) : activeTab === 'summary' ? (
          <>
            {/* 1. 全局主旨综述 */}
            <div
              data-testid="summary-page-card-overview"
              className="p-5 rounded-xl bg-panel border border-border-subtle space-y-2 shadow-xs"
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
                data-testid="summary-page-section-decisions"
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
                    <div className="text-[11px] text-text-tertiary py-3 text-center">暂无提炼结论</div>
                  ) : (
                    decisions.map((d, i) => (
                      <div
                        key={i}
                        data-testid={`summary-page-item-decision-${i}`}
                        className="p-3 rounded-lg bg-canvas border border-border-subtle space-y-1 shadow-xs"
                      >
                        <div className="text-xs font-semibold text-text-primary">{d.title}</div>
                        <p className="text-xs text-text-secondary leading-relaxed">{d.content}</p>
                        {d.evidenceQuote && (
                          <div className="text-[10px] text-text-tertiary font-mono pt-1">
                            依据发言：{d.evidenceQuote}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 待办事项 */}
              <div
                data-testid="summary-page-section-actions"
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
                    <div className="text-[11px] text-text-tertiary py-3 text-center">暂无行动待办</div>
                  ) : (
                    actions.map((a, i) => (
                      <div
                        key={i}
                        data-testid={`summary-page-item-action-${i}`}
                        className="p-3 rounded-lg bg-canvas border border-border-subtle space-y-1 shadow-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-text-primary">{a.title}</span>
                          <span className="px-1.5 py-0.2 rounded bg-subtle text-[10px] text-text-secondary">
                            {a.assignee}
                          </span>
                        </div>
                        <div className="text-[11px] text-text-tertiary flex items-center justify-between">
                          <span>预计截止：{a.dueDate}</span>
                          {a.evidenceQuote && (
                            <span className="font-mono text-[10px]">({a.evidenceQuote})</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 风险争议与阻碍 */}
              <div
                data-testid="summary-page-section-risks"
                className="p-4 rounded-xl bg-subtle border border-border-subtle space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-status-danger" />
                    <span className="text-xs font-bold text-text-primary">风险争议与阻碍</span>
                  </div>
                  <span className="text-[11px] text-text-tertiary tabular-nums font-mono">
                    {risks.length} 项
                  </span>
                </div>

                <div className="space-y-2">
                  {risks.length === 0 ? (
                    <div className="text-[11px] text-text-tertiary py-3 text-center">未识别到重大风险</div>
                  ) : (
                    risks.map((r, i) => (
                      <div
                        key={i}
                        data-testid={`summary-page-item-risk-${i}`}
                        className="p-3 rounded-lg bg-canvas border border-status-warning-border/40 space-y-1 shadow-xs"
                      >
                        <div className="text-xs font-semibold text-status-warning">{r.title}</div>
                        <p className="text-xs text-text-secondary leading-snug">{r.content}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 核心事实与背景 */}
              <div
                data-testid="summary-page-section-facts"
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
                        data-testid={`summary-page-item-fact-${i}`}
                        className="p-3 rounded-lg bg-canvas border border-border-subtle space-y-1 shadow-xs"
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
          <div data-testid="summary-page-list-transcripts" className="space-y-3">
            {transcripts.length === 0 ? (
              <div className="text-center py-12 text-xs text-text-tertiary">
                本场会议暂无逐字稿语音切片记录
              </div>
            ) : (
              transcripts.map((t) => (
                <div
                  key={t.id}
                  id={`summary-seg-${t.id}`}
                  data-testid={`summary-page-row-transcript-${t.id}`}
                  className={`p-3.5 rounded-xl border transition-all space-y-1.5 ${
                    t.id === activeTargetSegmentId
                      ? 'bg-brand-blue/10 border-brand-blue ring-2 ring-brand-blue/30 shadow-xs'
                      : 'bg-subtle border-border-subtle hover:border-border-strong'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span
                      onClick={() => {
                        setEditingSpeaker(t.speaker);
                        setNewSpeakerName(t.speaker);
                      }}
                      className="font-semibold text-text-primary hover:text-brand-blue cursor-pointer transition-colors"
                      title="点击重命名该参会人"
                    >
                      👤 {t.speaker}
                    </span>
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
  );
};
