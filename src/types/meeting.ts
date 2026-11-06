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
  speakerStatus?: 'pending' | 'assigned' | 'unknown';
  speakerManuallyNamed?: boolean;
  speakerColorIndex?: number;
  matchedProfileId?: string | null;
  tentativeProfileId?: string | null;
  tentativeProfileName?: string | null;
  channel: 'mic' | 'system';
  timestamp: string;
  timestampSeconds?: number;
  recordingBeginMs?: number;
  recordingEndMs?: number;
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

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'canceled';
export type TaskPriority = 'high' | 'medium' | 'low';

export interface TaskItem {
  id: string;
  title: string;
  meetingId?: string;
  meetingTitle: string;
  assignee: string;
  completed: boolean;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
  evidenceSegmentId?: string;
}

export interface SummaryDecisionItem {
  title: string;
  content: string;
  evidenceQuote?: string;
  evidenceSegmentId?: string;
}

export interface SummaryActionItem {
  id?: string;
  title: string;
  content?: string;
  assignee?: string;
  dueDate?: string;
  evidenceQuote?: string;
  evidenceSegmentId?: string;
  isConfirmed?: boolean;
  taskId?: string;
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

export interface RecordingReference {
  id: string;
  samples: number;
  sampleRate: number;
}

export interface SummaryRevisionProposal {
  id: string;
  targetSection: 'overview' | 'decisions' | 'actions' | 'risks' | 'facts';
  action: 'replace' | 'add' | 'delete';
  itemIndex?: number;
  originalText?: string;
  proposedText: string;
  reason?: string;
  applied?: boolean;
}

export interface MeetingChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: Array<{ segmentId: string; speaker?: string; timestamp?: string; quote?: string }>;
  proposals?: SummaryRevisionProposal[];
}

export interface MeetingAiCostBreakdown {
  asrCostYuan: number;
  asrAudioSeconds: number;
  insightsCostYuan: number;
  insightsTokens: number;
  summaryCostYuan: number;
  summaryTokens: number;
  chatCostYuan: number;
  chatTokens: number;
}

export interface MeetingAiCost {
  totalCostYuan: number;
  totalTokens: number;
  audioSeconds: number;
  breakdown: MeetingAiCostBreakdown;
  recordsCount: number;
  updatedAt: string;
}

export interface HistoryMeeting {
  recording?: RecordingReference;
  recordingWarning?: string;
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
  chatHistory?: MeetingChatMessage[];
  aiCost?: MeetingAiCost;
}

export interface StorageSettings {
  autoCleanupDays: number; // 0 = 从不清理, 7, 14, 30, 90
  lastCleanupAt?: number;
}

export const DEFAULT_STORAGE_SETTINGS: StorageSettings = {
  autoCleanupDays: 0,
};

export interface DetectedMeetingApp {
  appName: string;
  appId: string;
  processName: string;
}

export interface MeetingDetectionSettings {
  enabled: boolean;          // 是否启用第三方会议软件启动检测，默认 true
  floatingWidget: boolean;   // 桌面是否默认常驻快速悬浮图示，默认 true
}

export const DEFAULT_DETECTION_SETTINGS: MeetingDetectionSettings = {
  enabled: true,
  floatingWidget: true,
};

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

export type AppRunMode = 'standalone';
export type LlmProviderType = 'deepseek' | 'qwen' | 'custom' | 'ollama';
export type AsrProviderType = 'dashscope' | 'custom';

export interface ByokSettings {
  mode?: AppRunMode;
  llmProvider: LlmProviderType;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  asrProvider: AsrProviderType;
  asrApiKey: string;
  asrEndpoint: string;
}

export const DEFAULT_BYOK_SETTINGS: ByokSettings = {
  mode: 'standalone',
  llmProvider: 'deepseek',
  llmApiKey: '',
  llmBaseUrl: 'https://api.deepseek.com/v1',
  llmModel: 'deepseek-chat',
  asrProvider: 'dashscope',
  asrApiKey: '',
  asrEndpoint: 'wss://dashscope.aliyuncs.com/api-ws/v1/inference',
};

// 实时洞察模式与控频配置 (026 算力降费)
export type LiveInsightMode = 'manual' | 'periodic' | 'disabled';

export interface LiveInsightSettings {
  mode: LiveInsightMode; // 'manual': 手动按需; 'periodic': 周期自动; 'disabled': 完全关闭
  intervalSeconds: number; // 周期提炼秒数，默认 120 (可调 60/120/180/300)
  minCharsThreshold: number; // 触发最小字数门槛，默认 400
}

