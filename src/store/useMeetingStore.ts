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

const initialHistoryMeetings: HistoryMeeting[] = [];

const initialTasks: TaskItem[] = [];

// 本地存储的用户会话恢复
function loadStoredUser(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('tingxu_user_session');
    if (raw) return JSON.parse(raw);
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
  quotaMinutes: 540,
  totalQuotaMinutes: 600,
  tasks: initialTasks,
  historyMeetings: initialHistoryMeetings,
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
  },

  logoutUser: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('tingxu_user_session');
    }
    set({ currentUser: null });
  },

  setQuotaMinutes: (minutes: number) => {
    set({ quotaMinutes: minutes });
  },

  toggleTask: (id: string) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, completed: !t.completed } : t
      ),
    }));
  },

  startMeeting: (title = '新会议讨论') => {
    set({
      status: 'RECORDING',
      meetingId: `mtg_${Date.now()}`,
      title,
      elapsedSeconds: 0,
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

  endMeeting: () => {
    const { meetingId, title, elapsedSeconds, insights, historyMeetings, tasks } = get();
    // 结束会议时，归档到历史会议
    if (meetingId && elapsedSeconds > 0) {
      const newHistory: HistoryMeeting = {
        id: meetingId,
        title: title || '已结束会议',
        date: new Date().toLocaleString('zh-CN', { hour12: false }),
        durationSeconds: elapsedSeconds,
        summary: insights.length
          ? insights.map((i) => i.title).join('；')
          : '本场会议已圆满结束，本地逐字稿已原子加密归档。',
        decisionsCount: insights.filter((i) => i.type === 'decision').length,
        tasksCount: insights.filter((i) => i.type === 'action').length,
      };

      // 提取本场产生的待办
      const newTasks: TaskItem[] = insights
        .filter((i) => i.type === 'action')
        .map((i) => ({
          id: `task_${Date.now()}_${i.id}`,
          title: i.content,
          meetingTitle: title,
          assignee: '待确认',
          completed: false,
          createdAt: new Date().toISOString().slice(0, 10),
          evidenceSegmentId: i.evidenceSegmentId,
        }));

      set({
        status: 'ENDED',
        historyMeetings: [newHistory, ...historyMeetings],
        tasks: [...newTasks, ...tasks],
        currentRoute: 'home',
      });
    } else {
      set({ status: 'ENDED', currentRoute: 'home' });
    }
  },

  tickTimer: () => {
    if (get().status === 'RECORDING') {
      set((state) => ({ elapsedSeconds: state.elapsedSeconds + 1 }));
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
