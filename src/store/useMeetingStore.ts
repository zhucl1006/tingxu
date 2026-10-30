import { create } from 'zustand';
import { MeetingState, MeetingStatus, TranscriptSegment, InsightCard, RevisionProposal } from '../types/meeting';

const initialMeetingState = {
  status: 'IDLE' as MeetingStatus,
  meetingId: null as string | null,
  title: '未命名会议',
  elapsedSeconds: 0,
  transcripts: [] as TranscriptSegment[],
  insights: [] as InsightCard[],
  highlightedTranscriptId: null as string | null,
  activeWindow: 'workbench' as const,
};

export const useMeetingStore = create<MeetingState>((set, get) => ({
  ...initialMeetingState,

  startMeeting: (title = '未命名会议') => {
    set({
      status: 'RECORDING',
      meetingId: `mtg_${Date.now()}`,
      title,
      elapsedSeconds: 0,
      transcripts: [],
      insights: [],
      highlightedTranscriptId: null,
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
    set({ status: 'ENDED' });
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
    set({ ...initialMeetingState });
  },
}));
