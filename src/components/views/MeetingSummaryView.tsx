import React, { useState, useEffect, useRef } from 'react';
import { useMeetingStore } from '../../store/useMeetingStore';
import { formatSeconds } from '../../utils/formatTime';
import { MeetingAudioPlayer, type MeetingAudioHandle } from '../MeetingAudioPlayer';
import { parseTimecode, segmentPlaybackSeconds, playingSegment } from '../../utils/transcriptTime';
import { MeetingMindmap } from '../MeetingMindmap';
import { SummaryRevisionProposal, MeetingChatMessage } from '../../types/meeting';
import { getTingxuClient } from '../../api/tingxuClient';
import { getByokLlmClient } from '../../api/byokLlmClient';

export const MeetingSummaryView: React.FC = () => {
  const {
    currentUser,
    activeSummaryMeeting,
    setActiveSummaryMeeting,
    activeTargetSegmentId,
    setCurrentRoute,
    renameSpeaker,
    registerSpeakerProfile,
    cleanupRecordings,
    gatewayUrl,
    updateMeetingOverview,
    updateMeetingDecision,
    addMeetingDecision,
    deleteMeetingDecision,
    updateMeetingAction,
    addMeetingAction,
    deleteMeetingAction,
    updateMeetingTranscriptText,
    applySummaryProposal,
    addMeetingChatMessage,
    confirmActionToTask,
    batchConfirmActionsToTasks,
    removeActionFromTask,
    tasks,
    updateHistoryMeetingTitle,
    regenerateMeetingTitle,
    fetchMeetingAiCost,
  } = useMeetingStore();

  const [isCostModalOpen, setIsCostModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'mindmap' | 'transcripts'>('summary');
  const [summaryMode, setSummaryMode] = useState<'cards' | 'outline'>('cards');
  const [copied, setCopied] = useState(false);
  const [copiedSection, setCopiedSection] = useState<'decisions' | 'actions' | null>(null);
  const [completedActions, setCompletedActions] = useState<Set<number>>(new Set());
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [newSpeakerName, setNewSpeakerName] = useState('');

  // 会议标题自主编辑与 AI 重新提炼状态 (023)
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [isRegeneratingTitle, setIsRegeneratingTitle] = useState(false);
  const [titleNotice, setTitleNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 会后 Copilot 消息与提案一键复制反馈状态 (023)
  const [copiedCopilotId, setCopiedCopilotId] = useState<string | null>(null);

  const handleCopyText = (text: string, id: string) => {
    if (!text) return;
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch((err) => console.error('[Clipboard] 复制失败:', err));
      }
    } catch (err) {
      console.error('[Clipboard] 复制异常:', err);
    }
    setCopiedCopilotId(id);
    setTimeout(() => {
      setCopiedCopilotId((prev) => (prev === id ? null : prev));
    }, 1500);
  };

  const toggleActionComplete = (index: number) => {
    setCompletedActions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // 右栏切换：逐字稿录音 vs 会后 Copilot 智能助手
  const [rightPanelTab, setRightPanelTab] = useState<'transcripts' | 'copilot'>('transcripts');

  // Copilot 问答与指令修订状态
  const [copilotInput, setCopilotInput] = useState('');
  const [isCopilotLoading, setIsCopilotLoading] = useState(false);
  const copilotMessagesEndRef = useRef<HTMLDivElement>(null);

  // 原地人工编辑状态 (Inline Editing)
  const [isEditingOverview, setIsEditingOverview] = useState(false);
  const [overviewDraft, setOverviewDraft] = useState('');

  const [editingDecisionIndex, setEditingDecisionIndex] = useState<number | null>(null);
  const [decisionTitleDraft, setDecisionTitleDraft] = useState('');
  const [decisionContentDraft, setDecisionContentDraft] = useState('');
  const [isAddingDecision, setIsAddingDecision] = useState(false);

  const [editingActionIndex, setEditingActionIndex] = useState<number | null>(null);
  const [actionTitleDraft, setActionTitleDraft] = useState('');
  const [actionAssigneeDraft, setActionAssigneeDraft] = useState('');
  const [actionDueDateDraft, setActionDueDateDraft] = useState('');
  const [isAddingAction, setIsAddingAction] = useState(false);

  const [editingTranscriptId, setEditingTranscriptId] = useState<string | null>(null);
  const [transcriptDraft, setTranscriptDraft] = useState('');

  const playerRef = useRef<MeetingAudioHandle>(null);
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [seekRequest, setSeekRequest] = useState<{ seconds: number; revision: number }>();
  const [seekRevision, setSeekRevision] = useState(0);
  const [navigatedFromCopilot, setNavigatedFromCopilot] = useState(false);
  useEffect(() => {
    setSelectedSegmentId(null);
    setPlayingSegmentId(null);
    setSeekRequest(undefined);
    setActiveTab('summary');
    setCompletedActions(new Set());
    setCopiedSection(null);
    setNavigatedFromCopilot(false);
    if (activeSummaryMeeting?.id && !activeSummaryMeeting.aiCost) {
      void fetchMeetingAiCost(activeSummaryMeeting.id);
    }
  }, [activeSummaryMeeting?.id]);

  const transcriptsContainerRef = useRef<HTMLDivElement>(null);

  // 监听选中段落，联动滚动与高亮
  useEffect(() => {
    const targetId = selectedSegmentId || activeTargetSegmentId;
    if (targetId && rightPanelTab === 'transcripts') {
      const timer = setTimeout(() => {
        const el = document.getElementById(`summary-seg-${targetId}`);
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeTargetSegmentId, selectedSegmentId, activeTab, rightPanelTab, seekRevision]);

  // Copilot 消息平滑滚动到底部
  useEffect(() => {
    if (rightPanelTab === 'copilot') {
      copilotMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeSummaryMeeting?.chatHistory, rightPanelTab, isCopilotLoading]);

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

  const rawActions = summary?.actions || insights.filter((i) => i.type === 'action').map((a) => ({
    title: a.title,
    content: a.content,
    assignee: a.assignee || '待确认',
    dueDate: a.dueDate || '尽快推进',
    evidenceQuote: a.timestamp ? `(${a.timestamp})` : undefined,
    evidenceSegmentId: a.evidenceSegmentId,
    isConfirmed: false,
    taskId: undefined,
  }));

  const actions = rawActions.map((act) => {
    const isLinked = Boolean(
      (act.taskId && tasks.some((t) => t.id === act.taskId)) ||
      (meeting.id && tasks.some((t) => t.meetingId === meeting.id && t.title === act.title))
    );
    const linkedTask = tasks.find((t) => (act.taskId && t.id === act.taskId) || (meeting.id && t.meetingId === meeting.id && t.title === act.title));
    return {
      ...act,
      isConfirmed: Boolean(act.isConfirmed || isLinked),
      taskId: act.taskId || linkedTask?.id,
    };
  });

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

  const handleCopySection = (section: 'decisions' | 'actions') => {
    let text = '';
    if (section === 'decisions') {
      text = `### 💡 核心决策与架构原则 (${decisions.length})\n` +
        (decisions.length === 0
          ? '暂无提炼结论'
          : decisions.map((d, idx) => `${idx + 1}. **${d.title}**：${d.content}${d.evidenceQuote ? ` (依据: ${d.evidenceQuote})` : ''}`).join('\n'));
    } else {
      text = `### ☑️ 落地行动与分步待办 (${actions.length})\n` +
        (actions.length === 0
          ? '暂无执行待办'
          : actions.map((a, idx) => {
              const isDone = completedActions.has(idx);
              const assignee = a.assignee ? ` [负责人: ${a.assignee}]` : '';
              const due = a.dueDate ? ` [交付期限: ${a.dueDate}]` : '';
              return `${idx + 1}. [${isDone ? 'x' : ' '}] **${a.title}**${assignee}${due}`;
            }).join('\n'));
    }
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 2000);
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

  // 保存就地编辑的会议标题 (023)
  const handleSaveTitle = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && activeSummaryMeeting?.id) {
      updateHistoryMeetingTitle(activeSummaryMeeting.id, trimmed);
    }
    setIsEditingTitle(false);
  };

  // AI 重新提炼切中要害的会议主题 (023)
  const handleRegenerateTitle = async () => {
    if (!activeSummaryMeeting?.id || isRegeneratingTitle) return;
    setIsRegeneratingTitle(true);
    setTitleNotice(null);
    try {
      const newTitle = await regenerateMeetingTitle(activeSummaryMeeting.id);
      if (newTitle) {
        setTitleDraft(newTitle);
        setTitleNotice({
          type: 'success',
          text: `✓ 已重新提炼主题：《${newTitle}》`,
        });
        setTimeout(() => setTitleNotice(null), 4000);
      } else {
        setTitleNotice({
          type: 'error',
          text: '⚠️ 提炼未果：暂无更多实质发言，您可以点击 ✏️ 手动输入真实主题。',
        });
        setTimeout(() => setTitleNotice(null), 5000);
      }
    } catch (err) {
      setTitleNotice({
        type: 'error',
        text: `⚠️ 提炼异常: ${(err as Error).message}`,
      });
      setTimeout(() => setTitleNotice(null), 5000);
    } finally {
      setIsRegeneratingTitle(false);
    }
  };

  // 发送 Copilot 问题或修订指令
  const handleSendCopilotMessage = async (customPrompt?: string) => {
    const text = (customPrompt || copilotInput).trim();
    if (!text || isCopilotLoading) return;
    setCopilotInput('');

    const userMsg: MeetingChatMessage = {
      id: `chat_user_${Date.now()}`,
      sender: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    addMeetingChatMessage(meeting.id, userMsg);
    setIsCopilotLoading(true);

    try {
      const { byokSettings } = useMeetingStore.getState();
      const isStandaloneConfigured =
        byokSettings.mode === 'standalone' &&
        (Boolean(byokSettings.llmApiKey.trim()) || byokSettings.llmProvider === 'ollama');

      let chatData: any;
      const chatReq = {
        meetingId: meeting.id,
        question: text,
        asOfTextVersion: transcripts.length,
        transcripts: transcripts.length
          ? transcripts.map((t) => ({ id: t.id, speaker: t.speaker, text: t.text }))
          : [{ id: 'seg_init', speaker: '系统', text: '本场会议已完成，正在查阅本地纪要与录音。' }],
        currentSummary: meeting.structuredSummary,
      };

      if (isStandaloneConfigured) {
        chatData = await getByokLlmClient().chatCopilot(chatReq, byokSettings);
      } else {
        const client = getTingxuClient();
        if ('setGatewayUrl' in client) {
          (client as any).setGatewayUrl(gatewayUrl);
        }
        chatData = await client.copilot.chat(chatReq);
      }

      const proposals: SummaryRevisionProposal[] = (chatData.proposals || []).map((p: any, idx: number) => ({
        id: `prop_${Date.now()}_${idx}`,
        targetSection: p.targetSection || 'decisions',
        action: p.action || 'replace',
        itemIndex: p.itemIndex,
        originalText: p.originalText,
        proposedText: p.proposedText,
        reason: p.reason,
        applied: false,
      }));

      const aiMsg: MeetingChatMessage = {
        id: `chat_ai_${Date.now()}`,
        sender: 'assistant',
        content: chatData.answer || '已完成分析。',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        citations: chatData.citations || [],
        proposals,
      };
      addMeetingChatMessage(meeting.id, aiMsg);
    } catch {
      const errorMsg: MeetingChatMessage = {
        id: `chat_err_${Date.now()}`,
        sender: 'assistant',
        content: '⚠️ AI 网关处理请求失败或网络不可达。根据安全防臆造铁律，未生成假数据，请检查网关连接。',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      addMeetingChatMessage(meeting.id, errorMsg);
    } finally {
      setIsCopilotLoading(false);
    }
  };

  // 采纳 AI 修订提案
  const handleApplyProposal = (proposal: SummaryRevisionProposal) => {
    applySummaryProposal(meeting.id, proposal);
  };

  // 原地人工编辑：主旨综述
  const handleStartEditOverview = () => {
    setOverviewDraft(overviewText || '');
    setIsEditingOverview(true);
  };

  const handleSaveOverview = () => {
    if (overviewDraft.trim()) {
      updateMeetingOverview(meeting.id, overviewDraft.trim());
    }
    setIsEditingOverview(false);
  };

  // 原地人工编辑：决策卡片
  const handleStartEditDecision = (index: number) => {
    const d = decisions[index];
    if (d) {
      setDecisionTitleDraft(d.title);
      setDecisionContentDraft(d.content);
      setEditingDecisionIndex(index);
    }
  };

  const handleSaveEditDecision = (index: number) => {
    if (decisionTitleDraft.trim()) {
      updateMeetingDecision(meeting.id, index, {
        title: decisionTitleDraft.trim(),
        content: decisionContentDraft.trim(),
      });
    }
    setEditingDecisionIndex(null);
  };

  const handleAddDecision = () => {
    if (decisionTitleDraft.trim()) {
      addMeetingDecision(meeting.id, {
        title: decisionTitleDraft.trim(),
        content: decisionContentDraft.trim() || decisionTitleDraft.trim(),
      });
      setDecisionTitleDraft('');
      setDecisionContentDraft('');
      setIsAddingDecision(false);
    }
  };

  // 原地人工编辑：待办事项
  const handleStartEditAction = (index: number) => {
    const a = actions[index];
    if (a) {
      setActionTitleDraft(a.title);
      setActionAssigneeDraft(a.assignee || '');
      setActionDueDateDraft(a.dueDate || '');
      setEditingActionIndex(index);
    }
  };

  const handleSaveEditAction = (index: number) => {
    if (actionTitleDraft.trim()) {
      updateMeetingAction(meeting.id, index, {
        title: actionTitleDraft.trim(),
        assignee: actionAssigneeDraft.trim() || '待确认',
        dueDate: actionDueDateDraft.trim() || '尽快推进',
      });
    }
    setEditingActionIndex(null);
  };

  const handleAddAction = () => {
    if (actionTitleDraft.trim()) {
      addMeetingAction(meeting.id, {
        title: actionTitleDraft.trim(),
        assignee: actionAssigneeDraft.trim() || '待确认',
        dueDate: actionDueDateDraft.trim() || '尽快推进',
      });
      setActionTitleDraft('');
      setActionAssigneeDraft('');
      setActionDueDateDraft('');
      setIsAddingAction(false);
    }
  };

  // 原地人工编辑：逐字稿校订
  const handleStartEditTranscript = (segmentId: string, currentText: string) => {
    setEditingTranscriptId(segmentId);
    setTranscriptDraft(currentText);
  };

  const handleSaveEditTranscript = (segmentId: string) => {
    if (transcriptDraft.trim()) {
      updateMeetingTranscriptText(meeting.id, segmentId, transcriptDraft.trim());
    }
    setEditingTranscriptId(null);
  };

  // 引用只按证据 ID 定位，普通正文绝不提取数字猜时间。
  const handleSeekSegment = (segmentId?: string, timeStr?: string, fromCopilot = false) => {
    const explicitTime = segmentId ? null : parseTimecode(timeStr);
    const segment = segmentId ? transcripts.find(t => t.id === segmentId)
      : explicitTime !== null ? [...transcripts].reverse().find(t => {
        const start = segmentPlaybackSeconds(t); return start !== null && start <= explicitTime;
      }) : undefined;
    if (segment) setSelectedSegmentId(segment.id);
    setActiveTab('summary');
    setRightPanelTab('transcripts');
    if (fromCopilot) {
      setNavigatedFromCopilot(true);
    }
    setSeekRevision(r => r + 1);
    const seconds = segmentId ? segmentPlaybackSeconds(segment) : explicitTime;
    if (seconds !== null) {
      setSeekRequest({ seconds, revision: seekRevision + 1 });
      playerRef.current?.seek(seconds);
    }
  };

  const currentHighlightId = playingSegmentId || selectedSegmentId || activeTargetSegmentId;

  return (
    <div
      data-testid="summary-page-container"
      className="flex-1 h-screen overflow-hidden flex flex-col bg-canvas text-text-primary select-none animate-fadeIn"
    >
      {/* 沉浸式顶部标题与导航栏 (两段式架构重构 - Plan 026) */}
      <header
        data-testid="summary-page-header"
        className="border-b border-border-subtle bg-subtle shrink-0"
      >
        {/* 第一段：全局导航与主操作工具栏 (固定高度 48px，坚决不发生折行) */}
        <div className="h-12 px-6 flex items-center justify-between border-b border-border-subtle/60">
          {/* 左侧：返回导航与面包屑 */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              data-testid="summary-page-btn-back"
              onClick={() => {
                setActiveSummaryMeeting(null);
                setCurrentRoute('home');
              }}
              className="px-2.5 py-1 text-xs rounded-lg bg-panel border border-border-subtle hover:bg-hover text-text-secondary hover:text-text-primary flex items-center gap-1.5 font-medium transition-colors shrink-0 shadow-2xs"
            >
              <span>←</span>
              <span>返回工作台</span>
            </button>

            <span className="text-border-subtle">|</span>

            <div className="flex items-center gap-2 text-xs text-text-tertiary">
              <span className="font-medium text-text-secondary">会议工作台</span>
              <span>/</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-brand-blue-subtle text-brand-blue shrink-0">
                会议总结报告
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-status-success/10 text-status-success border border-status-success/20 font-mono hidden sm:inline-block">
                本地免登录归档
              </span>
            </div>
          </div>

          {/* 右侧：全局操作工具组 */}
          <div className="flex items-center gap-2 shrink-0">
            {/* AI 算力成本徽章 */}
            <button
              type="button"
              data-testid="summary-page-header-badge-ai-cost"
              onClick={() => setIsCostModalOpen(true)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
              title="点击查看本场会议 AI 实际调用费用明细"
            >
              <span>💰</span>
              <span className="tabular-nums font-mono">
                AI 成本 ￥{(meeting.aiCost?.totalCostYuan ?? 0).toFixed(2)}
              </span>
            </button>

            <span className="text-border-subtle/80">|</span>

            <button
              type="button"
              data-testid="summary-page-btn-call-copilot"
              onClick={() => {
                setActiveTab('summary');
                setRightPanelTab((prev) => (prev === 'copilot' ? 'transcripts' : 'copilot'));
              }}
              className={`px-3 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                rightPanelTab === 'copilot'
                  ? 'bg-brand-blue text-white border-brand-blue shadow-xs'
                  : 'bg-panel border-border-subtle hover:bg-hover text-brand-blue'
              }`}
            >
              <span>🤖</span>
              <span>{rightPanelTab === 'copilot' ? 'Copilot 对话中' : '会后 Copilot 助手'}</span>
            </button>

            <button
              type="button"
              data-testid="summary-page-btn-copy"
              onClick={handleCopySummary}
              className="px-3 py-1 rounded-lg bg-panel border border-border-subtle hover:bg-hover text-text-primary text-xs font-medium transition-colors shadow-2xs"
            >
              {copied ? '✓ 已复制纪要' : '📋 复制全文'}
            </button>

            <button
              type="button"
              data-testid="summary-page-btn-export-markdown"
              onClick={handleExportMarkdown}
              className="px-3 py-1 rounded-lg bg-brand-blue text-white hover:bg-brand-blue-hover text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
            >
              <span>⬇ 导出 Markdown</span>
            </button>
          </div>
        </div>

        {/* 第二段：会议主题与结构化元数据看板 */}
        <div className="px-6 py-3 bg-panel/60 space-y-2">
          {/* 第 1 行：主题与智能重提炼 */}
          <div className="flex items-center justify-between gap-4">
            {isEditingTitle ? (
              <div className="flex items-center gap-2 flex-1 max-w-2xl animate-fadeIn">
                <input
                  type="text"
                  data-testid="summary-page-input-edit-title"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveTitle();
                    } else if (e.key === 'Escape') {
                      setIsEditingTitle(false);
                    }
                  }}
                  autoFocus
                  className="flex-1 px-3 py-1 text-base font-bold bg-canvas border border-brand-blue rounded-lg text-text-primary outline-hidden shadow-xs"
                  placeholder="输入切题的会议主题..."
                />
                <button
                  type="button"
                  data-testid="summary-page-btn-save-title"
                  onClick={handleSaveTitle}
                  className="px-3 py-1 text-xs rounded-lg bg-brand-blue text-white font-semibold hover:bg-brand-blue-hover transition-colors shrink-0 shadow-2xs"
                >
                  保存
                </button>
                <button
                  type="button"
                  data-testid="summary-page-btn-cancel-title"
                  onClick={() => setIsEditingTitle(false)}
                  className="px-2.5 py-1 text-xs rounded-lg bg-subtle border border-border-subtle hover:bg-hover text-text-secondary transition-colors shrink-0"
                >
                  取消
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 min-w-0 group flex-1">
                <h1
                  data-testid="summary-page-text-title"
                  onClick={() => {
                    setTitleDraft(meeting.title);
                    setIsEditingTitle(true);
                  }}
                  className="text-lg font-bold text-text-primary truncate cursor-pointer hover:text-brand-blue transition-colors hover:underline decoration-dotted"
                  title="点击就地修改会议主题"
                >
                  {meeting.title}
                </h1>
                <button
                  type="button"
                  data-testid="summary-page-btn-edit-title"
                  onClick={() => {
                    setTitleDraft(meeting.title);
                    setIsEditingTitle(true);
                  }}
                  className="opacity-60 group-hover:opacity-100 hover:text-brand-blue text-text-secondary transition-opacity p-1 rounded hover:bg-hover text-xs cursor-pointer"
                  title="重命名会议主题"
                >
                  ✏️
                </button>
                <button
                  type="button"
                  data-testid="summary-page-btn-regenerate-title"
                  disabled={isRegeneratingTitle}
                  onClick={handleRegenerateTitle}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-subtle border border-border-subtle hover:border-brand-blue hover:text-brand-blue text-text-secondary transition-all flex items-center gap-1 shadow-2xs shrink-0 cursor-pointer disabled:opacity-50"
                  title="根据全场逐字稿与核心议题，AI 重新提炼切题主题（自动过滤开场白与测试闲聊）"
                >
                  <span>{isRegeneratingTitle ? '⏳' : '🤖'}</span>
                  <span>{isRegeneratingTitle ? '正在提炼...' : '重新提炼主题'}</span>
                </button>
              </div>
            )}

            {/* 提炼反馈通知 (固定在右侧，平滑渐隐，绝不推挤标题) */}
            {titleNotice && (
              <div
                data-testid="summary-page-banner-title-feedback"
                className={`text-xs font-medium px-3 py-1 rounded-lg flex items-center gap-1.5 animate-fadeIn shrink-0 shadow-2xs ${
                  titleNotice.type === 'success'
                    ? 'bg-status-success-bg text-status-success border border-status-success/30'
                    : 'bg-status-danger-bg text-status-danger border border-status-danger/30'
                }`}
              >
                <span>{titleNotice.text}</span>
              </div>
            )}
          </div>

          {/* 第 2 行：结构化元数据流 (日期、时长、发言段数、参会人列表) */}
          <div className="flex items-center gap-3 text-xs text-text-tertiary flex-wrap">
            <span className="font-mono flex items-center gap-1">
              <span>📅</span>
              <span>{meeting.date}</span>
            </span>
            <span>·</span>
            <span className="font-mono tabular-nums flex items-center gap-1">
              <span>⏱</span>
              <span>时长: {formatSeconds(meeting.durationSeconds)}</span>
            </span>
            <span>·</span>
            <span className="font-mono flex items-center gap-1">
              <span>💬</span>
              <span>已收录 {transcripts.length} 段发言</span>
            </span>

            {speakers.length > 0 && (
              <>
                <span>·</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-text-secondary flex items-center gap-1">
                    <span>👥</span>
                    <span>参会人:</span>
                  </span>
                  {speakers.map((sp, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setEditingSpeaker(sp);
                        setNewSpeakerName(sp);
                      }}
                      className="px-2 py-0.5 rounded-md bg-canvas hover:bg-hover border border-border-subtle hover:border-brand-blue cursor-pointer transition-colors text-text-primary text-[11px] font-medium"
                      title="点击重命名该参会人"
                    >
                      {sp}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
            📊 结构化纪要与提炼
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
              onSeekSegment={id => handleSeekSegment(id)}
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
                      <div className="flex items-center gap-2">
                        <button type="button" data-testid={`summary-page-transcript-btn-seek-${t.id}`} onClick={() => handleSeekSegment(t.id)} className="font-mono text-[11px] text-brand-blue tabular-nums">{t.timestamp}</button>
                        <button
                          type="button"
                          data-testid={`summary-page-btn-edit-transcript-${t.id}`}
                          onClick={() => handleStartEditTranscript(t.id, t.text)}
                          className="text-text-tertiary hover:text-brand-blue text-[11px] p-0.5"
                          title="校正逐字稿文字"
                        >
                          ✏️
                        </button>
                      </div>
                    </div>
                    {editingTranscriptId === t.id ? (
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          data-testid={`summary-page-input-edit-transcript-${t.id}`}
                          value={transcriptDraft}
                          onChange={(e) => setTranscriptDraft(e.target.value)}
                          className="flex-1 px-2.5 py-1 text-xs bg-canvas border border-brand-blue rounded text-text-primary"
                        />
                        <button
                          type="button"
                          data-testid={`summary-page-btn-save-transcript-${t.id}`}
                          onClick={() => handleSaveEditTranscript(t.id)}
                          className="px-2.5 py-1 rounded bg-brand-blue text-white text-xs font-medium"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTranscriptId(null)}
                          className="px-2 py-1 rounded bg-subtle text-text-secondary text-xs"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <p
                        data-testid={`summary-page-text-transcript-${t.id}`}
                        onClick={() => handleSeekSegment(t.id)}
                        className="text-xs text-text-primary leading-relaxed cursor-pointer hover:text-brand-blue transition-colors"
                        title="点击直接定位至该句录音并播放"
                      >
                        {t.text}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* 双栏联动工作台 (左侧卡片/大纲 + 右侧逐字稿与原声播放器) */
          <div className="flex-1 overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border-subtle">
            {/* 左栏：智能纪要占桌面宽度的三分之二 */}
            <div
              data-testid="summary-page-panel-left"
              className="flex-1 min-w-0 md:flex-none md:w-2/3 overflow-y-auto p-6 space-y-6"
            >
              {/* 会议产出关键指标横幅 (Executive Metrics Bar) */}
              <div
                data-testid="summary-page-metrics-bar"
                className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-subtle/70 border border-border-subtle"
              >
                <div
                  data-testid="summary-page-metric-decisions"
                  className="p-2.5 rounded-lg bg-canvas border border-border-subtle flex items-center gap-2.5 shadow-2xs"
                >
                  <span className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">
                    🎯
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] text-text-tertiary">核心决议</div>
                    <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 tabular-nums truncate">
                      {decisions.length} 项
                    </div>
                  </div>
                </div>

                <div
                  data-testid="summary-page-metric-actions"
                  className="p-2.5 rounded-lg bg-canvas border border-border-subtle flex items-center gap-2.5 shadow-2xs"
                >
                  <span className="w-7 h-7 rounded-lg bg-blue-500/10 text-brand-blue flex items-center justify-center text-xs font-bold shrink-0">
                    ☑️
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] text-text-tertiary">待办执行</div>
                    <div className="text-xs font-bold text-brand-blue tabular-nums truncate">
                      {actions.length} 项{completedActions.size > 0 && ` (${completedActions.size}已落实)`}
                    </div>
                  </div>
                </div>

                <div
                  data-testid="summary-page-metric-risks"
                  className="p-2.5 rounded-lg bg-canvas border border-border-subtle flex items-center gap-2.5 shadow-2xs"
                >
                  <span className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs font-bold shrink-0">
                    ⚠️
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] text-text-tertiary">风险关注</div>
                    <div className="text-xs font-bold text-amber-700 dark:text-amber-400 tabular-nums truncate">
                      {risks.length} 项
                    </div>
                  </div>
                </div>

                <div
                  data-testid="summary-page-metric-facts"
                  className="p-2.5 rounded-lg bg-canvas border border-border-subtle flex items-center gap-2.5 shadow-2xs"
                >
                  <span className="w-7 h-7 rounded-lg bg-slate-500/10 text-text-secondary flex items-center justify-center text-xs font-bold shrink-0">
                    📌
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] text-text-tertiary">核心事实</div>
                    <div className="text-xs font-bold text-text-primary tabular-nums truncate">
                      {facts.length} 条
                    </div>
                  </div>
                </div>
              </div>

              {/* 1. 全局主旨综述 */}
              <div
                data-testid="summary-page-card-overview"
                className="p-4 rounded-xl bg-panel border border-border-subtle space-y-2 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-text-primary">
                    <span>📋 全局主旨背景</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-brand-blue bg-brand-blue/10 px-2 py-0.5 rounded-full font-medium">
                      核心脉络
                    </span>
                    {!isEditingOverview ? (
                      <button
                        type="button"
                        data-testid="summary-page-btn-edit-overview"
                        onClick={handleStartEditOverview}
                        className="text-[11px] text-text-tertiary hover:text-brand-blue transition-colors flex items-center gap-1"
                        title="就地编辑综述"
                      >
                        <span>✏️ 编辑</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          data-testid="summary-page-btn-save-overview"
                          onClick={handleSaveOverview}
                          className="px-2 py-0.5 rounded bg-brand-blue text-white text-[10px] font-medium"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          data-testid="summary-page-btn-cancel-overview"
                          onClick={() => setIsEditingOverview(false)}
                          className="px-2 py-0.5 rounded bg-subtle text-text-secondary text-[10px]"
                        >
                          取消
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {isEditingOverview ? (
                  <textarea
                    data-testid="summary-page-textarea-edit-overview"
                    value={overviewDraft}
                    onChange={(e) => setOverviewDraft(e.target.value)}
                    rows={4}
                    className="w-full p-2.5 text-xs bg-canvas border border-brand-blue rounded-lg text-text-primary leading-relaxed focus:outline-none"
                  />
                ) : (
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {overviewText}
                  </p>
                )}
              </div>

              {summaryMode === 'cards' ? (
                /* 结构化主题卡片看板 */
                <div
                  data-testid="summary-page-topic-cards-container"
                  className="space-y-6"
                >
                  {/* 章节 1：关键结论与决策 (绿色系) */}
                  <div
                    data-testid="summary-page-section-decisions"
                    className="space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-status-success">
                      <div className="flex items-center gap-2">
                        <span>✦</span>
                        <span>关键结论与架构决策 ({decisions.length})</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          data-testid="summary-page-btn-copy-section-decisions"
                          onClick={() => handleCopySection('decisions')}
                          className="text-[11px] font-normal px-2 py-0.5 rounded bg-status-success-bg hover:bg-status-success/20 text-status-success border border-status-success/30 transition-colors flex items-center gap-1"
                          title="复制所有结论到剪贴板"
                        >
                          {copiedSection === 'decisions' ? '✓ 已复制' : '📋 复制结论'}
                        </button>
                        <button
                          type="button"
                          data-testid="summary-page-btn-add-decision"
                          onClick={() => {
                            setIsAddingDecision(true);
                            setDecisionTitleDraft('');
                            setDecisionContentDraft('');
                          }}
                          className="text-[11px] font-normal px-2 py-0.5 rounded bg-status-success-bg text-status-success border border-status-success/30 hover:bg-status-success/20 transition-colors"
                        >
                          + 添加结论
                        </button>
                      </div>
                    </div>

                    {isAddingDecision && (
                      <div className="p-3.5 rounded-xl bg-canvas border border-brand-blue space-y-2 shadow-xs animate-fadeIn">
                        <div className="text-xs font-bold text-text-primary">新增关键结论</div>
                        <input
                          type="text"
                          data-testid="summary-page-input-new-decision-title"
                          placeholder="结论标题（例如：采用分布式架构）"
                          value={decisionTitleDraft}
                          onChange={(e) => setDecisionTitleDraft(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-subtle border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-brand-blue"
                        />
                        <textarea
                          data-testid="summary-page-textarea-new-decision-content"
                          placeholder="具体结论阐述与依据"
                          value={decisionContentDraft}
                          onChange={(e) => setDecisionContentDraft(e.target.value)}
                          rows={2}
                          className="w-full px-2.5 py-1.5 text-xs bg-subtle border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-brand-blue"
                        />
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setIsAddingDecision(false)}
                            className="px-2.5 py-1 rounded bg-subtle text-text-secondary text-[11px]"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            data-testid="summary-page-btn-confirm-add-decision"
                            onClick={handleAddDecision}
                            className="px-3 py-1 rounded bg-brand-blue text-white text-[11px] font-medium"
                          >
                            保存添加
                          </button>
                        </div>
                      </div>
                    )}

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
                            {editingDecisionIndex === i ? (
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  data-testid={`summary-page-input-edit-decision-title-${i}`}
                                  value={decisionTitleDraft}
                                  onChange={(e) => setDecisionTitleDraft(e.target.value)}
                                  className="w-full px-2.5 py-1 text-xs bg-canvas border border-brand-blue rounded text-text-primary"
                                />
                                <textarea
                                  data-testid={`summary-page-textarea-edit-decision-content-${i}`}
                                  value={decisionContentDraft}
                                  onChange={(e) => setDecisionContentDraft(e.target.value)}
                                  rows={2}
                                  className="w-full px-2.5 py-1 text-xs bg-canvas border border-brand-blue rounded text-text-primary"
                                />
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setEditingDecisionIndex(null)}
                                    className="px-2 py-0.5 rounded bg-subtle text-text-secondary text-[10px]"
                                  >
                                    取消
                                  </button>
                                  <button
                                    type="button"
                                    data-testid={`summary-page-btn-save-decision-${i}`}
                                    onClick={() => handleSaveEditDecision(i)}
                                    className="px-2.5 py-0.5 rounded bg-brand-blue text-white text-[10px] font-medium"
                                  >
                                    保存
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                                    {d.title}
                                  </span>
                                  <div className="flex items-center gap-1.5">
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
                                    <button
                                      type="button"
                                      data-testid={`summary-page-btn-edit-decision-${i}`}
                                      onClick={() => handleStartEditDecision(i)}
                                      className="p-1 text-text-tertiary hover:text-brand-blue text-[11px]"
                                      title="编辑此结论"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      type="button"
                                      data-testid={`summary-page-btn-delete-decision-${i}`}
                                      onClick={() => deleteMeetingDecision(meeting.id, i)}
                                      className="p-1 text-text-tertiary hover:text-status-danger text-[11px]"
                                      title="删除此结论"
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                </div>
                                <div className="text-xs text-emerald-950/80 dark:text-emerald-200/80 leading-relaxed">
                                  <span className="font-semibold text-emerald-900 dark:text-emerald-200">
                                    【核心要点】：
                                  </span>
                                  {d.content}
                                </div>
                              </>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* 章节 2：分步执行行动流 (蓝色系) */}
                  <div
                    data-testid="summary-page-section-action-steps"
                    className="space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-brand-blue">
                      <div className="flex items-center gap-2">
                        <span>✦</span>
                        <span>落地计划与分步执行流 ({actions.length})</span>
                        {actions.length > 0 && (
                          <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-blue-100/70 dark:bg-blue-900/40 text-brand-blue font-mono">
                            {actions.filter((a) => a.isConfirmed).length}/{actions.length} 已转入待办
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {actions.some((a) => !a.isConfirmed) && (
                          <button
                            type="button"
                            data-testid="summary-page-btn-batch-confirm-actions"
                            onClick={() => batchConfirmActionsToTasks(meeting.id)}
                            className="text-[11px] font-medium px-2.5 py-0.5 rounded bg-brand-blue text-white hover:bg-brand-blue/90 border border-brand-blue shadow-2xs transition-colors flex items-center gap-1"
                            title="一键将所有未入库的行动建议确认为正式待办"
                          >
                            ⚡ 一键转入待办
                          </button>
                        )}
                        <button
                          type="button"
                          data-testid="summary-page-btn-copy-section-actions"
                          onClick={() => handleCopySection('actions')}
                          className="text-[11px] font-normal px-2 py-0.5 rounded bg-brand-blue-subtle hover:bg-brand-blue/20 text-brand-blue border border-brand-blue/30 transition-colors flex items-center gap-1"
                          title="复制所有待办清单到剪贴板"
                        >
                          {copiedSection === 'actions' ? '✓ 已复制' : '📋 复制待办'}
                        </button>
                        <button
                          type="button"
                          data-testid="summary-page-btn-add-action"
                          onClick={() => {
                            setIsAddingAction(true);
                            setActionTitleDraft('');
                            setActionAssigneeDraft('');
                            setActionDueDateDraft('');
                          }}
                          className="text-[11px] font-normal px-2 py-0.5 rounded bg-brand-blue-subtle text-brand-blue border border-brand-blue/30 hover:bg-brand-blue/20 transition-colors"
                        >
                          + 添加待办
                        </button>
                      </div>
                    </div>

                    {isAddingAction && (
                      <div className="p-3.5 rounded-xl bg-canvas border border-brand-blue space-y-2 shadow-xs animate-fadeIn">
                        <div className="text-xs font-bold text-text-primary">新增行动待办</div>
                        <input
                          type="text"
                          data-testid="summary-page-input-new-action-title"
                          placeholder="待办事项任务名称"
                          value={actionTitleDraft}
                          onChange={(e) => setActionTitleDraft(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-subtle border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-brand-blue"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            data-testid="summary-page-input-new-action-assignee"
                            placeholder="责任人（例如：李工）"
                            value={actionAssigneeDraft}
                            onChange={(e) => setActionAssigneeDraft(e.target.value)}
                            className="px-2.5 py-1 text-xs bg-subtle border border-border-subtle rounded text-text-primary"
                          />
                          <input
                            type="text"
                            data-testid="summary-page-input-new-action-duedate"
                            placeholder="截止期限（例如：下周五前）"
                            value={actionDueDateDraft}
                            onChange={(e) => setActionDueDateDraft(e.target.value)}
                            className="px-2.5 py-1 text-xs bg-subtle border border-border-subtle rounded text-text-primary"
                          />
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setIsAddingAction(false)}
                            className="px-2.5 py-1 rounded bg-subtle text-text-secondary text-[11px]"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            data-testid="summary-page-btn-confirm-add-action"
                            onClick={handleAddAction}
                            className="px-3 py-1 rounded bg-brand-blue text-white text-[11px] font-medium"
                          >
                            保存添加
                          </button>
                        </div>
                      </div>
                    )}

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
                          const isDone = completedActions.has(i);
                          const stepNames = ['第一步', '第二步', '第三步', '第四步', '第五步'];
                          const stepLabel = stepNames[i] || `步骤 ${i + 1}`;
                          return (
                            <div
                              key={i}
                              data-testid={`summary-page-item-action-${i}`}
                              className={`p-3 rounded-lg border transition-all space-y-2 shadow-xs ${
                                isDone
                                  ? 'opacity-60 bg-subtle/50 border-border-subtle'
                                  : 'bg-canvas border-border-subtle hover:border-brand-blue/50'
                              }`}
                            >
                              {editingActionIndex === i ? (
                                <div className="space-y-2">
                                  <input
                                    type="text"
                                    data-testid={`summary-page-input-edit-action-title-${i}`}
                                    value={actionTitleDraft}
                                    onChange={(e) => setActionTitleDraft(e.target.value)}
                                    className="w-full px-2.5 py-1 text-xs bg-canvas border border-brand-blue rounded text-text-primary"
                                  />
                                  <div className="grid grid-cols-2 gap-2">
                                    <input
                                      type="text"
                                      data-testid={`summary-page-input-edit-action-assignee-${i}`}
                                      value={actionAssigneeDraft}
                                      placeholder="负责人"
                                      onChange={(e) => setActionAssigneeDraft(e.target.value)}
                                      className="px-2 py-1 text-xs bg-canvas border border-border-subtle rounded text-text-primary"
                                    />
                                    <input
                                      type="text"
                                      data-testid={`summary-page-input-edit-action-duedate-${i}`}
                                      value={actionDueDateDraft}
                                      placeholder="交付期限"
                                      onChange={(e) => setActionDueDateDraft(e.target.value)}
                                      className="px-2 py-1 text-xs bg-canvas border border-border-subtle rounded text-text-primary"
                                    />
                                  </div>
                                  <div className="flex justify-end gap-1.5 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => setEditingActionIndex(null)}
                                      className="px-2 py-0.5 rounded bg-subtle text-text-secondary text-[10px]"
                                    >
                                      取消
                                    </button>
                                    <button
                                      type="button"
                                      data-testid={`summary-page-btn-save-action-${i}`}
                                      onClick={() => handleSaveEditAction(i)}
                                      className="px-2.5 py-0.5 rounded bg-brand-blue text-white text-[10px] font-medium"
                                    >
                                      保存
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-2.5 min-w-0">
                                    <input
                                      type="checkbox"
                                      data-testid={`summary-page-checkbox-action-${i}`}
                                      checked={isDone}
                                      onChange={() => toggleActionComplete(i)}
                                      className="mt-1 w-4 h-4 rounded border-border-subtle text-brand-blue focus:ring-brand-blue cursor-pointer shrink-0"
                                      title={isDone ? '标记为未完成' : '标记为已完成'}
                                    />
                                    <span
                                      className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                                        isDone ? 'bg-text-tertiary text-white' : 'bg-brand-blue text-white'
                                      }`}
                                    >
                                      {i + 1}
                                    </span>
                                    <div className="space-y-1 min-w-0">
                                      <div
                                        className={`text-xs font-semibold ${
                                          isDone ? 'line-through text-text-tertiary' : 'text-text-primary'
                                        }`}
                                      >
                                        {stepLabel}：{a.title}
                                        {isDone && (
                                          <span className="ml-2 text-[10px] text-emerald-600 dark:text-emerald-400 no-underline font-normal inline-block">
                                            ✓ 已落实
                                          </span>
                                        )}
                                      </div>
                                      <div
                                        className={`text-[11px] leading-snug ${
                                          isDone ? 'line-through text-text-tertiary' : 'text-text-secondary'
                                        }`}
                                      >
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

                                    {a.isConfirmed ? (
                                      <div className="flex items-center gap-1">
                                        <span
                                          data-testid={`summary-page-badge-action-confirmed-${i}`}
                                          className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-medium flex items-center gap-0.5"
                                        >
                                          <span>✓ 已在待办</span>
                                        </span>
                                        <button
                                          type="button"
                                          data-testid={`summary-page-btn-remove-action-task-${i}`}
                                          onClick={() => removeActionFromTask(meeting.id, i)}
                                          className="px-1.5 py-0.5 rounded text-text-tertiary hover:text-status-danger text-[10px] transition-colors"
                                          title="从我的待办任务中移出"
                                        >
                                          移出
                                        </button>
                                        <button
                                          type="button"
                                          data-testid={`summary-page-btn-view-task-${i}`}
                                          onClick={() => setCurrentRoute('tasks')}
                                          className="px-1.5 py-0.5 rounded text-brand-blue hover:underline text-[10px] transition-colors"
                                          title="前往待办中心查看"
                                        >
                                          查看
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        data-testid={`summary-page-btn-confirm-action-to-task-${i}`}
                                        onClick={() => confirmActionToTask(meeting.id, i)}
                                        className="px-2 py-0.5 rounded bg-brand-blue-subtle text-brand-blue hover:bg-brand-blue hover:text-white border border-brand-blue/30 text-[10px] font-medium transition-colors flex items-center gap-0.5 shadow-2xs"
                                        title="将该项建议确认为正式待办，进入任务管理"
                                      >
                                        <span>✓ 转为待办</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      data-testid={`summary-page-btn-edit-action-${i}`}
                                      onClick={() => handleStartEditAction(i)}
                                      className="p-1 text-text-tertiary hover:text-brand-blue text-[11px]"
                                      title="编辑此待办"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      type="button"
                                      data-testid={`summary-page-btn-delete-action-${i}`}
                                      onClick={() => deleteMeetingAction(meeting.id, i)}
                                      className="p-1 text-text-tertiary hover:text-status-danger text-[11px]"
                                      title="删除此待办"
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                </div>
                              )}
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
                /* 结构化层级大纲文本视图 (正式汇报与通读模式) */
                <div
                  data-testid="summary-page-structured-outline"
                  className="p-6 rounded-xl bg-canvas border border-border-subtle space-y-6 text-xs font-sans shadow-xs animate-fadeIn"
                >
                  {/* 正式文档信头 */}
                  <div className="border-b border-border-subtle pb-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono tracking-wider uppercase text-text-tertiary">
                        OFFICIAL MEETING BRIEF · 听序结构化纪要
                      </span>
                      <button
                        type="button"
                        onClick={handleCopySummary}
                        className="text-[11px] text-brand-blue hover:underline font-medium flex items-center gap-1"
                        title="复制大纲文本"
                      >
                        {copied ? '✓ 已复制全文' : '📋 复制大纲文本'}
                      </button>
                    </div>
                    <h2 className="text-base font-bold text-text-primary">
                      {meeting.title}
                    </h2>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-tertiary font-mono">
                      <span>📅 记录日期: {meeting.date}</span>
                      <span>·</span>
                      <span>⏱ 会议时长: {formatSeconds(meeting.durationSeconds)}</span>
                      <span>·</span>
                      <span>👥 参会人: {speakers.join('、') || '全员'}</span>
                    </div>
                  </div>

                  {/* 一、会议全局主旨 */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-3.5 rounded-full bg-brand-blue shrink-0" />
                      <h3 className="font-bold text-text-primary text-xs tracking-wide">
                        一、会议全局主旨与背景脉络
                      </h3>
                    </div>
                    <div className="pl-3.5 ml-0.5 border-l-2 border-brand-blue/20 text-text-secondary leading-relaxed">
                      <p>{overviewText}</p>
                    </div>
                  </div>

                  {/* 二、核心决策与架构原则 */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-3.5 rounded-full bg-emerald-500 shrink-0" />
                        <h3 className="font-bold text-text-primary text-xs tracking-wide">
                          二、核心决策与架构原则 ({decisions.length})
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">已形成共识</span>
                    </div>
                    <div className="pl-3.5 ml-0.5 border-l-2 border-emerald-500/30 space-y-2">
                      {decisions.length === 0 ? (
                        <div className="text-text-tertiary text-[11px]">暂无决议记录</div>
                      ) : (
                        decisions.map((d, i) => (
                          <div key={i} className="text-text-secondary leading-relaxed space-y-0.5">
                            <div className="flex items-baseline gap-1.5 flex-wrap">
                              <span className="font-semibold text-emerald-900 dark:text-emerald-300">
                                {i + 1}. {d.title}
                              </span>
                              {d.evidenceSegmentId && (
                                <button
                                  type="button"
                                  onClick={() => handleSeekSegment(d.evidenceSegmentId, d.evidenceQuote)}
                                  className="text-[10px] text-brand-blue hover:underline font-mono inline-flex items-center gap-0.5"
                                  title="点击在右侧定位证据"
                                >
                                  <span>[⏱ {d.evidenceQuote || '依据'} ⤤]</span>
                                </button>
                              )}
                            </div>
                            <div className="text-[11px] text-text-secondary pl-3">
                              {d.content}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* 三、行动待办与落实排期 */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-3.5 rounded-full bg-blue-500 shrink-0" />
                        <h3 className="font-bold text-text-primary text-xs tracking-wide">
                          三、行动待办与落实排期 ({actions.length})
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono text-brand-blue">
                        {completedActions.size}/{actions.length} 已落实
                      </span>
                    </div>
                    <div className="pl-3.5 ml-0.5 border-l-2 border-blue-500/30 space-y-2">
                      {actions.length === 0 ? (
                        <div className="text-text-tertiary text-[11px]">暂无待办清单</div>
                      ) : (
                        actions.map((a, i) => {
                          const isDone = completedActions.has(i);
                          return (
                            <div
                              key={i}
                              className={`text-text-secondary leading-relaxed space-y-0.5 ${
                                isDone ? 'opacity-60 line-through' : ''
                              }`}
                            >
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-text-primary">
                                  {i + 1}. {a.title}
                                </span>
                                <span className="text-text-tertiary text-[10px] font-mono">
                                  [责任人: {a.assignee} · 交付: {a.dueDate}]
                                </span>
                                {isDone && (
                                  <span className="text-[10px] text-emerald-600 no-underline font-mono">✓ 已落实</span>
                                )}
                              </div>
                              {('content' in a && (a as any).content && (a as any).content !== a.title) && (
                                <div className="text-[11px] text-text-tertiary pl-3">
                                  细节：{(a as any).content}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* 四、风险关注与背景事实 */}
                  {(risks.length > 0 || facts.length > 0) && (
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-3.5 rounded-full bg-amber-500 shrink-0" />
                        <h3 className="font-bold text-text-primary text-xs tracking-wide">
                          四、风险关注与背景事实 ({risks.length + facts.length})
                        </h3>
                      </div>
                      <div className="pl-3.5 ml-0.5 border-l-2 border-amber-500/30 space-y-2 text-text-secondary">
                        {risks.map((r, i) => (
                          <div key={i} className="text-[11px] leading-relaxed">
                            <span className="font-semibold text-amber-700 dark:text-amber-400">
                              ⚠️ [风险预警] {r.title}：
                            </span>
                            <span>{r.content}</span>
                          </div>
                        ))}
                        {facts.map((f, i) => (
                          <div key={i} className="text-[11px] leading-relaxed">
                            <span className="font-semibold text-text-primary">
                              📌 [背景事实] {f.title}：
                            </span>
                            <span>{f.content}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 尾部：隐私主权说明 */}
                  <div className="pt-3 border-t border-border-subtle flex items-center justify-between text-[10px] text-text-tertiary">
                    <span>🔒 本地优先数据隐私主权保护（Local-First SQLite · Zero-Content 云端零留存）</span>
                    <span className="font-mono">听序 Tingxu</span>
                  </div>
                </div>
              )}
            </div>

            {/* 右栏：录音逐字稿 / 会后 Copilot 助手 */}
            <div
              data-testid="summary-page-panel-right"
              className="flex-1 min-w-0 md:flex-none md:w-1/3 flex flex-col bg-subtle/40 overflow-hidden"
            >
              {/* 右栏顶部标签条 */}
              <div className="px-4 py-2 bg-canvas border-b border-border-subtle flex flex-wrap gap-1 items-center justify-between text-xs shrink-0">
                <div className="flex items-center gap-1 bg-subtle p-0.5 rounded-lg border border-border-subtle">
                  <button
                    type="button"
                    data-testid="summary-page-btn-tab-right-transcripts"
                    onClick={() => setRightPanelTab('transcripts')}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                      rightPanelTab === 'transcripts'
                        ? 'bg-canvas text-brand-blue font-semibold shadow-xs'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    🎙️ 录音与逐字稿 ({transcripts.length})
                  </button>
                  <button
                    type="button"
                    data-testid="summary-page-btn-tab-right-copilot"
                    onClick={() => setRightPanelTab('copilot')}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
                      rightPanelTab === 'copilot'
                        ? 'bg-canvas text-brand-blue font-semibold shadow-xs'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <span>🤖</span>
                    <span>会后 Copilot 助手</span>
                    {meeting.chatHistory && meeting.chatHistory.length > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-blue" />
                    )}
                  </button>
                </div>
              </div>

              {rightPanelTab === 'transcripts' ? (
                /* 逐字稿滚动列表 + 原声播放器 */
                <div className="flex-1 overflow-hidden flex flex-col">
                  {/* 从 Copilot 证据切片跳转时的返回横幅 */}
                  {navigatedFromCopilot && (
                    <div
                      data-testid="summary-page-banner-citation-active"
                      className="px-4 py-2 bg-brand-blue/10 border-b border-brand-blue/20 flex items-center justify-between text-xs text-brand-blue shrink-0 animate-fadeIn"
                    >
                      <div className="flex items-center gap-1.5 font-medium">
                        <span>📍</span>
                        <span>正在查看依据发言切片</span>
                      </div>
                      <button
                        type="button"
                        data-testid="summary-page-btn-return-to-copilot"
                        onClick={() => {
                          setRightPanelTab('copilot');
                          setNavigatedFromCopilot(false);
                        }}
                        className="px-2.5 py-1 rounded bg-brand-blue text-white text-[11px] font-medium hover:bg-brand-blue-hover transition-colors flex items-center gap-1 shadow-2xs"
                      >
                        <span>↩</span>
                        <span>返回 Copilot 对话</span>
                      </button>
                    </div>
                  )}

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
                            className={`p-3 rounded-xl border transition-all space-y-1.5 ${
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
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  data-testid={`summary-page-transcript-btn-seek-${t.id}`}
                                  onClick={() => handleSeekSegment(t.id)}
                                  className="font-mono text-[10px] text-brand-blue tabular-nums"
                                  aria-label={`定位 ${t.timestamp}`}
                                >
                                  {t.timestamp}
                                </button>
                                <button
                                  type="button"
                                  data-testid={`summary-page-btn-edit-transcript-row-${t.id}`}
                                  onClick={() => handleStartEditTranscript(t.id, t.text)}
                                  className="text-text-tertiary hover:text-brand-blue text-[11px] p-0.5"
                                  title="校正逐字稿文字"
                                >
                                  ✏️
                                </button>
                              </div>
                            </div>
                            {editingTranscriptId === t.id ? (
                              <div className="flex items-center gap-1.5 pt-1">
                                <input
                                  type="text"
                                  data-testid={`summary-page-input-edit-transcript-row-${t.id}`}
                                  value={transcriptDraft}
                                  onChange={(e) => setTranscriptDraft(e.target.value)}
                                  className="flex-1 px-2 py-1 text-xs bg-subtle border border-brand-blue rounded text-text-primary"
                                />
                                <button
                                  type="button"
                                  data-testid={`summary-page-btn-save-transcript-row-${t.id}`}
                                  onClick={() => handleSaveEditTranscript(t.id)}
                                  className="px-2 py-0.5 rounded bg-brand-blue text-white text-[11px] font-medium"
                                >
                                  保存
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingTranscriptId(null)}
                                  className="px-2 py-0.5 rounded bg-subtle text-text-secondary text-[11px]"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <p
                                data-testid={`summary-page-text-transcript-${t.id}`}
                                onClick={() => handleSeekSegment(t.id)}
                                className="text-xs text-text-secondary leading-relaxed cursor-pointer hover:text-brand-blue transition-colors"
                                title="点击直接定位至该句录音并播放"
                              >
                                {t.text}
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <MeetingAudioPlayer
                    ref={playerRef}
                    meetingId={meeting.id}
                    recording={meeting.recording}
                    token={currentUser?.token}
                    warning={meeting.recordingWarning}
                    seekTo={seekRequest}
                    onTime={(seconds) => setPlayingSegmentId(playingSegment(transcripts, seconds))}
                    onDeleteRecording={() => {
                      if (meeting.recording) void cleanupRecordings({ targetIds: [meeting.recording.id] });
                    }}
                  />
                </div>
              ) : (
                /* 会后 Copilot 智能问答与修订工作台 */
                <div
                  data-testid="summary-page-copilot-container"
                  className="flex-1 overflow-hidden flex flex-col bg-canvas"
                >
                  {/* Copilot 顶部说明与快捷提问胶囊 */}
                  <div className="p-3 bg-subtle/50 border-b border-border-subtle space-y-2 shrink-0">
                    <div className="text-[11px] text-text-secondary flex items-center gap-1.5">
                      <span>💡</span>
                      <span>基于本场全量逐字稿与纪要深度问答，或指示 AI 修改报告</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: '🎯 一句话核心总结', prompt: '请用一句话精练概括本场会议的核心目的与最终结论。' },
                        { label: '☑️ 汇总我的待办', prompt: '请列出本场会议中分配给全员的所有行动待办与责任人。' },
                        { label: '⚠️ 潜在风险分歧', prompt: '本场讨论中参会人提出了哪些争议、分歧或潜在技术风险？' },
                        { label: '📝 生成 100 字汇报', prompt: '请将本场会议提炼为适合发送给主管的 100 字通报邮件草稿。' },
                      ].map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          data-testid={`summary-page-copilot-quick-prompt-${idx}`}
                          disabled={isCopilotLoading}
                          onClick={() => handleSendCopilotMessage(item.prompt)}
                          className="px-2 py-1 rounded bg-canvas border border-border-subtle hover:border-brand-blue text-[10px] text-text-secondary hover:text-brand-blue transition-colors disabled:opacity-50"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 消息历史滚动区 */}
                  <div
                    data-testid="summary-page-copilot-messages-list"
                    className="flex-1 overflow-y-auto p-4 space-y-3.5"
                  >
                    {(!meeting.chatHistory || meeting.chatHistory.length === 0) && (
                      <div
                        data-testid="summary-page-copilot-empty-hint"
                        className="text-center py-12 text-xs text-text-tertiary space-y-2"
                      >
                        <span className="text-2xl">🤖</span>
                        <p>还没有与会后 Copilot 的对话记录</p>
                        <p className="text-[11px]">您可以直接在下方输入框提问，或点击上方快捷按钮</p>
                      </div>
                    )}

                    {meeting.chatHistory?.map((msg, idx) => {
                      const isUser = msg.sender === 'user';
                      return (
                        <div
                          key={msg.id || idx}
                          data-testid={
                            isUser
                              ? `summary-page-copilot-msg-user-${idx}`
                              : `summary-page-copilot-msg-ai-${idx}`
                          }
                          className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1.5`}
                        >
                          <div className="flex items-center gap-1.5 text-[10px] text-text-tertiary font-mono">
                            <span>{isUser ? '我' : '听序 Copilot'}</span>
                            <span>{msg.timestamp}</span>
                            {isUser && (
                              <button
                                type="button"
                                data-testid={`summary-page-copilot-btn-copy-user-msg-${idx}`}
                                onClick={() => handleCopyText(msg.content, `user-${idx}`)}
                                className="text-text-tertiary hover:text-text-primary px-1 rounded transition-colors text-[10px] cursor-pointer"
                                title="复制提问"
                              >
                                {copiedCopilotId === `user-${idx}` ? '已复制' : '复制'}
                              </button>
                            )}
                          </div>

                          <div
                            className={`p-3 rounded-xl text-xs leading-relaxed max-w-[90%] shadow-xs ${
                              isUser
                                ? 'bg-brand-blue text-white rounded-tr-none'
                                : 'bg-subtle text-text-primary border border-border-subtle rounded-tl-none space-y-2'
                            }`}
                          >
                            {!isUser && (
                              <div className="flex items-center justify-end pb-1 border-b border-border-subtle/40">
                                <button
                                  type="button"
                                  data-testid={`summary-page-copilot-btn-copy-msg-${idx}`}
                                  onClick={() => handleCopyText(msg.content, `ai-${idx}`)}
                                  className="px-1.5 py-0.5 rounded text-[10px] text-text-secondary hover:text-brand-blue bg-canvas/60 border border-border-subtle/50 hover:border-brand-blue transition-colors flex items-center gap-1 cursor-pointer"
                                  title="复制回答内容"
                                >
                                  <span>{copiedCopilotId === `ai-${idx}` ? '✓' : '📋'}</span>
                                  <span>{copiedCopilotId === `ai-${idx}` ? '已复制' : '复制'}</span>
                                </button>
                              </div>
                            )}

                            <p className="whitespace-pre-wrap">{msg.content}</p>

                            {/* 证据切片引证胶囊 (Citations) */}
                            {!isUser && msg.citations && msg.citations.length > 0 && (
                              <div className="pt-1.5 border-t border-border-subtle/50 space-y-1.5">
                                <div className="flex items-center gap-1 text-[10px] text-text-tertiary font-medium">
                                  <span>🔗</span>
                                  <span>依据发言切片：</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {msg.citations.map((c, cIdx) => {
                                    const matchedSeg = transcripts.find((t) => t.id === c.segmentId);
                                    const speaker = c.speaker || matchedSeg?.speaker;
                                    const timeDisplay = c.timestamp || matchedSeg?.timestamp || c.segmentId;
                                    const quoteText = c.quote || matchedSeg?.text || '';
                                    return (
                                      <button
                                        key={cIdx}
                                        type="button"
                                        data-testid={`summary-page-copilot-citation-${idx}-${cIdx}`}
                                        onClick={() => handleSeekSegment(c.segmentId, c.timestamp, true)}
                                        className="px-2 py-0.5 rounded-md bg-canvas border border-border-subtle hover:border-brand-blue hover:bg-brand-blue/10 text-[10px] text-brand-blue font-mono flex items-center gap-1 transition-all shadow-2xs hover:shadow-xs cursor-pointer group"
                                        title={`点击定位逐字稿并播放现场录音${quoteText ? `\n「${quoteText}」` : ''}`}
                                      >
                                        <span>⏱ {timeDisplay}</span>
                                        {speaker && <span className="text-text-secondary font-sans text-[10px]">· {speaker}</span>}
                                        <span className="text-[10px] opacity-70 group-hover:opacity-100 transition-opacity">↗</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* 修订提案卡片 (Proposals) */}
                            {!isUser && msg.proposals && msg.proposals.length > 0 && (
                              <div className="pt-2 border-t border-border-subtle/60 space-y-2">
                                <div className="text-[11px] font-bold text-brand-blue flex items-center gap-1">
                                  <span>📝</span>
                                  <span>纪要智能修订提案 ({msg.proposals.length})</span>
                                </div>

                                {msg.proposals.map((prop) => (
                                  <div
                                    key={prop.id}
                                    data-testid={`summary-page-copilot-proposal-card-${prop.id}`}
                                    className="p-2.5 rounded-lg bg-canvas border border-brand-blue/30 space-y-1.5 text-xs text-text-primary"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-semibold text-brand-blue text-[11px]">
                                        【
                                        {prop.targetSection === 'overview'
                                          ? '全局综述'
                                          : prop.targetSection === 'actions'
                                          ? '行动待办'
                                          : '关键决策'}
                                        ·
                                        {prop.action === 'replace'
                                          ? '修订替换'
                                          : prop.action === 'add'
                                          ? '新增'
                                          : '移除'}
                                        】
                                      </span>
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          data-testid={`summary-page-copilot-btn-copy-proposal-${prop.id}`}
                                          onClick={() => handleCopyText(prop.proposedText, `prop-${prop.id}`)}
                                          className="px-1.5 py-0.5 rounded text-[10px] text-text-secondary hover:text-brand-blue bg-subtle border border-border-subtle hover:border-brand-blue transition-colors flex items-center gap-1 cursor-pointer"
                                          title="复制此项修订提案"
                                        >
                                          <span>{copiedCopilotId === `prop-${prop.id}` ? '✓' : '📋'}</span>
                                          <span>{copiedCopilotId === `prop-${prop.id}` ? '已复制' : '复制提案'}</span>
                                        </button>
                                        {prop.applied ? (
                                          <span
                                            data-testid={`summary-page-copilot-badge-applied-${prop.id}`}
                                            className="text-[10px] font-semibold text-status-success bg-status-success-bg px-1.5 py-0.5 rounded"
                                          >
                                            ✓ 已采纳并同步
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            data-testid={`summary-page-copilot-btn-apply-proposal-${prop.id}`}
                                            onClick={() => handleApplyProposal(prop)}
                                            className="px-2 py-0.5 rounded bg-brand-blue text-white text-[10px] font-semibold hover:bg-brand-blue-hover transition-colors shadow-xs"
                                          >
                                            ✓ 采纳并更新报告
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {prop.originalText && (
                                      <div className="text-[11px] text-text-tertiary line-through leading-snug">
                                        原内容：{prop.originalText}
                                      </div>
                                    )}

                                    <div className="text-[11px] font-medium text-text-primary leading-snug">
                                      新提议：{prop.proposedText}
                                    </div>

                                    {prop.reason && (
                                      <div className="text-[10px] text-text-secondary">
                                        原因：{prop.reason}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {isCopilotLoading && (
                      <div className="flex items-center gap-2 text-xs text-text-tertiary p-2">
                        <span className="animate-spin">⏳</span>
                        <span>听序 Copilot 正在查阅逐字稿与纪要生成回答...</span>
                      </div>
                    )}
                    <div ref={copilotMessagesEndRef} />
                  </div>

                  {/* 底部提问与指令输入表单 */}
                  <form
                    data-testid="summary-page-copilot-form-ask"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendCopilotMessage();
                    }}
                    className="p-3 border-t border-border-subtle bg-subtle flex items-center gap-2 shrink-0"
                  >
                    <input
                      type="text"
                      data-testid="summary-page-copilot-input-ask"
                      value={copilotInput}
                      disabled={isCopilotLoading}
                      onChange={(e) => setCopilotInput(e.target.value)}
                      placeholder={
                        isCopilotLoading
                          ? '正在分析并生成回答...'
                          : '发问（如：张总反对的原因是什么？）或指示（如：把第2条决策改成...）'
                      }
                      className="flex-1 px-3 py-2 text-xs bg-canvas border border-border-subtle rounded-md focus:outline-none focus:border-brand-blue text-text-primary placeholder:text-text-tertiary disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      data-testid="summary-page-copilot-btn-send"
                      disabled={isCopilotLoading || !copilotInput.trim()}
                      className="px-3.5 py-2 rounded-md bg-brand-blue text-white text-xs font-semibold hover:bg-brand-blue-hover disabled:opacity-40 transition-colors shrink-0 shadow-xs"
                    >
                      发送
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 单场会议 AI 费用与用量明细弹窗 (T04) */}
      {isCostModalOpen && (
        <div
          data-testid="summary-page-modal-cost-breakdown"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn"
          onClick={() => setIsCostModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-panel border border-border-subtle rounded-xl shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <span className="text-lg">📊</span>
                <h3 className="text-base font-bold text-text-primary">本场会议 AI 费用与用量明细</h3>
              </div>
              <button
                type="button"
                data-testid="summary-page-btn-close-cost-modal"
                onClick={() => setIsCostModalOpen(false)}
                className="text-text-tertiary hover:text-text-primary p-1 rounded-md hover:bg-subtle transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-canvas border border-border-subtle rounded-lg p-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-text-secondary">本场实际总花费</div>
                <div className="text-xl font-bold text-emerald-500 tabular-nums font-mono mt-0.5">
                  ￥{(meeting.aiCost?.totalCostYuan ?? 0).toFixed(4)}
                </div>
              </div>
              <div className="text-right text-xs text-text-tertiary font-mono">
                <div>共消耗 {(meeting.aiCost?.totalTokens ?? 0).toLocaleString()} Tokens</div>
                <div>录音时长 {Math.round((meeting.aiCost?.audioSeconds ?? 0) / 60)} 分钟</div>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-semibold text-text-secondary">四维能力费用拆解</div>
              
              {/* 1. 语音识别 */}
              <div className="p-2.5 bg-subtle rounded-lg border border-border-subtle flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">🎙️</span>
                  <div>
                    <div className="font-medium text-text-primary">语音识别 (ASR)</div>
                    <div className="text-[11px] text-text-tertiary font-mono">
                      阿里 DashScope · {meeting.aiCost?.breakdown.asrAudioSeconds ?? 0} 秒 ({Math.round((meeting.aiCost?.breakdown.asrAudioSeconds ?? 0) / 60)} 分钟)
                    </div>
                  </div>
                </div>
                <div className="font-mono font-semibold text-text-primary tabular-nums">
                  ￥{(meeting.aiCost?.breakdown.asrCostYuan ?? 0).toFixed(4)}
                </div>
              </div>

              {/* 2. 实时洞察 */}
              <div className="p-2.5 bg-subtle rounded-lg border border-border-subtle flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">💡</span>
                  <div>
                    <div className="font-medium text-text-primary">实时洞察 (Live Insights)</div>
                    <div className="text-[11px] text-text-tertiary font-mono">
                      DeepSeek-V3 · {(meeting.aiCost?.breakdown.insightsTokens ?? 0).toLocaleString()} Tokens
                    </div>
                  </div>
                </div>
                <div className="font-mono font-semibold text-text-primary tabular-nums">
                  ￥{(meeting.aiCost?.breakdown.insightsCostYuan ?? 0).toFixed(4)}
                </div>
              </div>

              {/* 3. 会中问答 */}
              <div className="p-2.5 bg-subtle rounded-lg border border-border-subtle flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">💬</span>
                  <div>
                    <div className="font-medium text-text-primary">会中问答 (Meeting Chat)</div>
                    <div className="text-[11px] text-text-tertiary font-mono">
                      DeepSeek-V3 · {(meeting.aiCost?.breakdown.chatTokens ?? 0).toLocaleString()} Tokens
                    </div>
                  </div>
                </div>
                <div className="font-mono font-semibold text-text-primary tabular-nums">
                  ￥{(meeting.aiCost?.breakdown.chatCostYuan ?? 0).toFixed(4)}
                </div>
              </div>

              {/* 4. 纪要总结 */}
              <div className="p-2.5 bg-subtle rounded-lg border border-border-subtle flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">📝</span>
                  <div>
                    <div className="font-medium text-text-primary">纪要总结 (Summary)</div>
                    <div className="text-[11px] text-text-tertiary font-mono">
                      DeepSeek-V3 · {(meeting.aiCost?.breakdown.summaryTokens ?? 0).toLocaleString()} Tokens
                    </div>
                  </div>
                </div>
                <div className="font-mono font-semibold text-text-primary tabular-nums">
                  ￥{(meeting.aiCost?.breakdown.summaryCostYuan ?? 0).toFixed(4)}
                </div>
              </div>
            </div>

            <div className="text-[11px] text-text-tertiary bg-canvas p-2.5 rounded-lg border border-border-subtle leading-relaxed">
              🛡️ <span className="font-semibold text-text-secondary">Local-First 隐私模式</span>：用量数据仅记录脱敏的 Token 与音频时长元数据，绝无会议正文上传。
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