export const DEFAULT_LIVE_INSIGHT_SETTINGS: LiveInsightSettings = {
  mode: 'manual', // 默认推荐手动，最大限度节省费用
  intervalSeconds: 120,
  minCharsThreshold: 400,
};

// 声纹聚类与说话人分离参数配置
export type VoiceprintPresetMode = 'single' | 'balanced' | 'sensitive' | 'custom';

export interface VoiceprintConfigSettings {
  enabled: boolean; // 是否开启说话人区分，默认 false（单轨会议录音识别，不区分发言人）
  presetMode: VoiceprintPresetMode;
  similarityThreshold: number; // 聚类相似度阈值 (0.45 ~ 0.75，默认 0.58)
  continuityThreshold: number; // 发言人连续性惯性阻尼阈值 (0.40 ~ 0.65，默认 0.48)
  minClusterDurationMs: number; // 创建新说话人最短有效时长 (800 ~ 3000ms，默认 1200ms)
}

export const DEFAULT_VOICEPRINT_SETTINGS: VoiceprintConfigSettings = {
  enabled: false,
  presetMode: 'balanced',
  similarityThreshold: 0.58,
  continuityThreshold: 0.48,
  minClusterDurationMs: 1200,
};

export const VOICEPRINT_PRESET_CONFIGS: Record<
  Exclude<VoiceprintPresetMode, 'custom'>,
  Omit<VoiceprintConfigSettings, 'presetMode' | 'enabled'>
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
  isTitleManuallyEdited?: boolean;
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
  aiCost: MeetingAiCost | null;
  fetchMeetingAiCost: (meetingId: string) => Promise<MeetingAiCost | null>;

  // 待办与任务生命周期
  tasks: TaskItem[];
  toggleTask: (id: string) => void;
  createTask: (input: {
    title: string;
    meetingId?: string;
    meetingTitle?: string;
    assignee?: string;
    priority?: TaskPriority;
    dueDate?: string;
    description?: string;
    evidenceSegmentId?: string;
  }) => TaskItem;
  updateTask: (id: string, patch: Partial<Omit<TaskItem, 'id' | 'createdAt'>>) => void;
  deleteTask: (id: string) => void;
  setTaskStatus: (id: string, status: TaskStatus) => void;
  clearCompletedTasks: () => void;
  confirmActionToTask: (meetingId: string, actionIndex: number) => TaskItem | null;
  batchConfirmActionsToTasks: (meetingId: string) => TaskItem[];
  removeActionFromTask: (meetingId: string, actionIndex: number) => void;
  batchSetTaskStatus: (ids: string[], status: TaskStatus) => void;
  batchDeleteTasks: (ids: string[]) => void;
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

  // 自带密钥与运行模式 (BYOK / Standalone)
  byokSettings: ByokSettings;
  updateByokSettings: (settings: Partial<ByokSettings>) => void;
  resetByokSettings: () => void;

  // 界面外观与排版样式
  appearanceSettings: UiAppearanceSettings;
  setAppearanceSettings: (settings: Partial<UiAppearanceSettings>) => void;
  resetAppearanceSettings: () => void;

  // 本地录音存储空间与清理策略
  storageSettings: StorageSettings;
  storageUsage: { totalBytes: number; recordingCount: number };
  isStorageLoading: boolean;
  refreshStorageUsage: () => Promise<void>;
  updateStorageSettings: (settings: Partial<StorageSettings>) => void;
  cleanupRecordings: (options?: { olderThanDays?: number; targetIds?: string[] }) => Promise<{ freedBytes: number; deletedCount: number; deletedIds: string[] }>;
  runAutoCleanupIfNeeded: () => Promise<void>;

  // 第三方会议感知与桌面悬浮挂件
  detectedMeetingApp: DetectedMeetingApp | null;
  meetingDetectionSettings: MeetingDetectionSettings;
  dismissedMeetingAppUntil: Record<string, number>;
  setDetectedMeetingApp: (app: DetectedMeetingApp | null) => void;
  dismissDetectedMeetingApp: (appId: string) => void;
  quickStartDetectedMeeting: (app: DetectedMeetingApp) => Promise<void>;
  updateMeetingDetectionSettings: (settings: Partial<MeetingDetectionSettings>) => Promise<void>;

  // 声纹识别与说话人分离参数配置
  voiceprintSettings: VoiceprintConfigSettings;
  setVoiceprintPresetMode: (mode: VoiceprintPresetMode) => void;
  updateVoiceprintSettings: (settings: Partial<VoiceprintConfigSettings>) => void;
  resetVoiceprintSettings: () => void;
  setMeetingSpeakerMode: (mode: 'single' | 'balanced' | 'sensitive') => void;

  // 实时洞察模式与控频 (026 算力降费)
  liveInsightSettings: LiveInsightSettings;
  updateLiveInsightSettings: (patch: Partial<LiveInsightSettings>) => void;
  resetLiveInsightSettings: () => void;
  triggerManualInsight: () => Promise<boolean>;

  // 实时会议管道状态与声学控制 (020)
  insightError: string | null;
  setInsightError: (err: string | null) => void;
  micStatus: 'idle' | 'recording' | 'denied' | 'error';
  micError: string;
  asrStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  asrError: string;
  rmsLevel: number;
  interimText: string;
  interimParts: { stable: string; unstable: string };
  isExtractingInsights: boolean;
  isSystemAudioActive: boolean;
  selectedMicId: string;
  auxDeviceId: string;
  captureMode: 'speaker_meeting' | 'mic_only';
  availableMics: Array<{ deviceId: string; label: string }>;
  audioAcousticMode: 'high_fidelity' | 'speaker_aec';
  setMicStatus: (status: 'idle' | 'recording' | 'denied' | 'error', error?: string) => void;
  setAsrStatus: (status: 'disconnected' | 'connecting' | 'connected' | 'error', error?: string) => void;
  setRmsLevel: (rms: number) => void;
  setInterimText: (text: string, parts?: { stable: string; unstable: string }) => void;
  setIsExtractingInsights: (extracting: boolean) => void;
  setIsSystemAudioActive: (active: boolean) => void;
  setSelectedMicId: (micId: string) => void;
  setAuxDeviceId: (deviceId: string) => void;
  setCaptureMode: (mode: 'speaker_meeting' | 'mic_only') => void;
  setAvailableMics: (mics: Array<{ deviceId: string; label: string }>) => void;
  setAudioAcousticMode: (mode: 'high_fidelity' | 'speaker_aec') => void;

  // 当前采集会话的排空回调，仅驻留内存，绝不持久化。
  asrSessionDrain: (() => Promise<'complete' | 'timeout' | 'error'>) | null;
  isDrainingAsr: boolean;
  audioDeviceStop: Promise<void> | null;
  asrDrainWarning: string | null;
  // Actions
  startMeeting: (title?: string) => void;
  pauseMeeting: () => Promise<void>;
  resumeMeeting: () => void;
  endMeeting: () => Promise<void>;
  tickTimer: () => void;
  addTranscriptSegment: (segment: TranscriptSegment) => void;
  updateTranscriptSpeaker: (id: string, patch: Pick<TranscriptSegment, 'speaker'> & Partial<Pick<TranscriptSegment,
    'speakerId' | 'speakerStatus' | 'speakerConfidence' | 'speakerColorIndex' | 'matchedProfileId' | 'tentativeProfileId' | 'tentativeProfileName'>>) => void;
  addInsight: (insight: Omit<InsightCard, 'isConfirmed' | 'isEdited'>) => void;
  applyInsightPatch: (patch: any) => void;
  confirmInsight: (id: string) => void;
  editInsight: (id: string, newContent: string) => void;
  proposeInsightRevision: (id: string, proposal: RevisionProposal) => void;
  keepCurrentInsightVersion: (id: string) => void;
  acceptInsightRevision: (id: string) => void;
  setHighlightedTranscriptId: (id: string | null) => void;
  setActiveWindow: (window: 'workbench' | 'floating-pill') => void;
  toggleFloatingPill: (toFloating?: boolean) => void;
  deleteHistoryMeeting: (id: string) => Promise<void>;
  clearAllHistory: () => Promise<void>;
  resetMeeting: () => void;

  // 会后 Copilot 问答与纪要就地修订 (018)
  updateMeetingOverview: (meetingId: string, overview: string) => void;
  updateMeetingDecision: (meetingId: string, index: number, patch: Partial<SummaryDecisionItem>) => void;
  addMeetingDecision: (meetingId: string, decision: SummaryDecisionItem) => void;
  deleteMeetingDecision: (meetingId: string, index: number) => void;
  updateMeetingAction: (meetingId: string, index: number, patch: Partial<SummaryActionItem>) => void;
  addMeetingAction: (meetingId: string, action: SummaryActionItem) => void;
  deleteMeetingAction: (meetingId: string, index: number) => void;
  updateMeetingTranscriptText: (meetingId: string, segmentId: string, newText: string) => void;
  applySummaryProposal: (meetingId: string, proposal: SummaryRevisionProposal) => void;
  addMeetingChatMessage: (meetingId: string, message: MeetingChatMessage) => void;

  // 会议标题自主编辑与 AI 重新提炼 (023)
  updateHistoryMeetingTitle: (meetingId: string, newTitle: string) => void;
  regenerateMeetingTitle: (meetingId: string) => Promise<string | null>;
}
