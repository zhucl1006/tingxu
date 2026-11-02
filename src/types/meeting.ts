export type MeetingStatus = 'IDLE' | 'RECORDING' | 'PAUSED' | 'ENDED';

export type InsightType = 'decision' | 'action' | 'risk' | 'fact' | 'qa';

export type NavRoute = 'home' | 'record' | 'tasks' | 'search' | 'billing' | 'settings' | 'summary';

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
  question?: string;
  timestamp: string;
  evidenceSegmentId: string;
  isConfirmed: boolean;
  isEdited: boolean;
  pendingRevision?: RevisionProposal;
  assignee?: string;
  dueDate?: string;
}

export interface TranscriptSegment {
  id: string;
  speaker: string;
  speakerId?: string;
  speakerConfidence?: number;
  speakerColorIndex?: number;
  matchedProfileId?: string | null;
  tentativeProfileId?: string | null;
  tentativeProfileName?: string | null;
  channel: 'mic' | 'system';
  timestamp: string;
  timestampSeconds?: number;
  beginTimeMs?: number;
  endTimeMs?: number;
  text: string;
  isStreaming?: boolean;
}

export interface SpeakerVoiceprintProfile {
  profileId: string;
  accountId: string;
  displayName: string;
  embedding: number[];
  embeddingDim: number;
  modelId: string;
  modelVersion: string;
  sampleDurationMs: number;
  consentAt: number;
  createdAt: number;
  lastMatchedAt?: number;
}

export interface RegisterSpeakerProfileInput {
  displayName: string;
  embedding: number[];
  sampleDurationMs?: number;
  consented?: boolean;
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
  meetingId?: string;
  meetingTitle: string;
  assignee: string;
  completed: boolean;
  createdAt: string;
  evidenceSegmentId?: string;
}

export interface SummaryDecisionItem {
  title: string;
  content: string;
  evidenceQuote?: string;
  evidenceSegmentId?: string;
}

export interface SummaryActionItem {
  title: string;
  assignee?: string;
  dueDate?: string;
  evidenceQuote?: string;
  evidenceSegmentId?: string;
}

export interface SummaryRiskItem {
  title: string;
  content: string;
  evidenceQuote?: string;
}

export interface SummaryFactItem {
  title: string;
  content: string;
  evidenceQuote?: string;
}

export interface MeetingStructuredSummary {
  suggestedTitle: string;
  overview: string;
  decisions: SummaryDecisionItem[];
  actions: SummaryActionItem[];
  risks: SummaryRiskItem[];
  facts: SummaryFactItem[];
}

export interface HistoryMeeting {
  id: string;
  title: string;
  date: string;
  durationSeconds: number;
  summary: string;
  decisionsCount: number;
  tasksCount: number;
  speakers?: string[];
  // 完整纪要与四维总结资产
  structuredSummary?: MeetingStructuredSummary;
  insights?: InsightCard[];
  transcripts?: TranscriptSegment[];
}

export type ThemeMode = 'system' | 'light' | 'dark';
export type FontSizeScale = 'small' | 'medium' | 'large' | 'xlarge';
export type FontFamilyStyle = 'sans' | 'serif' | 'mono';
export type ContentDensity = 'comfortable' | 'compact';

export interface UiAppearanceSettings {
  theme: ThemeMode;
  fontSize: FontSizeScale;
  fontFamily: FontFamilyStyle;
  density: ContentDensity;
}

export const DEFAULT_APPEARANCE_SETTINGS: UiAppearanceSettings = {
  theme: 'system',
  fontSize: 'medium',
  fontFamily: 'sans',
  density: 'comfortable',
};

// 声纹聚类与说话人分离参数配置
export type VoiceprintPresetMode = 'single' | 'balanced' | 'sensitive' | 'custom';

export interface VoiceprintConfigSettings {
  presetMode: VoiceprintPresetMode;
  similarityThreshold: number; // 聚类相似度阈值 (0.45 ~ 0.75，默认 0.58)
  continuityThreshold: number; // 发言人连续性惯性阻尼阈值 (0.40 ~ 0.65，默认 0.48)
  minClusterDurationMs: number; // 创建新说话人最短有效时长 (800 ~ 3000ms，默认 1200ms)
}

