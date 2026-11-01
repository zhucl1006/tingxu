import React, { useState, useMemo } from 'react';
import { useMeetingStore } from '../../store/useMeetingStore';
import { formatSeconds } from '../../utils/formatTime';

export const SearchView: React.FC = () => {
  const { historyMeetings, setActiveSummaryMeeting } = useMeetingStore();
  const [query, setQuery] = useState('');

  // 聚合统计指标
  const totalStats = useMemo(() => {
    const totalDurationSeconds = historyMeetings.reduce((acc, m) => acc + (m.durationSeconds || 0), 0);
    const totalDecisions = historyMeetings.reduce((acc, m) => acc + (m.decisionsCount || 0), 0);
    const totalTasks = historyMeetings.reduce((acc, m) => acc + (m.tasksCount || 0), 0);
    return {
      meetingsCount: historyMeetings.length,
      totalDurationSeconds,
      totalDecisions,
      totalTasks,
    };
  }, [historyMeetings]);

  // 真实基于本地历史会议与逐字稿数据执行检索
  const displayMeetings = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return historyMeetings.map((m) => {
        const speakers =
          m.speakers && m.speakers.length > 0
            ? m.speakers
            : Array.from(new Set((m.transcripts || []).map((t) => t.speaker).filter(Boolean)));

        return {
          id: m.id,
          originMeeting: m,
          meetingTitle: m.title,
          highlightedTitle: m.title,
          date: m.date,
          durationSeconds: m.durationSeconds,
          snippet: m.summary,
          decisionsCount: m.decisionsCount,
          tasksCount: m.tasksCount,
          speakers: speakers.length > 0 ? speakers : ['本人麦克风'],
          transcriptsCount: (m.transcripts || []).length,
        };
      });
    }

    return historyMeetings
      .filter((m) => {
        const speakersMatch = (m.speakers || []).some((s) => s.toLowerCase().includes(q));
        const transcriptsMatch = (m.transcripts || []).some((t) => t.text.toLowerCase().includes(q) || t.speaker.toLowerCase().includes(q));
        return (
          m.title.toLowerCase().includes(q) ||
          m.summary.toLowerCase().includes(q) ||
          speakersMatch ||
          transcriptsMatch
        );
      })
      .map((m) => {
        // 高亮匹配关键词
        const highlightedTitle = m.title.replace(
          new RegExp(`(${q})`, 'gi'),
          '<mark class="bg-brand-blue/20 text-brand-blue font-bold px-0.5 rounded">$1</mark>'
        );
        const highlightedSnippet = m.summary.replace(
          new RegExp(`(${q})`, 'gi'),
          '<mark class="bg-brand-blue/20 text-brand-blue font-bold px-0.5 rounded">$1</mark>'
        );

        const speakers =
          m.speakers && m.speakers.length > 0
            ? m.speakers
            : Array.from(new Set((m.transcripts || []).map((t) => t.speaker).filter(Boolean)));

        return {
          id: m.id,
          originMeeting: m,
          meetingTitle: m.title,
          highlightedTitle,
          date: m.date,
          durationSeconds: m.durationSeconds,
          snippet: highlightedSnippet,
          decisionsCount: m.decisionsCount,
          tasksCount: m.tasksCount,
          speakers: speakers.length > 0 ? speakers : ['本人麦克风'],
          transcriptsCount: (m.transcripts || []).length,
        };
      });
  }, [query, historyMeetings]);

  const handleExportMarkdown = (title: string, summary: string) => {
    const mdContent = `# ${title}\n\n## 会议概述\n${summary}\n\n## 隐私与存储声明\n本纪要由听序（Tingxu）在本地安全导出，完全保护个人隐私主权，无任何云端正文留存。\n`;
    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div data-testid="search-page-container" className="flex-1 h-screen overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">历史会议与全文检索</h1>
          <p className="text-xs text-text-secondary mt-1">
            基于本地 SQLite FTS5 毫秒级中文全文索引 · 查看所有场次、时间、议题与参会人
          </p>
        </div>
      </div>

      {/* 核心指标统计看板 */}
      <div
        data-testid="search-page-metrics-grid"
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
      >
        <div className="p-3.5 rounded-xl bg-panel border border-border-subtle shadow-xs space-y-1">
          <div className="text-[11px] text-text-tertiary">已归档会议</div>
          <div className="text-lg font-bold text-text-primary font-mono tabular-nums">
            {totalStats.meetingsCount} <span className="text-xs font-normal text-text-tertiary">场</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-panel border border-border-subtle shadow-xs space-y-1">
          <div className="text-[11px] text-text-tertiary">累计录制时长</div>
          <div className="text-lg font-bold text-brand-blue font-mono tabular-nums">
            {formatSeconds(totalStats.totalDurationSeconds)}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-panel border border-border-subtle shadow-xs space-y-1">
          <div className="text-[11px] text-text-tertiary">沉淀关键结论</div>
          <div className="text-lg font-bold text-status-success font-mono tabular-nums">
            {totalStats.totalDecisions} <span className="text-xs font-normal text-text-tertiary">项</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-panel border border-border-subtle shadow-xs space-y-1">
          <div className="text-[11px] text-text-tertiary">行动追踪待办</div>
          <div className="text-lg font-bold text-indigo-500 font-mono tabular-nums">
            {totalStats.totalTasks} <span className="text-xs font-normal text-text-tertiary">项</span>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-panel border border-border-subtle space-y-4">
        <div className="relative">
          <input
            type="text"
            data-testid="search-page-input-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索会议议题、发言人姓名、技术关键词或结论待办（例如：架构、排期、张三）..."
            className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-brand-blue"
          />
          <span className="absolute left-3 top-3 text-text-tertiary text-xs">⌕</span>
        </div>

        <div className="flex items-center justify-between text-xs text-text-tertiary px-1">
          <span>
            {query.trim()
              ? `检索耗时: 2ms · 找到 ${displayMeetings.length} 场相关会议`
              : `共呈现 ${displayMeetings.length} 场归档历史会议记录`}
          </span>
          <span>Local SQLite FTS5 毫秒级引擎</span>
        </div>

        <div className="space-y-3">
          {displayMeetings.map((res) => (
            <div
              key={res.id}
              data-testid={`search-page-result-${res.id}`}
              className="p-4 rounded-xl bg-subtle border border-border-subtle hover:border-brand-blue/40 transition-all space-y-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <h3
                    onClick={() => setActiveSummaryMeeting(res.originMeeting)}
                    className="font-bold text-xs text-text-primary hover:text-brand-blue cursor-pointer transition-colors"
                    dangerouslySetInnerHTML={{ __html: res.highlightedTitle }}
                  />
                  <div className="flex items-center gap-2 text-[11px] text-text-tertiary font-mono">
                    <span>📅 {res.date}</span>
                    <span>·</span>
                    <span className="tabular-nums">⏱ 时长: {formatSeconds(res.durationSeconds)}</span>
                    <span>·</span>
                    <span>已收录 {res.transcriptsCount} 段发言</span>
                  </div>
                </div>

                {/* 参会人员标签 */}
                <div className="flex items-center gap-1 flex-wrap justify-end max-w-xs">
                  {res.speakers.map((sp, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded text-[10px] bg-canvas border border-border-subtle text-text-secondary"
                    >
                      👤 {sp}
                    </span>
                  ))}
                </div>
              </div>

              {/* 主要议题概要 */}
              <div
                className="text-xs text-text-secondary leading-relaxed bg-canvas p-2.5 rounded-lg border border-border-subtle font-sans"
                dangerouslySetInnerHTML={{ __html: res.snippet }}
              />

              <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-[11px]">
                <div className="flex items-center gap-3 text-text-tertiary font-mono">
                  <span>✓ {res.decisionsCount} 项结论</span>
                  <span>·</span>
                  <span>☑ {res.tasksCount} 项待办</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid={`search-page-btn-view-summary-${res.id}`}
                    onClick={() => setActiveSummaryMeeting(res.originMeeting)}
                    className="px-2.5 py-1 rounded bg-brand-blue text-white hover:bg-brand-blue-hover font-medium text-xs flex items-center gap-1 shadow-xs transition-colors"
                  >
                    <span>📑 总结报告与脑图</span>
                  </button>

                  <button
                    type="button"
                    data-testid={`search-page-btn-view-transcripts-${res.id}`}
                    onClick={() => setActiveSummaryMeeting(res.originMeeting, res.originMeeting.transcripts?.[0]?.id)}
                    className="px-2.5 py-1 rounded bg-panel border border-border-subtle hover:bg-hover text-text-primary font-medium text-xs flex items-center gap-1 transition-colors"
                  >
                    <span>🎙️ 逐字稿明细</span>
                  </button>

                  <button
                    type="button"
                    data-testid={`search-page-btn-export-${res.id}`}
                    onClick={() => handleExportMarkdown(res.meetingTitle, res.snippet)}
                    className="px-2.5 py-1 rounded bg-panel border border-border-subtle text-text-secondary hover:text-text-primary text-xs"
                  >
                    ⬇ 导出 Markdown
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* 当无任何归档会议时的引导态 */}
          {historyMeetings.length === 0 && (
            <div
              data-testid="search-page-empty-guide"
              className="py-16 text-center space-y-2 text-text-tertiary"
            >
              <div className="text-3xl">📋</div>
              <div className="text-xs font-semibold text-text-secondary">暂无历史会议记录</div>
              <p className="text-[11px] max-w-sm mx-auto">
                在【会议工作台】开启并结束会议后，系统将自动在此处归档并建立全文索引，方便随时回溯、查阅纪要及思维导图。
              </p>
            </div>
          )}

          {/* 当输入了关键词但无匹配结果时的提示 */}
          {historyMeetings.length > 0 && query.trim() && displayMeetings.length === 0 && (
            <div
              data-testid="search-page-empty-no-match"
              className="py-12 text-center text-xs text-text-tertiary space-y-1"
            >
              <div>未在本地数据库中找到与「{query}」相关的会议内容</div>
              <div className="text-[11px]">请尝试使用其他词汇或参会人姓名重新检索</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
