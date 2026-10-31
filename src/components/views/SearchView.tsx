import React, { useState } from 'react';
import { formatSeconds } from '../../utils/formatTime';

export const SearchView: React.FC = () => {
  const [query, setQuery] = useState('音频');
  const [playingSegment, setPlayingSegment] = useState<string | null>(null);

  // 模拟 FTS5 trigram 毫秒级全文检索与高亮
  const searchResults = [
    {
      id: 'res_1',
      meetingTitle: 'M1 双轨音频架构与断电自愈技术评审',
      date: '2026-10-30',
      timestampMs: 45000,
      speaker: '老朱 (系统架构)',
      snippet: '研发团队表示 WASAPI 原生<b>音频</b>采集方案已调通，接下来重点攻关断电自愈测试。',
      sliceIndex: 22,
      offsetInSliceMs: 1000,
    },
    {
      id: 'res_2',
      meetingTitle: 'M1 双轨音频架构与断电自愈技术评审',
      date: '2026-10-30',
      timestampMs: 120000,
      speaker: '李工 (Rust引擎)',
      snippet: '无锁环形缓冲区在<b>音频</b>高频回调中必须做到零堆分配，避免引发不可预知的 GC 抖动。',
      sliceIndex: 60,
      offsetInSliceMs: 0,
    },
    {
      id: 'res_3',
      meetingTitle: '听序商用计费与微信支付架构对齐会',
      date: '2026-10-29',
      timestampMs: 78000,
      speaker: '王总 (商业化)',
      snippet: '现阶段我们严格采用会议时长包期，将所有的<b>音频</b>转写与 AI 大模型能力全包入套餐。',
      sliceIndex: 39,
      offsetInSliceMs: 0,
    },
  ].filter((r) => !query.trim() || r.snippet.includes(query) || r.meetingTitle.includes(query));

  const handlePlayAudio = (resId: string) => {
    setPlayingSegment(resId);
    setTimeout(() => setPlayingSegment(null), 3000);
  };

  const handleExportMarkdown = (title: string) => {
    const mdContent = `# ${title}\n\n## 会议概述\n本纪要由听序（Tingxu）在本地安全导出，完全保护个人隐私主权。\n\n## 核心结论\n1. 方案全量跑通\n2. 零云端隐私上传\n`;
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
      <div>
        <h1 className="text-xl font-bold text-text-primary tracking-tight">历史全文检索</h1>
        <p className="text-xs text-text-secondary mt-1">
          基于本地 SQLite FTS5 毫秒级中文全文索引，无网离线亦可秒级溯源
        </p>
      </div>

      <div className="p-4 rounded-xl bg-panel border border-border-subtle space-y-4">
        <div className="relative">
          <input
            type="text"
            data-testid="search-page-input-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入技术关键词、结论或发言人名字（例如：音频、断电、微信）..."
            className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-subtle border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-brand-blue"
          />
          <span className="absolute left-3 top-3 text-text-tertiary text-xs">⌕</span>
        </div>

        <div className="flex items-center justify-between text-xs text-text-tertiary px-1">
          <span>检索耗时: 8ms · 命中 {searchResults.length} 条记录</span>
          <span>Local SQLite FTS5 WAL 引擎</span>
        </div>

        <div className="space-y-3">
          {searchResults.map((res) => (
            <div
              key={res.id}
              data-testid={`search-page-result-${res.id}`}
              className="p-4 rounded-lg bg-subtle border border-border-subtle hover:border-brand-blue/40 transition-all space-y-2.5"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-text-primary">{res.meetingTitle}</span>
                <span className="font-mono text-text-tertiary">{res.date}</span>
              </div>

              <div
                className="text-xs text-text-secondary leading-relaxed bg-canvas p-2.5 rounded border border-border-subtle font-sans"
                dangerouslySetInnerHTML={{ __html: res.snippet }}
              />

              <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-[11px]">
                <div className="flex items-center gap-2 text-text-tertiary font-mono">
                  <span>发言人: {res.speaker}</span>
                  <span>·</span>
                  <span className="tabular-nums">时间: {formatSeconds(Math.floor(res.timestampMs / 1000))}</span>
                  <span>·</span>
                  <span className="text-[10px] text-text-secondary">
                    (对齐分片 #{res.sliceIndex} +{res.offsetInSliceMs}ms)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid={`search-page-btn-play-${res.id}`}
                    onClick={() => handlePlayAudio(res.id)}
                    className="px-2.5 py-1 rounded bg-panel border border-border-subtle text-brand-blue hover:underline font-medium text-xs flex items-center gap-1"
                  >
                    {playingSegment === res.id ? '🔊 正在播放PCM...' : '▶ 试听该段原音'}
                  </button>

                  <button
                    type="button"
                    data-testid={`search-page-btn-export-${res.id}`}
                    onClick={() => handleExportMarkdown(res.meetingTitle)}
                    className="px-2.5 py-1 rounded bg-panel border border-border-subtle text-text-secondary hover:text-text-primary text-xs"
                  >
                    ⬇ 导出 Markdown
                  </button>
                </div>
              </div>
            </div>
          ))}

          {searchResults.length === 0 && (
            <div className="py-12 text-center text-xs text-text-tertiary">
              未找到与「{query}」相关的会议逐字稿或结论
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
