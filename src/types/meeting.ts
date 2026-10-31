export type MeetingStatus = 'IDLE' | 'RECORDING' | 'PAUSED' | 'ENDED';

export type InsightType = 'decision' | 'action' | 'risk' | 'fact';

export type NavRoute = 'home' | 'record' | 'tasks' | 'search' | 'billing' | 'settings';

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
  timestampSeconds?: number;
  text: string;
  isStreaming?: boolean;
}

export interface UserProfile {
  userId: string;
  phone: string;
  token: string;
  role?: 'USER' | 'OPERATOR' | 'OWNER';
}

export interface TaskItem {
  id: string;
  title: string;
  meetingTitle: string;
  assignee: string;
  completed: boolean;
  createdAt: string;
  evidenceSegmentId?: string;
}

export interface HistoryMeeting {
  id: string;
  title: string;
  date: string;
  durationSeconds: number;
  summary: string;
  decisionsCount: number;
  tasksCount: number;
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
  
  // 导航与路由
  currentRoute: NavRoute;
  setCurrentRoute: (route: NavRoute) => void;

  // 用户与登录
  currentUser: UserProfile | null;
  isLoginModalOpen: boolean;
  setIsLoginModalOpen: (open: boolean) => void;
  loginUser: (user: UserProfile) => void;
  logoutUser: () => void;

  // 用量与配额
  quotaMinutes: number;
  totalQuotaMinutes: number;
  setQuotaMinutes: (minutes: number) => void;

  // 待办与历史
  tasks: TaskItem[];
  toggleTask: (id: string) => void;
  historyMeetings: HistoryMeeting[];
  
  // 网关地址
  gatewayUrl: string;
  setGatewayUrl: (url: string) => void;

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
