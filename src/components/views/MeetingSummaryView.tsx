import React, { useState, useEffect, useRef } from 'react';
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
    registerSpeakerProfile,
  } = useMeetingStore();

  const [activeTab, setActiveTab] = useState<'summary' | 'mindmap' | 'transcripts'>('summary');
  const [summaryMode, setSummaryMode] = useState<'cards' | 'outline'>('cards');
  const [copied, setCopied] = useState(false);
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [newSpeakerName, setNewSpeakerName] = useState('');

  // 模拟播放器状态
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlaybackSeconds, setCurrentPlaybackSeconds] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  const transcriptsContainerRef = useRef<HTMLDivElement>(null);

  // 监听选中段落，联动滚动与高亮
  useEffect(() => {
    const targetId = activeTargetSegmentId || selectedSegmentId;
    if (targetId) {
      const el = document.getElementById(`summary-seg-${targetId}`);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeTargetSegmentId, selectedSegmentId]);

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
    evidenceSegmentId: d.evidenceSegmentId,
  }));

  const actions = summary?.actions || insights.filter((i) => i.type === 'action').map((a) => ({
    title: a.title,
    content: a.content,
    assignee: a.assignee || '待确认',
    dueDate: a.dueDate || '尽快推进',
    evidenceQuote: a.timestamp ? `(${a.timestamp})` : undefined,
    evidenceSegmentId: a.evidenceSegmentId,
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
      actions.forEach((a, idx) => {
        const assignee = a.assignee ? ` [负责人: ${a.assignee}]` : '';
        const due = a.dueDate ? ` [期限: ${a.dueDate}]` : '';
        md += `${idx + 1}. **${a.title}**${assignee}${due}\n`;
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
      const cleanName = newSpeakerName.trim();
      renameSpeaker(oldName, cleanName);

      // 同步注册到本地参会人档案
      const seedVec = new Array<number>(192).fill(0);
      const hash = Array.from(cleanName).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 192, 0);
      seedVec[hash] = 1.0;
      registerSpeakerProfile({
        displayName: cleanName,
        embedding: seedVec,
        sampleDurationMs: 6000,
        consented: true,
      });
    }
    setEditingSpeaker(null);
    setNewSpeakerName('');
  };

  // 点击左侧时码小气泡，联动右侧定位并更新播放器进度
  const handleSeekSegment = (segmentId?: string, timeStr?: string) => {
    if (segmentId) {
      setSelectedSegmentId(segmentId);
    }
    // 若匹配时码，转换为秒数模拟播放
    if (timeStr) {
      const parts = timeStr.replace(/[^0-9:]/g, '').split(':').map(Number);
      if (parts.length === 2) {
        setCurrentPlaybackSeconds(parts[0] * 60 + parts[1]);
      } else if (parts.length === 3) {
        setCurrentPlaybackSeconds(parts[0] * 3600 + parts[1] * 60 + parts[2]);
      }
    }
  };

  const currentHighlightId = selectedSegmentId || activeTargetSegmentId;

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
                data-testid="summary-page-btn-cancel-rename"
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
        className="px-6 border-b border-border-subtle bg-canvas flex items-center justify-between shrink-0 text-xs"
      >
        <div className="flex items-center gap-6">
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
            📊 结构化总结提炼（讯飞双栏看板）
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

        {/* 纪要子模式切换 (卡片看板 vs 结构化大纲) */}
        {activeTab === 'summary' && (
          <div className="flex items-center gap-1 bg-subtle p-0.5 rounded-lg border border-border-subtle my-2">
            <button
              type="button"
              data-testid="summary-page-btn-mode-cards"
              onClick={() => setSummaryMode('cards')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                summaryMode === 'cards'
                  ? 'bg-canvas text-brand-blue font-semibold shadow-xs'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              🎨 重点卡片看板
            </button>
            <button
              type="button"
              data-testid="summary-page-btn-mode-outline"
              onClick={() => setSummaryMode('outline')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                summaryMode === 'outline'
                  ? 'bg-canvas text-brand-blue font-semibold shadow-xs'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              📑 层级文本大纲
            </button>
          </div>
        )}
      </div>

      {/* 主体工作区 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'mindmap' ? (
          /* 思维导图全屏画布 */
          <div className="flex-1 p-6">
            <MeetingMindmap
              meeting={meeting}
              onSeekTimestamp={(timeStr) => handleSeekSegment(undefined, timeStr)}
            />
          </div>
        ) : activeTab === 'transcripts' ? (
          /* 单独逐字稿全宽列表 */
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            <div data-testid="summary-page-list-transcripts" className="space-y-3 max-w-4xl mx-auto">
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
                      t.id === currentHighlightId
                        ? 'bg-brand-blue/10 border-brand-blue ring-2 ring-brand-blue/30 shadow-xs'
                        : 'bg-subtle border-border-subtle hover:border-border-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span
                        data-testid={`summary-page-btn-speaker-${t.id}`}
                        onClick={() => {
                          setEditingSpeaker(t.speakerId || t.speaker);
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
          </div>
        ) : (
          /* 讯飞听见同款双栏联动工作台 (左侧卡片/大纲 + 右侧逐字稿与原声播放器) */
          <div className="flex-1 overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border-subtle">
            {/* 左栏：智能纪要看板 (56% 宽) */}
            <div
              data-testid="summary-page-panel-left"
              className="flex-1 md:w-[56%] overflow-y-auto p-6 space-y-6"
            >
              {/* 1. 全局主旨综述 */}
              <div
                data-testid="summary-page-card-overview"
                className="p-4 rounded-xl bg-panel border border-border-subtle space-y-2 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-text-primary">
                    <span>📋 全局主旨背景</span>
                  </div>
                  <span className="text-[10px] text-brand-blue bg-brand-blue/10 px-2 py-0.5 rounded-full font-medium">
                    核心脉络
                  </span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  {overviewText}
                </p>
              </div>

              {summaryMode === 'cards' ? (
                /* 讯飞同款彩色主题卡片看板 */
                <div
                  data-testid="summary-page-topic-cards-container"
                  className="space-y-6"
                >
                  {/* 章节 1：关键结论与决策 (绿色系) */}
                  <div
                    data-testid="summary-page-section-decisions"
                    className="space-y-3"
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-status-success">
                      <span>✦</span>
                      <span>关键结论与架构决策 ({decisions.length})</span>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {decisions.length === 0 ? (
                        <div className="p-4 rounded-xl bg-subtle border border-border-subtle text-xs text-text-tertiary text-center">
                          暂无提炼结论
                        </div>
                      ) : (
                        decisions.map((d, i) => (
                          <div
                            key={i}
                            data-testid={`summary-page-item-decision-${i}`}
                            className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/50 space-y-1.5 shadow-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                                {d.title}
                              </span>
                              {d.evidenceSegmentId && (
                                <button
                                  type="button"
                                  data-testid={`summary-pill-time-${d.evidenceSegmentId}`}
                                  onClick={() => handleSeekSegment(d.evidenceSegmentId, d.evidenceQuote)}
                                  className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white transition-colors flex items-center gap-1"
                                  title="点击在右侧定位逐字稿与原声"
                                >
                                  <span>⏱ {d.evidenceQuote || '00:15'}</span>
                                  <span>⤤</span>
                                </button>
                              )}
                            </div>
                            <div className="text-xs text-emerald-950/80 dark:text-emerald-200/80 leading-relaxed">
                              <span className="font-semibold text-emerald-900 dark:text-emerald-200">
                                【核心要点】：
                              </span>
                              {d.content}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* 章节 2：分步执行行动流 (蓝色系，讯飞听见核心特色) */}
                  <div
                    data-testid="summary-page-section-action-steps"
                    className="space-y-3"
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-brand-blue">
                      <span>✦</span>
                      <span>落地计划与分步执行流 ({actions.length})</span>
                    </div>

                    <div
                      data-testid="summary-page-section-actions"
                      className="p-4 rounded-xl bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/50 space-y-3"
                    >
                      {actions.length === 0 ? (
                        <div className="text-xs text-text-tertiary text-center py-2">
                          暂无执行待办
                        </div>
                      ) : (
                        actions.map((a, i) => {
                          const stepNames = ['第一步', '第二步', '第三步', '第四步', '第五步'];
                          const stepLabel = stepNames[i] || `步骤 ${i + 1}`;
                          return (
                            <div
                              key={i}
                              data-testid={`summary-page-item-action-${i}`}
                              className="p-3 rounded-lg bg-canvas border border-border-subtle flex items-start justify-between gap-3 shadow-xs"
                            >
                              <div className="flex items-start gap-2.5 min-w-0">
                                <span className="w-5 h-5 rounded-full bg-brand-blue text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                  {i + 1}
                                </span>
                                <div className="space-y-1 min-w-0">
                                  <div className="text-xs font-semibold text-text-primary">
                                    {stepLabel}：{a.title}
                                  </div>
                                  <div className="text-[11px] text-text-secondary leading-snug">
                                    <span className="font-medium text-text-primary">【执行细节】：</span>
                                    {('content' in a ? (a as any).content : undefined) || a.title}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="px-1.5 py-0.5 rounded bg-subtle text-[10px] text-text-secondary font-mono">
                                  👤 {a.assignee}
                                </span>
                                {a.dueDate && (
                                  <span className="px-1.5 py-0.5 rounded bg-subtle text-[10px] text-text-tertiary font-mono">
                                    📅 {a.dueDate}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* 章节 3：双列网格（风险争议 + 核心事实） */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 风险争议 */}
                    <div
                      data-testid="summary-page-section-risks"
                      className="p-3.5 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/40 space-y-2.5"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-amber-700 dark:text-amber-400">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          <span>风险预警与阻碍</span>
                        </span>
                        <span className="text-[10px] font-mono">{risks.length} 项</span>
                      </div>

                      <div className="space-y-2">
                        {risks.length === 0 ? (
                          <div className="text-[11px] text-text-tertiary py-2 text-center">
                            未识别到重大风险
                          </div>
                        ) : (
                          risks.map((r, i) => (
                            <div
                              key={i}
                              data-testid={`summary-page-item-risk-${i}`}
                              className="p-2.5 rounded-lg bg-canvas border border-amber-200/40 dark:border-amber-900/30 text-xs space-y-1 shadow-xs"
                            >
                              <div className="font-semibold text-amber-900 dark:text-amber-300">
                                {r.title}
                              </div>
                              <p className="text-[11px] text-text-secondary leading-snug">
                                <span className="font-medium text-amber-800 dark:text-amber-400">【潜在风险】：</span>
                                {r.content}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* 核心事实 */}
                    <div
                      data-testid="summary-page-section-facts"
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/30 border border-border-subtle space-y-2.5"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-text-primary">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-text-tertiary" />
                          <span>核心事实与背景</span>
                        </span>
                        <span className="text-[10px] font-mono">{facts.length} 项</span>
                      </div>

                      <div className="space-y-2">
                        {facts.length === 0 ? (
                          <div className="text-[11px] text-text-tertiary py-2 text-center">
                            暂无事实记录
                          </div>
                        ) : (
                          facts.map((f, i) => (
                            <div
                              key={i}
                              data-testid={`summary-page-item-fact-${i}`}
                              className="p-2.5 rounded-lg bg-canvas border border-border-subtle text-xs space-y-1 shadow-xs"
                            >
                              <div className="font-semibold text-text-primary">
                                {f.title}
                              </div>
                              <p className="text-[11px] text-text-secondary leading-snug">
                                <span className="font-medium text-text-primary">【事实依据】：</span>
                                {f.content}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* 讯飞听见同款严谨层级大纲文本视图 */
                <div
                  data-testid="summary-page-structured-outline"
                  className="p-5 rounded-xl bg-canvas border border-border-subtle space-y-4 text-xs font-sans shadow-xs"
                >
                  <div className="border-b border-border-subtle pb-3">
                    <h2 className="text-sm font-bold text-text-primary mb-1">
                      {meeting.title}
                    </h2>
                    <div className="text-[11px] text-text-tertiary font-mono space-x-2">
                      <span>参会人: {speakers.join(', ')}</span>
                      <span>·</span>
                      <span>记录日期: {meeting.date}</span>
                    </div>
                  </div>

                  {/* 一、关键决策与管理模式 */}
                  <div className="space-y-2">
                    <h3 className="font-bold text-text-primary text-xs">
                      一、核心决策与架构原则
                    </h3>
                    <div className="pl-4 space-y-1.5 border-l-2 border-brand-blue/30">
                      {decisions.map((d, i) => (
                        <div key={i} className="text-text-secondary leading-relaxed">
                          <span className="font-semibold text-text-primary">{i + 1}. {d.title}</span>：
                          <span>{d.content}</span>
                          {d.evidenceSegmentId && (
                            <button
                              type="button"
                              onClick={() => handleSeekSegment(d.evidenceSegmentId, d.evidenceQuote)}
                              className="ml-2 text-[10px] text-brand-blue hover:underline font-mono"
                            >
                              [依据定位 ⤤]
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 二、待办行动清单 */}
                  <div className="space-y-2">
                    <h3 className="font-bold text-text-primary text-xs">
                      二、行动待办与落实排期
                    </h3>
                    <div className="pl-4 space-y-1.5 border-l-2 border-indigo-500/30">
                      {actions.map((a, i) => (
                        <div key={i} className="text-text-secondary leading-relaxed">
                          <span className="font-semibold text-text-primary">{i + 1}. {a.title}</span>
                          <span className="text-text-tertiary text-[11px]">（责任人: {a.assignee} · 交付: {a.dueDate}）</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 三、风险与事实归因 */}
                  {(risks.length > 0 || facts.length > 0) && (
                    <div className="space-y-2">
                      <h3 className="font-bold text-text-primary text-xs">
                        三、风险关注与背景事实
                      </h3>
                      <div className="pl-4 space-y-1.5 border-l-2 border-amber-500/30 text-text-secondary">
                        {risks.map((r, i) => (
                          <div key={i}>• [风险] {r.title}：{r.content}</div>
                        ))}
                        {facts.map((f, i) => (
                          <div key={i}>• [事实] {f.title}：{f.content}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 右栏：全息证据库（逐字稿 + 播放器控制器，44% 宽） */}
            <div
              data-testid="summary-page-panel-right"
              className="flex-1 md:w-[44%] flex flex-col bg-subtle/40 overflow-hidden"
            >
              {/* 右栏顶部标签条 */}
              <div className="px-4 py-2.5 bg-canvas border-b border-border-subtle flex items-center justify-between text-xs shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-text-primary flex items-center gap-1.5">
                    <span>🎙️ 现场录音与逐字稿</span>
                  </span>
                  <span className="text-[11px] text-text-tertiary tabular-nums">
                    （{transcripts.length} 句）
                  </span>
                </div>
                <div className="text-[11px] text-brand-blue font-mono">
                  ● 支持点击左侧气泡定位
                </div>
              </div>

              {/* 逐字稿滚动列表 */}
              <div
                ref={transcriptsContainerRef}
                data-testid="summary-page-list-transcripts"
                className="flex-1 overflow-y-auto p-4 space-y-3"
              >
                {transcripts.length === 0 ? (
                  <div className="text-center py-12 text-xs text-text-tertiary">
                    本场会议暂无逐字稿记录
                  </div>
                ) : (
                  transcripts.map((t) => {
                    const isHighlighted = t.id === currentHighlightId;
                    return (
                      <div
                        key={t.id}
                        id={`summary-seg-${t.id}`}
                        data-testid={`summary-page-row-transcript-${t.id}`}
                        className={`p-3 rounded-xl border transition-all space-y-1 ${
                          isHighlighted
                            ? 'bg-brand-blue/10 border-brand-blue ring-2 ring-brand-blue/40 shadow-sm'
                            : 'bg-canvas border-border-subtle hover:border-border-strong'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span
                            data-testid={`summary-page-btn-speaker-${t.id}`}
                            onClick={() => {
                              setEditingSpeaker(t.speakerId || t.speaker);
                              setNewSpeakerName(t.speaker);
                            }}
                            className="font-semibold text-text-primary hover:text-brand-blue cursor-pointer transition-colors"
                            title="点击重命名发言人"
                          >
                            👤 {t.speaker}
                          </span>
                          <span className="font-mono text-[10px] text-text-tertiary tabular-nums">
                            {t.timestamp}
                          </span>
                        </div>
                        <p className="text-xs text-text-secondary leading-relaxed">{t.text}</p>
                      </div>
                    );
                  })
                )}
              </div>

              {/* 底部原生/模拟音频播放控制器 (讯飞同款底部控制台) */}
              <div
                data-testid="summary-page-audio-player"
                className="p-3 bg-canvas border-t border-border-subtle flex flex-col gap-2 shrink-0 select-none shadow-xs"
              >
                {/* 进度条 */}
                <div className="flex items-center gap-3 text-xs font-mono text-text-tertiary">
                  <span className="tabular-nums text-[11px]">
                    {formatSeconds(currentPlaybackSeconds)}
                  </span>
                  <div className="flex-1 h-1.5 bg-subtle rounded-full overflow-hidden relative cursor-pointer">
                    <div
                      style={{
                        width: `${Math.min(
                          100,
                          (currentPlaybackSeconds / Math.max(1, meeting.durationSeconds)) * 100
                        )}%`,
                      }}
                      className="h-full bg-brand-blue transition-all"
                    />
                  </div>
                  <span className="tabular-nums text-[11px]">
                    {formatSeconds(meeting.durationSeconds)}
                  </span>
                </div>

                {/* 控制按钮与倍速 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid="summary-page-btn-audio-play"
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="px-3 py-1 rounded-md bg-brand-blue text-white text-xs font-semibold hover:bg-brand-blue-hover transition-colors flex items-center gap-1"
                    >
                      <span>{isPlaying ? '⏸ 暂停' : '▶ 播放'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentPlaybackSeconds((s) => Math.max(0, s - 15))
                      }
                      className="px-2 py-1 rounded bg-subtle border border-border-subtle hover:bg-hover text-xs text-text-secondary font-mono"
                      title="后退 15 秒"
                    >
                      -15s
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentPlaybackSeconds((s) =>
                          Math.min(meeting.durationSeconds, s + 15)
                        )
                      }
                      className="px-2 py-1 rounded bg-subtle border border-border-subtle hover:bg-hover text-xs text-text-secondary font-mono"
                      title="快进 15 秒"
                    >
                      +15s
                    </button>
                  </div>

                  <div className="flex items-center gap-1 text-[11px] font-mono">
                    {[1.0, 1.25, 1.5, 2.0].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setPlaybackRate(rate)}
                        className={`px-1.5 py-0.5 rounded transition-colors ${
                          playbackRate === rate
                            ? 'bg-brand-blue text-white font-bold'
                            : 'text-text-tertiary hover:text-text-primary'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
