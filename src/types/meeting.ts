export type MeetingStatus = 'IDLE' | 'RECORDING' | 'PAUSED' | 'ENDED';

export type InsightType = 'decision' | 'action' | 'risk' | 'fact';

export interface RevisionProposal {
  id: string;
  proposedText: string;
  reason: string;
  timestamp: string;
  evidenceSegmentId: string;
}

export interface InsightCard {
  id: string;
  type: InsightType;
  title: string;
  content: string;
  timestamp: string;
  evidenceSegmentId: string;
  isConfirmed: boolean;
  isEdited: boolean;
  pendingRevision?: RevisionProposal;
}

export interface TranscriptSegment {
  id: string;
  speaker: string;
  channel: 'mic' | 'system';
  timestamp: string;
  text: string;
  isStreaming?: boolean;
}

export interface MeetingState {
  status: MeetingStatus;
  meetingId: string | null;
  title: string;
  elapsedSeconds: number;
  transcripts: TranscriptSegment[];
  insights: InsightCard[];
  highlightedTranscriptId: string | null;
  activeWindow: 'workbench' | 'floating-pill';
  
  // Actions
  startMeeting: (title?: string) => void;
  pauseMeeting: () => void;
  resumeMeeting: () => void;
  endMeeting: () => void;
  tickTimer: () => void;
  addTranscriptSegment: (segment: TranscriptSegment) => void;
  addInsight: (insight: Omit<InsightCard, 'isConfirmed' | 'isEdited'>) => void;
  confirmInsight: (id: string) => void;
  editInsight: (id: string, newContent: string) => void;
  proposeInsightRevision: (id: string, proposal: RevisionProposal) => void;
  keepCurrentInsightVersion: (id: string) => void;
  acceptInsightRevision: (id: string) => void;
  setHighlightedTranscriptId: (id: string | null) => void;
  setActiveWindow: (window: 'workbench' | 'floating-pill') => void;
  resetMeeting: () => void;
}
