import React, { useState, useMemo, useRef, useEffect } from 'react';
import { HistoryMeeting } from '../types/meeting';
import { formatSeconds } from '../utils/formatTime';

export interface MeetingMindmapProps {
  meeting: HistoryMeeting;
  onSeekSegment?: (segmentId: string) => void;
  onSeekTimestamp?: (timestamp: string) => void;
}

export interface MindmapNode {
  id: string;
  title: string;
  type: 'root' | 'overview' | 'decision' | 'action' | 'risk' | 'fact' | 'participants';
  detail?: string;
  badge?: string;
  meta?: string;
  timeQuote?: string;
  evidenceSegmentId?: string;
  children?: MindmapNode[];
}

export const MeetingMindmap: React.FC<MeetingMindmapProps> = ({ meeting, onSeekTimestamp, onSeekSegment }) => {
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [copiedType, setCopiedType] = useState<'md' | 'mermaid' | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stop = () => { dragRef.current = null; setIsDragging(false); };
    const move = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setPan({ x: drag.x + event.clientX - drag.startX, y: drag.y + event.clientY - drag.startY });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('blur', stop);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return; // 保留浏览器原生捏合缩放。
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      setPan(previous => ({ x: previous.x - event.deltaX * unit, y: previous.y - event.deltaY * unit }));
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => canvas.removeEventListener('wheel', wheel);
  }, []);

  const summary = meeting.structuredSummary;
  const insights = meeting.insights || [];
  const transcripts = meeting.transcripts || [];

  // 计算参会人员
  const speakers = useMemo(() => {
    if (meeting.speakers && meeting.speakers.length > 0) return meeting.speakers;
    const derived = Array.from(new Set(transcripts.map((t) => t.speaker).filter(Boolean)));
    return derived.length > 0 ? derived : ['本人麦克风'];
  }, [meeting.speakers, transcripts]);

  // 构造脑图树结构
  const rootNode: MindmapNode = useMemo(() => {
    const branches: MindmapNode[] = [];

    // 1. 全局综述分支
    const overviewText = summary?.overview || meeting.summary;
    if (overviewText) {
      branches.push({
        id: 'branch-overview',
        title: '📋 会议全局主旨',
        type: 'overview',
        children: [
          {
            id: 'node-overview-text',
            title: '主旨概要',
            detail: overviewText,
            type: 'overview',
          },
        ],
      });
    }

    // 2. 关键结论与决策分支
    const decisions = summary?.decisions || insights.filter((i) => i.type === 'decision').map((d) => ({
      title: d.title,
      content: d.content,
      evidenceQuote: d.timestamp,
      evidenceSegmentId: d.evidenceSegmentId,
    }));
    if (decisions.length > 0) {
      branches.push({
        id: 'branch-decisions',
        title: `💡 关键结论与决策 (${decisions.length})`,
        type: 'decision',
        children: decisions.map((d, idx) => ({
          id: `node-decision-${idx}`,
          title: d.title,
          detail: d.content,
          timeQuote: transcripts.find(t => t.id === d.evidenceSegmentId)?.timestamp || d.evidenceQuote,
          evidenceSegmentId: d.evidenceSegmentId,
          meta: d.evidenceQuote ? `依据: ${d.evidenceQuote}` : undefined,
          type: 'decision',
        })),
      });
    }

    // 3. 行动待办分支
    const actions = summary?.actions || insights.filter((i) => i.type === 'action').map((a) => ({
      title: a.title,
      content: a.content,
      assignee: '待确认',
      dueDate: '尽快推进',
      evidenceSegmentId: a.evidenceSegmentId,
      evidenceQuote: a.timestamp,
    }));
    if (actions.length > 0) {
      branches.push({
        id: 'branch-actions',
        title: `☑️ 行动待办与分工 (${actions.length})`,
        type: 'action',
        children: actions.map((a, idx) => ({
          id: `node-action-${idx}`,
          title: a.title,
          detail: ('content' in a ? (a as any).content : undefined) || a.title,
          evidenceSegmentId: a.evidenceSegmentId,
          timeQuote: transcripts.find(t => t.id === a.evidenceSegmentId)?.timestamp || a.evidenceQuote,
          badge: a.assignee ? `👤 ${a.assignee}` : undefined,
          meta: a.dueDate ? `📅 期限: ${a.dueDate}` : undefined,
          type: 'action',
        })),
      });
    }

    // 4. 风险争议分支
    const risks = summary?.risks || insights.filter((i) => i.type === 'risk').map((r) => ({
      title: r.title,
      content: r.content,
    }));
    if (risks.length > 0) {
      branches.push({
        id: 'branch-risks',
        title: `⚠️ 风险争议与关注 (${risks.length})`,
        type: 'risk',
        children: risks.map((r, idx) => ({
          id: `node-risk-${idx}`,
          title: r.title,
          detail: r.content,
          type: 'risk',
        })),
      });
    }

    // 5. 核心事实分支
    const facts = summary?.facts || insights.filter((i) => i.type === 'fact').map((f) => ({
      title: f.title,
      content: f.content,
    }));
    if (facts.length > 0) {
      branches.push({
        id: 'branch-facts',
        title: `📌 核心事实与数据 (${facts.length})`,
        type: 'fact',
        children: facts.map((f, idx) => ({
          id: `node-fact-${idx}`,
          title: f.title,
          detail: f.content,
          type: 'fact',
        })),
      });
    }

    // 6. 参会人与发言贡献分支
    if (speakers.length > 0) {
      branches.push({
        id: 'branch-participants',
        title: `👥 参会人画像 (${speakers.length})`,
        type: 'participants',
        children: speakers.map((s, idx) => {
          const speakerSegments = transcripts.filter((t) => t.speaker === s);
          const totalSpeakerChars = speakerSegments.reduce((acc, t) => acc + t.text.length, 0);
          return {
            id: `node-speaker-${idx}`,
            title: s,
            badge: `${speakerSegments.length} 次发言`,
            meta: `发言约 ${totalSpeakerChars} 字`,
            type: 'participants',
          };
        }),
      });
    }

    return {
      id: 'root',
      title: meeting.title,
      type: 'root',
      meta: `${meeting.date} · 时长 ${formatSeconds(meeting.durationSeconds)} · ${transcripts.length} 段发言`,
      children: branches,
    };
  }, [meeting, summary, insights, transcripts, speakers]);

  // 左右双向发散分配：左翼与右翼
  const { leftBranches, rightBranches } = useMemo(() => {
    const all = rootNode.children || [];
    const left: MindmapNode[] = [];
    const right: MindmapNode[] = [];

    all.forEach((branch) => {
      // 综述、风险、事实放在左侧；结论、待办、参会人放在右侧，保持平衡
      if (['branch-overview', 'branch-risks', 'branch-facts'].includes(branch.id)) {
        left.push(branch);
      } else {
        right.push(branch);
      }
    });

    // 若某一侧为空，则按均分
    if (left.length === 0 || right.length === 0) {
      const half = Math.ceil(all.length / 2);
      return { leftBranches: all.slice(0, half), rightBranches: all.slice(half) };
    }

    return { leftBranches: left, rightBranches: right };
  }, [rootNode]);

  // 节点折叠切换
  const toggleCollapse = (nodeId: string) => {
    setCollapsedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  // 生成 Markdown 树状大纲
  const generateMarkdownOutline = (): string => {
    let md = `# ${rootNode.title}\n`;
    if (rootNode.meta) md += `> ${rootNode.meta}\n\n`;

    rootNode.children?.forEach((b) => {
      md += `## ${b.title}\n`;
      b.children?.forEach((c) => {
        md += `- **${c.title}**`;
        if (c.detail && c.detail !== c.title) md += `：${c.detail}`;
        if (c.badge) md += ` [${c.badge}]`;
        if (c.meta) md += ` (${c.meta})`;
        md += '\n';
      });
      md += '\n';
    });

    return md;
  };

  // 生成 Mermaid mindmap 代码
  const generateMermaidCode = (): string => {
    let m = `mindmap\n  root(("${rootNode.title.replace(/[\(\)\[\]"]/g, '')}"))\n`;
    rootNode.children?.forEach((b) => {
      const cleanBranch = b.title.replace(/[\(\)\[\]"]/g, '');
      m += `    ${cleanBranch}\n`;
      b.children?.forEach((c) => {
        const cleanChild = c.title.replace(/[\(\)\[\]"]/g, '');
        m += `      ${cleanChild}\n`;
      });
    });
    return m;
  };

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(generateMarkdownOutline()).then(() => {
      setCopiedType('md');
      setTimeout(() => setCopiedType(null), 2000);
    });
  };

  const handleCopyMermaid = () => {
    navigator.clipboard.writeText(generateMermaidCode()).then(() => {
      setCopiedType('mermaid');
      setTimeout(() => setCopiedType(null), 2000);
    });
  };

  // 节点样式映射
  const getBranchColor = (type: MindmapNode['type']) => {
    switch (type) {
      case 'overview':
        return {
          border: 'border-brand-blue/30',
          bg: 'bg-brand-blue/5',
          pill: 'bg-brand-blue/15 text-brand-blue',
          accent: '#2563EB',
          dot: 'bg-brand-blue',
        };
      case 'decision':
        return {
          border: 'border-status-success/40',
          bg: 'bg-status-success/5',
          pill: 'bg-status-success/15 text-status-success',
          accent: '#10B981',
          dot: 'bg-status-success',
        };
      case 'action':
        return {
          border: 'border-indigo-500/30',
          bg: 'bg-indigo-50/10 dark:bg-indigo-950/20',
          pill: 'bg-indigo-500/15 text-indigo-500',
          accent: '#6366F1',
          dot: 'bg-indigo-500',
        };
      case 'risk':
        return {
          border: 'border-amber-500/40',
          bg: 'bg-amber-500/5',
          pill: 'bg-amber-500/15 text-amber-500',
          accent: '#F59E0B',
          dot: 'bg-amber-500',
        };
      case 'fact':
        return {
          border: 'border-border-strong',
          bg: 'bg-panel',
          pill: 'bg-subtle text-text-secondary',
          accent: '#6B7280',
          dot: 'bg-slate-400',
        };
      case 'participants':
        return {
          border: 'border-purple-500/30',
          bg: 'bg-purple-500/5',
          pill: 'bg-purple-500/15 text-purple-500',
          accent: '#8B5CF6',
          dot: 'bg-purple-500',
        };
      default:
        return {
          border: 'border-border-subtle',
          bg: 'bg-subtle',
          pill: 'bg-panel text-text-primary',
          accent: '#3B82F6',
          dot: 'bg-brand-blue',
        };
    }
  };

  // 渲染单个主分支卡片
  const renderBranchCard = (branch: MindmapNode, alignLeft: boolean) => {
    const colors = getBranchColor(branch.type);
    const isCollapsed = !!collapsedNodes[branch.id];

    return (
      <div
        key={branch.id}
        data-testid={`meeting-mindmap-branch-${branch.id}`}
        className={`w-[310px] rounded-xl border ${colors.border} ${colors.bg} p-3.5 transition-all shadow-xs flex flex-col`}
      >
        {/* 分支标题条 */}
        <div className={`flex items-center justify-between gap-2 ${alignLeft ? 'flex-row-reverse' : ''}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`} />
            <span className={`px-2 py-0.5 rounded text-xs font-semibold truncate ${colors.pill}`}>
              {branch.title}
            </span>
          </div>

          <button
            type="button"
            data-testid={`meeting-mindmap-btn-collapse-${branch.id}`}
            onClick={() => toggleCollapse(branch.id)}
            className="px-2 py-0.5 rounded text-[11px] text-text-tertiary hover:text-text-primary bg-canvas border border-border-subtle font-mono transition-colors shrink-0"
          >
            {isCollapsed ? `[+] (${branch.children?.length || 0})` : '[-] 折叠'}
          </button>
        </div>

        {/* 分支子节点列表 */}
        {!isCollapsed && branch.children && (
          <div className={`mt-3 space-y-2.5 ${alignLeft ? 'pr-2 border-r-2' : 'pl-2 border-l-2'} border-border-subtle/70`}>
            {branch.children.map((child) => (
              <div
                key={child.id}
                data-testid={`meeting-mindmap-node-${child.id}`}
                className="p-2.5 rounded-lg bg-canvas border border-border-subtle hover:border-brand-blue/30 transition-all text-xs space-y-1 shadow-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-text-primary flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                    <span>• {child.title}</span>
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {child.timeQuote && (
                      <button
                        type="button"
                        data-testid={`meeting-mindmap-badge-time-${child.id}`}
                        onClick={() => child.evidenceSegmentId && onSeekSegment ? onSeekSegment(child.evidenceSegmentId) : onSeekTimestamp?.(child.timeQuote!)}
                        className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-subtle text-brand-blue hover:bg-brand-blue hover:text-white cursor-pointer transition-colors"
                        title="点击定位现场原声与逐字稿"
                      >
                        ⏱ {child.timeQuote}
                      </button>
                    )}
                    {child.badge && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-subtle text-text-secondary">
                        {child.badge}
                      </span>
                    )}
                  </div>
                </div>

                {child.detail && child.detail !== child.title && (
                  <p className="text-[11px] text-text-secondary leading-relaxed pl-2.5">
                    {child.detail}
                  </p>
                )}

                {child.meta && (
                  <div className="text-[10px] text-text-tertiary font-mono pl-2.5">
                    {child.meta}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      data-testid="meeting-mindmap-container"
      className={`flex flex-col bg-subtle/50 rounded-xl border border-border-subtle overflow-hidden select-none transition-all ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none border-none bg-canvas h-screen w-screen'
          : 'h-full w-full'
      }`}
    >
      {/* 顶部思维导图工具栏 */}
      <div
        data-testid="meeting-mindmap-toolbar"
        className="px-4 py-2.5 bg-canvas border-b border-border-subtle flex items-center justify-between text-xs shrink-0"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-text-primary flex items-center gap-1.5">
            <span>🧠 听序思维导图</span>
          </span>
          <span data-testid="summary-page-mindmap-text-navigation-help" className="text-[11px] text-text-tertiary hidden sm:inline">
            拖动画布查看 · 滚轮平移 · ↺ 回到中心
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 缩放控制器 */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-subtle border border-border-subtle font-mono text-[11px]">
            <button
              type="button"
              data-testid="meeting-mindmap-btn-zoom-out"
              onClick={() => setZoomLevel((z) => Math.max(60, z - 10))}
              className="px-1 hover:text-brand-blue"
              title="缩小"
            >
              -
            </button>
            <span className="tabular-nums px-1">{zoomLevel}%</span>
            <button
              type="button"
              data-testid="meeting-mindmap-btn-zoom-in"
              onClick={() => setZoomLevel((z) => Math.min(140, z + 10))}
              className="px-1 hover:text-brand-blue"
              title="放大"
            >
              +
            </button>
            <button
              type="button"
              data-testid="meeting-mindmap-btn-zoom-reset"
              onClick={() => { dragRef.current = null; setIsDragging(false); setZoomLevel(100); setPan({ x: 0, y: 0 }); }}
              className="text-[10px] text-text-tertiary hover:text-text-primary ml-1"
              title="回到中心并重置缩放"
              aria-label="回到中心并重置缩放"
            >
              ↺
            </button>
          </div>

          {/* 全屏切换 */}
          <button
            type="button"
            data-testid="meeting-mindmap-btn-fullscreen"
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="px-2.5 py-1 rounded bg-panel border border-border-subtle hover:bg-hover text-text-primary text-xs font-medium transition-colors"
            title={isFullscreen ? '退出全屏' : '全屏展开导图'}
          >
            {isFullscreen ? '✕ 退出全屏' : '⛶ 全屏'}
          </button>

          {/* 复制工具 */}
          <button
            type="button"
            data-testid="meeting-mindmap-btn-copy-mermaid"
            onClick={handleCopyMermaid}
            className="px-2.5 py-1 rounded bg-panel border border-border-subtle hover:bg-hover text-text-primary text-xs font-medium transition-colors hidden md:inline-flex"
          >
            {copiedType === 'mermaid' ? '✓ 已复制 Mermaid' : '📋 复制 Mermaid'}
          </button>
          <button
            type="button"
            data-testid="meeting-mindmap-btn-copy-markdown"
            onClick={handleCopyMarkdown}
            className="px-2.5 py-1 rounded bg-brand-blue text-white hover:bg-brand-blue-hover text-xs font-semibold shadow-xs transition-colors"
          >
            {copiedType === 'md' ? '✓ 已复制大纲' : '📋 复制大纲树'}
          </button>
        </div>
      </div>

      {/* 思维导图画布展示区：左右双向发散树 + SVG 贝塞尔曲线 */}
      <div
        ref={canvasRef}
        data-testid="meeting-mindmap-canvas"
        role="region"
        aria-label="会议思维导图画布，拖动或使用方向键平移"
        tabIndex={0}
        onMouseDown={(event) => {
          if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button, a, input, select, textarea, [role="button"]'))) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          dragRef.current = { x: pan.x, y: pan.y, startX: event.clientX, startY: event.clientY };
          setIsDragging(true);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const step = event.shiftKey ? 100 : 40;
          const direction = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[event.key];
          if (!direction) return;
          event.preventDefault();
          setPan(previous => ({ x: previous.x + direction[0], y: previous.y + direction[1] }));
        }}
        className={`flex-1 min-h-0 overflow-hidden relative outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        <div
          data-testid="summary-page-mindmap-div-content"
          style={{ transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel / 100})`, transformOrigin: 'center center' }}
          className="absolute left-1/2 top-1/2 inline-flex items-center justify-center gap-12 lg:gap-16 w-max"
        >
          {/* SVG 贝塞尔曲线连线层 (讯飞同款平滑曲线) */}
          <svg
            data-testid="meeting-mindmap-svg-curves"
            className="absolute inset-0 w-full h-full pointer-events-none -z-0 opacity-40 dark:opacity-60"
          >
            <defs>
              <linearGradient id="curve-left-grad" x1="100%" y1="0%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#2563EB" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.2" />
              </linearGradient>
              <linearGradient id="curve-right-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2563EB" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#10B981" stopOpacity="0.2" />
              </linearGradient>
            </defs>
          </svg>

          {/* 1. 左侧分支翼 (Left Wing) */}
          <div
            data-testid="meeting-mindmap-side-left"
            className="flex flex-col gap-6 items-end z-10"
          >
            {leftBranches.map((branch) => renderBranchCard(branch, true))}
          </div>

          {/* 2. 中心核心根节点 (Root Topic) */}
          <div
            data-testid="meeting-mindmap-node-root"
            className="w-72 p-5 rounded-2xl bg-canvas border-2 border-brand-blue shadow-xl space-y-2.5 shrink-0 z-20 text-center relative"
          >
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-blue text-white">
                会议核心主题
              </span>
              <span className="text-[10px] font-mono text-text-tertiary">
                {speakers.length} 位参会人
              </span>
            </div>
            <h2 className="text-sm font-bold text-text-primary leading-snug">
              {rootNode.title}
            </h2>
            {rootNode.meta && (
              <div className="pt-2 border-t border-border-subtle text-[11px] text-text-tertiary font-mono">
                {rootNode.meta}
              </div>
            )}
            <div className="text-[10px] text-text-tertiary bg-subtle/80 py-1 rounded font-mono">
              ↔ 双向议题脉络发散
            </div>
          </div>

          {/* 3. 右侧分支翼 (Right Wing) */}
          <div
            data-testid="meeting-mindmap-side-right"
            className="flex flex-col gap-6 items-start z-10"
          >
            {rightBranches.map((branch) => renderBranchCard(branch, false))}
          </div>
        </div>
      </div>
    </div>
  );
};
