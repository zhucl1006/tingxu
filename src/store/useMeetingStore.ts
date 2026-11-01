import { create } from 'zustand';
import {
  MeetingState,
  MeetingStatus,
  TranscriptSegment,
  InsightCard,
  RevisionProposal,
  NavRoute,
  UserProfile,
  TaskItem,
  HistoryMeeting,
} from '../types/meeting';
import { InsightPatchApplier, InsightPatch } from '../engine/patchApplier';

const patchApplier = new InsightPatchApplier();

const initialHistoryMeetings: HistoryMeeting[] = [];

const initialTasks: TaskItem[] = [];

// 本地存储的用户会话恢复（严格杜绝残留的 mock 假数据）
function loadStoredUser(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('tingxu_user_session');
    if (raw) {
      const user = JSON.parse(raw);
      if (user && user.token && !user.token.startsWith('mock_') && !user.token.startsWith('jwt_mock')) {
        return user;
      }
      localStorage.removeItem('tingxu_user_session');
    }
  } catch {
    // ignore
  }
  return null;
}

const initialMeetingState = {
  status: 'IDLE' as MeetingStatus,
  meetingId: null as string | null,
  title: '未命名会议',
  elapsedSeconds: 0,
  transcripts: [] as TranscriptSegment[],
  insights: [] as InsightCard[],
  highlightedTranscriptId: null as string | null,
  activeWindow: 'workbench' as const,
  currentRoute: 'home' as NavRoute,
  currentUser: loadStoredUser(),
  isLoginModalOpen: false,
  quotaMinutes: 0,
  totalQuotaMinutes: 60,
  initialQuotaSeconds: 0,
  tasks: initialTasks,
  historyMeetings: initialHistoryMeetings,
  activeSummaryMeeting: null as HistoryMeeting | null,
  activeTargetSegmentId: null as string | null,
  isGeneratingSummary: false,
  gatewayUrl: 'http://localhost:3201',
};