export const DEFAULT_VOICEPRINT_SETTINGS: VoiceprintConfigSettings = {
  presetMode: 'balanced',
  similarityThreshold: 0.58,
  continuityThreshold: 0.48,
  minClusterDurationMs: 1200,
};

export const VOICEPRINT_PRESET_CONFIGS: Record<
  Exclude<VoiceprintPresetMode, 'custom'>,
  Omit<VoiceprintConfigSettings, 'presetMode'>
> = {
  single: {
    similarityThreshold: 0.52,
    continuityThreshold: 0.42,
    minClusterDurationMs: 2000,
  },
  balanced: {
    similarityThreshold: 0.58,
    continuityThreshold: 0.48,
    minClusterDurationMs: 1200,
  },
  sensitive: {
    similarityThreshold: 0.65,
    continuityThreshold: 0.54,
    minClusterDurationMs: 800,
  },
};

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
  initialQuotaSeconds?: number;
  setQuotaMinutes: (minutes: number) => void;
  refreshUserBalance: () => Promise<void>;

  // 待办与历史
  tasks: TaskItem[];
  toggleTask: (id: string) => void;
  historyMeetings: HistoryMeeting[];
  activeSummaryMeeting: HistoryMeeting | null;
  activeTargetSegmentId?: string | null;
  setActiveSummaryMeeting: (meeting: HistoryMeeting | null, targetSegmentId?: string) => void;
  speakerNames: Record<string, string>;
  renameSpeaker: (speakerIdOrOldName: string, newName: string) => void;
  speakerProfiles: SpeakerVoiceprintProfile[];
  voiceprintConsentAt: number | null;
  grantVoiceprintConsent: () => number;
  registerSpeakerProfile: (input: RegisterSpeakerProfileInput) => SpeakerVoiceprintProfile | null;
  renameSpeakerProfile: (profileId: string, newName: string) => void;
  deleteSpeakerProfile: (profileId: string) => void;
  clearSpeakerProfiles: () => void;
  markProfileMatched: (profileId: string) => void;
  dismissTentativeMatch: (speakerId: string, profileId: string) => void;
  isGeneratingSummary: boolean;
  setIsGeneratingSummary: (generating: boolean) => void;
  updateMeetingTitle: (newTitle: string) => void;
  
  // 网关地址
  gatewayUrl: string;
  setGatewayUrl: (url: string) => void;

  // 界面外观与排版样式
  appearanceSettings: UiAppearanceSettings;
  setAppearanceSettings: (settings: Partial<UiAppearanceSettings>) => void;
  resetAppearanceSettings: () => void;

  // 声纹识别与说话人分离参数配置
  voiceprintSettings: VoiceprintConfigSettings;
  setVoiceprintPresetMode: (mode: VoiceprintPresetMode) => void;
  updateVoiceprintSettings: (settings: Partial<VoiceprintConfigSettings>) => void;
  resetVoiceprintSettings: () => void;

  // Actions
  startMeeting: (title?: string) => void;
  pauseMeeting: () => void;
  resumeMeeting: () => void;
  endMeeting: () => void;
  tickTimer: () => void;
  addTranscriptSegment: (segment: TranscriptSegment) => void;
  addInsight: (insight: Omit<InsightCard, 'isConfirmed' | 'isEdited'>) => void;
  applyInsightPatch: (patch: any) => void;
  confirmInsight: (id: string) => void;
  editInsight: (id: string, newContent: string) => void;
  proposeInsightRevision: (id: string, proposal: RevisionProposal) => void;
  keepCurrentInsightVersion: (id: string) => void;
  acceptInsightRevision: (id: string) => void;
  setHighlightedTranscriptId: (id: string | null) => void;
  setActiveWindow: (window: 'workbench' | 'floating-pill') => void;
  deleteHistoryMeeting: (id: string) => void;
  clearAllHistory: () => void;
  resetMeeting: () => void;
}
