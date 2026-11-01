import React, { useState, useMemo } from 'react';
import { HistoryMeeting } from '../types/meeting';
import { formatSeconds } from '../utils/formatTime';

export interface MeetingMindmapProps {
  meeting: HistoryMeeting;
}

interface MindmapNode {
  id: string;
  title: string;
  type: 'root' | 'overview' | 'decision' | 'action' | 'risk' | 'fact' | 'participants';
  detail?: string;
  badge?: string;
  meta?: string;
  children?: MindmapNode[];
}

export const MeetingMindmap: React.FC<MeetingMindmapProps> = ({ meeting }) => {
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [copiedType, setCopiedType] = useState<'md' | 'mermaid' | null>(null);

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

  // 节点折叠切换
  const toggleCollapse = (nodeId: string) => {
    setCollapsedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  // 生成 Markdown 树状大纲（可粘贴进 XMind / MindNode / Obsidian）
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
        };
      case 'decision':
        return {
          border: 'border-status-success/40',
          bg: 'bg-status-success/5',
          pill: 'bg-status-success/15 text-status-success',
          accent: '#10B981',
        };
      case 'action':
        return {
          border: 'border-indigo-500/30',
          bg: 'bg-indigo-50/10 dark:bg-indigo-950/20',
          pill: 'bg-indigo-500/15 text-indigo-500',
          accent: '#6366F1',
        };
      case 'risk':
        return {
          border: 'border-amber-500/40',
          bg: 'bg-amber-500/5',
          pill: 'bg-amber-500/15 text-amber-500',
          accent: '#F59E0B',
        };
      case 'fact':
        return {
          border: 'border-border-strong',
          bg: 'bg-panel',
          pill: 'bg-subtle text-text-secondary',
          accent: '#6B7280',
        };
      case 'participants':
        return {
          border: 'border-purple-500/30',
          bg: 'bg-purple-500/5',
          pill: 'bg-purple-500/15 text-purple-500',
          accent: '#8B5CF6',
        };
      default:
        return {
          border: 'border-border-subtle',
          bg: 'bg-subtle',
          pill: 'bg-panel text-text-primary',
          accent: '#3B82F6',
        };
    }
  };

  return (
    <div
      data-testid="meeting-mindmap-container"
      className="flex flex-col h-full bg-subtle/50 rounded-xl border border-border-subtle overflow-hidden select-none"
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
          <span className="text-[11px] text-text-tertiary">
            （会议议题脉络 · 参会人分布 · 结构化图谱呈现）
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
              onClick={() => setZoomLevel(100)}
              className="text-[10px] text-text-tertiary hover:text-text-primary ml-1"
              title="重置 100%"
            >
              ↺
            </button>
          </div>

          {/* 复制工具 */}
          <button
            type="button"
            data-testid="meeting-mindmap-btn-copy-mermaid"
            onClick={handleCopyMermaid}
            className="px-2.5 py-1 rounded bg-panel border border-border-subtle hover:bg-hover text-text-primary text-xs font-medium transition-colors"
          >
            {copiedType === 'mermaid' ? '✓ 已复制 Mermaid' : '📋 复制脑图代码 (Mermaid)'}
          </button>
          <button
            type="button"
            data-testid="meeting-mindmap-btn-copy-markdown"
            onClick={handleCopyMarkdown}
            className="px-2.5 py-1 rounded bg-brand-blue text-white hover:bg-brand-blue-hover text-xs font-semibold shadow-xs transition-colors"
          >
            {copiedType === 'md' ? '✓ 已复制大纲' : '📋 复制大纲树 (XMind)'}
          </button>
        </div>
      </div>

      {/* 思维导图画布展示区 */}
      <div
        data-testid="meeting-mindmap-canvas"
        className="flex-1 overflow-auto p-6 md:p-8"
      >
        <div
          style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top left' }}
          className="transition-transform duration-150 inline-block min-w-full"
        >
          {/* 脑图主体水平层级发散结构 */}
          <div className="flex items-start gap-8">
            {/* 1. 中心根节点 (会议主题卡片) */}
            <div
              data-testid="meeting-mindmap-node-root"
              className="w-72 p-4 rounded-xl bg-canvas border-2 border-brand-blue shadow-lg space-y-2 shrink-0 relative"
            >
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-blue text-white">
                  会议主题
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
            </div>

            {/* 2. 主分支群 (向右层级发散) */}
            <div className="flex flex-col gap-5 flex-1 min-w-[500px]">
              {rootNode.children?.map((branch) => {
                const colors = getBranchColor(branch.type);
                const isCollapsed = !!collapsedNodes[branch.id];

                return (
                  <div
                    key={branch.id}
                    data-testid={`meeting-mindmap-branch-${branch.id}`}
                    className={`rounded-xl border ${colors.border} ${colors.bg} p-3.5 transition-all shadow-xs`}
                  >
                    {/* 分支标题条 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${colors.pill}`}>
                          {branch.title}
                        </span>
                      </div>

                      <button
                        type="button"
                        data-testid={`meeting-mindmap-btn-collapse-${branch.id}`}
                        onClick={() => toggleCollapse(branch.id)}
                        className="px-2 py-0.5 rounded text-[11px] text-text-tertiary hover:text-text-primary bg-canvas border border-border-subtle font-mono transition-colors"
                      >
                        {isCollapsed ? `[+] 展开 (${branch.children?.length || 0})` : '[-] 折叠'}
                      </button>
                    </div>

                    {/* 分支子节点列表 (若未折叠) */}
                    {!isCollapsed && branch.children && (
                      <div className="mt-3 pl-2 border-l-2 border-border-subtle/70 space-y-2.5">
                        {branch.children.map((child) => (
                          <div
                            key={child.id}
                            data-testid={`meeting-mindmap-node-${child.id}`}
                            className="p-2.5 rounded-lg bg-canvas border border-border-subtle hover:border-brand-blue/30 transition-all text-xs space-y-1 shadow-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-text-primary">
                                • {child.title}
                              </span>
                              {child.badge && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-subtle text-text-secondary">
                                  {child.badge}
                                </span>
                              )}
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
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