export const useMeetingStore = create<MeetingState>((set, get) => ({
  ...initialMeetingState,

  setGatewayUrl: (url: string) => {
    set({ gatewayUrl: url });
  },

  setCurrentRoute: (route: NavRoute) => {
    set({ currentRoute: route });
  },

  setIsLoginModalOpen: (open: boolean) => {
    set({ isLoginModalOpen: open });
  },

  loginUser: (user: UserProfile) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('tingxu_user_session', JSON.stringify(user));
    }
    set({ currentUser: user, isLoginModalOpen: false });
    get().refreshUserBalance();
  },

  logoutUser: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('tingxu_user_session');
    }
    set({ currentUser: null, quotaMinutes: 0 });
  },

  setQuotaMinutes: (minutes: number) => {
    set({ quotaMinutes: minutes });
  },

  refreshUserBalance: async () => {
    const user = get().currentUser;
    if (!user) return;
    try {
      const res = await fetch(`http://localhost:3200/v1/billing/balance?userId=${encodeURIComponent(user.userId)}`, {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.code === 0 && json.data) {
          const availableMinutes = Math.floor((json.data.totalAvailableSeconds || 0) / 60);
          set({
            quotaMinutes: availableMinutes,
            totalQuotaMinutes: Math.max(60, availableMinutes),
          });
        }
      }
    } catch (e) {
      console.warn('[MeetingStore] 刷新时长余额失败:', (e as Error).message);
    }
  },

  toggleTask: (id: string) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, completed: !t.completed } : t
      ),
    }));
  },

  startMeeting: (title = '新会议讨论') => {
    const currentQuota = get().quotaMinutes || 0;
    const initialSec = currentQuota * 60;
    set({
      status: 'RECORDING',
      meetingId: `mtg_${Date.now()}`,
      title,
      elapsedSeconds: 0,
      initialQuotaSeconds: initialSec,
      transcripts: [],
      insights: [],
      highlightedTranscriptId: null,
      currentRoute: 'record',
    });
  },

  pauseMeeting: () => {
    if (get().status === 'RECORDING') {
      set({ status: 'PAUSED' });
    }
  },

  resumeMeeting: () => {
    if (get().status === 'PAUSED') {
      set({ status: 'RECORDING' });
    }
  },

  setActiveSummaryMeeting: (meeting: HistoryMeeting | null, targetSegmentId?: string) => {
    set({
      activeSummaryMeeting: meeting,
      activeTargetSegmentId: targetSegmentId || null,
      currentRoute: meeting ? 'summary' : 'home',
    });
  },

  renameSpeaker: (oldName: string, newName: string) => {
    if (!oldName || !newName || oldName.trim() === newName.trim()) return;
    const cleanNew = newName.trim();
    set((state) => {
      const updatedTranscripts = state.transcripts.map((t) =>
        t.speaker === oldName ? { ...t, speaker: cleanNew } : t
      );

      const updateMeeting = (m: HistoryMeeting): HistoryMeeting => {
        const newSpeakers = Array.from(
          new Set((m.speakers || []).map((s) => (s === oldName ? cleanNew : s)))
        );
        const newTranscripts = (m.transcripts || []).map((t) =>
          t.speaker === oldName ? { ...t, speaker: cleanNew } : t
        );
        return {
          ...m,
          speakers: newSpeakers,
          transcripts: newTranscripts,
        };
      };

      const updatedHistory = state.historyMeetings.map((m) => updateMeeting(m));
      const updatedActive = state.activeSummaryMeeting ? updateMeeting(state.activeSummaryMeeting) : null;

      return {
        transcripts: updatedTranscripts,
        historyMeetings: updatedHistory,
        activeSummaryMeeting: updatedActive,
      };
    });
  },

  setIsGeneratingSummary: (generating: boolean) => {
    set({ isGeneratingSummary: generating });
  },

  updateMeetingTitle: (newTitle: string) => {
    set({ title: newTitle });
  },

  endMeeting: async () => {
    const { meetingId, title, elapsedSeconds, insights, transcripts, historyMeetings, tasks, gatewayUrl } = get();

    if (!meetingId || elapsedSeconds === 0) {
      set({ status: 'ENDED', currentRoute: 'home' });
      return;
    }

    set({ isGeneratingSummary: true });

    let finalTitle = title;
    let structuredSummary: any = undefined;
    const finalInsights = [...insights];

    // 格式化当前日期时间作为后缀 (YYYY-MM-DD HH:mm)
    const now = new Date();
    const timeSuffix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // 若有逐字稿，调用 AI Gateway 执行全场高精总结与标题提炼
    if (transcripts.length > 0) {
      try {
        const res = await fetch(`${gatewayUrl}/gateway/v1/meeting-summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetingId,
            transcripts: transcripts.map((t) => ({
              segmentId: t.id,
              speaker: t.speaker,
              text: t.text,
            })),
          }),
        });

        if (res.ok) {
          const json = await res.json();
          if (json.code === 0 && json.data) {
            structuredSummary = json.data;

            // 1. 自动生成标题：结合对话提炼的主题 + 日期时间
            if (structuredSummary?.suggestedTitle) {
              const cleanSuggested = structuredSummary.suggestedTitle.trim();
              const isDefaultTitle = !title || title.startsWith('会议记录') || title.startsWith('新会议') || title.startsWith('未命名');
              if (isDefaultTitle) {
                finalTitle = `${cleanSuggested} ${timeSuffix}`;
              } else if (!title.includes(timeSuffix)) {
                finalTitle = `${title} ${timeSuffix}`;
              }
            }

            // 2. 将提炼出的结论、待办、风险、事实注入最终洞察卡片列表
            if (structuredSummary) {
              const nowFormatted = new Date().toLocaleTimeString('zh-CN', { hour12: false });
              
              structuredSummary.decisions?.forEach((d: any, idx: number) => {
                if (!finalInsights.some((i) => i.title === d.title || i.content === d.content)) {
                  finalInsights.push({
                    id: `sum_dec_${Date.now()}_${idx}`,
                    type: 'decision',
                    title: d.title,
                    content: d.content,
                    timestamp: nowFormatted,
                    evidenceSegmentId: d.evidenceSegmentId || transcripts[0]?.id || '',
                    isConfirmed: false,
                    isEdited: false,
                  });
                }
              });

              structuredSummary.actions?.forEach((a: any, idx: number) => {
                if (!finalInsights.some((i) => i.title === a.title || i.content.includes(a.title))) {
                  finalInsights.push({
                    id: `sum_act_${Date.now()}_${idx}`,
                    type: 'action',
                    title: `待办：${a.title}`,
                    content: a.assignee ? `负责人: ${a.assignee}；${a.title}` : a.title,
                    timestamp: nowFormatted,
                    evidenceSegmentId: a.evidenceSegmentId || transcripts[0]?.id || '',
                    isConfirmed: false,
                    isEdited: false,
                  });
                }
              });

              structuredSummary.risks?.forEach((r: any, idx: number) => {
                if (!finalInsights.some((i) => i.title.includes(r.title))) {
                  finalInsights.push({
                    id: `sum_risk_${Date.now()}_${idx}`,
                    type: 'risk',
                    title: `风险：${r.title}`,
                    content: r.content,
                    timestamp: nowFormatted,
                    evidenceSegmentId: transcripts[0]?.id || '',
                    isConfirmed: false,
                    isEdited: false,
                  });
                }
              });

              structuredSummary.facts?.forEach((f: any, idx: number) => {
                if (!finalInsights.some((i) => i.title.includes(f.title))) {
                  finalInsights.push({
                    id: `sum_fact_${Date.now()}_${idx}`,
                    type: 'fact',
                    title: `事实：${f.title}`,
                    content: f.content,
                    timestamp: nowFormatted,
                    evidenceSegmentId: transcripts[0]?.id || '',
                    isConfirmed: false,
                    isEdited: false,
                  });
                }
              });
            }
          }
        }
      } catch (err) {
        console.warn('[EndMeeting] AI summary extraction failed, fallback to local insights:', err);
      }
    }

    // 若无大模型响应，兜底保障标题带日期时间
    if (!finalTitle.includes(timeSuffix)) {
      finalTitle = `${finalTitle} ${timeSuffix}`;
    }

    // 提炼发言人/参会人名单
    const derivedSpeakers = Array.from(
      new Set(transcripts.map((t) => t.speaker).filter(Boolean))
    );

    // 组装结构化历史会议
    const newHistory: HistoryMeeting = {
      id: meetingId,
      title: finalTitle,
      date: timeSuffix,
      durationSeconds: elapsedSeconds,
      summary: structuredSummary?.overview || (finalInsights.length
        ? finalInsights.map((i) => i.title).join('；')
        : '本场会议已圆满结束，本地逐字稿已原子加密归档。'),
      decisionsCount: finalInsights.filter((i) => i.type === 'decision').length,
      tasksCount: finalInsights.filter((i) => i.type === 'action').length,
      speakers: derivedSpeakers.length ? derivedSpeakers : ['本人麦克风'],
      structuredSummary,
      insights: finalInsights,
      transcripts: [...transcripts],
    };

    // 提取本场待办，同步录入系统待办清单
    const newTasks: TaskItem[] = finalInsights
      .filter((i) => i.type === 'action')
      .map((i) => ({
        id: `task_${Date.now()}_${i.id}`,
        title: i.content,
        meetingId: meetingId,
        meetingTitle: finalTitle,
        assignee: '待确认',
        completed: false,
        createdAt: new Date().toISOString().slice(0, 10),
        evidenceSegmentId: i.evidenceSegmentId,
      }));

    set({
      status: 'ENDED',
      title: finalTitle,
      insights: finalInsights,
      historyMeetings: [newHistory, ...historyMeetings],
      tasks: [...newTasks, ...tasks],
      activeSummaryMeeting: newHistory, // 自动激活总结详情查看
      isGeneratingSummary: false,
      currentRoute: 'summary',
    });

    // 真实向商业控制面结算扣减本次会议消耗的时长
    const currentUser = get().currentUser;
    if (currentUser && elapsedSeconds > 0) {
      try {
        await fetch('http://localhost:3200/v1/billing/deduct', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentUser.token}`,
          },
          body: JSON.stringify({
            userId: currentUser.userId,
            seconds: elapsedSeconds,
            meetingId: meetingId || undefined,
          }),
        });
      } catch (err) {
        console.warn('[MeetingStore] 扣减会议时长网络异常:', err);
      }
      get().refreshUserBalance();
    }
  },

  tickTimer: () => {
    if (get().status === 'RECORDING') {
      const nextElapsed = get().elapsedSeconds + 1;
      const initialSec = get().initialQuotaSeconds || (get().quotaMinutes * 60);
      const remainingSec = Math.max(0, initialSec - nextElapsed);
      const calculatedMinutes = Math.floor(remainingSec / 60);

      set({
        elapsedSeconds: nextElapsed,
        initialQuotaSeconds: initialSec,
        quotaMinutes: calculatedMinutes,
      });
    }
  },

  addTranscriptSegment: (segment: TranscriptSegment) => {
    set((state) => ({
      transcripts: [...state.transcripts, segment],
    }));
  },

  addInsight: (insight) => {
    set((state) => ({
      insights: [
        ...state.insights,
        {
          ...insight,
          isConfirmed: false,
          isEdited: false,
        },
      ],
    }));
  },

  applyInsightPatch: (patch: InsightPatch) => {
    set((state) => ({
      insights: patchApplier.apply(state.insights, patch),
    }));
  },

  confirmInsight: (id: string) => {
    set((state) => ({
      insights: state.insights.map((item) =>
        item.id === id ? { ...item, isConfirmed: true } : item
      ),
    }));
  },

  editInsight: (id: string, newContent: string) => {
    set((state) => ({
      insights: state.insights.map((item) =>
        item.id === id ? { ...item, content: newContent, isEdited: true } : item
      ),
    }));
  },

  proposeInsightRevision: (id: string, proposal: RevisionProposal) => {
    set((state) => ({
      insights: state.insights.map((item) => {
        if (item.id !== id) return item;

        // 核心铁律（Human Protection）：已确认或编辑过的卡片，严禁算法原地覆盖，只能挂载待复核修订
        if (item.isConfirmed || item.isEdited) {
          return {
            ...item,
            pendingRevision: proposal,
          };
        }

        // 未确认卡片，若直接更新则覆盖
        return {
          ...item,
          content: proposal.proposedText,
          timestamp: proposal.timestamp,
          evidenceSegmentId: proposal.evidenceSegmentId,
        };
      }),
    }));
  },

  keepCurrentInsightVersion: (id: string) => {
    set((state) => ({
      insights: state.insights.map((item) =>
        item.id === id ? { ...item, pendingRevision: undefined } : item
      ),
    }));
  },

  acceptInsightRevision: (id: string) => {
    set((state) => ({
      insights: state.insights.map((item) => {
        if (item.id === id && item.pendingRevision) {
          return {
            ...item,
            content: item.pendingRevision.proposedText,
            timestamp: item.pendingRevision.timestamp,
            evidenceSegmentId: item.pendingRevision.evidenceSegmentId,
            isEdited: true,
            pendingRevision: undefined,
          };
        }
        return item;
      }),
    }));
  },

  setHighlightedTranscriptId: (id: string | null) => {
    set({ highlightedTranscriptId: id });
  },

  setActiveWindow: (window: 'workbench' | 'floating-pill') => {
    set({ activeWindow: window });
  },

  resetMeeting: () => {
    set({
      status: 'IDLE',
      meetingId: null,
      title: '未命名会议',
      elapsedSeconds: 0,
      transcripts: [],
      insights: [],
      highlightedTranscriptId: null,
      currentRoute: 'home',
    });
  },
}));
