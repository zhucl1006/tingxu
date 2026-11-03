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
  SpeakerVoiceprintProfile,
  RegisterSpeakerProfileInput,
  UiAppearanceSettings,
  DEFAULT_APPEARANCE_SETTINGS,
  VoiceprintConfigSettings,
  DEFAULT_VOICEPRINT_SETTINGS,
  VoiceprintPresetMode,
  VOICEPRINT_PRESET_CONFIGS,
  StorageSettings,
  DEFAULT_STORAGE_SETTINGS,
} from '../types/meeting';
import { InsightPatchApplier, InsightPatch } from '../engine/patchApplier';
import { l2Normalize } from '../audio/speakerEmbeddingEngine';

import { finishLocalRecording, clearLocalMedia, deleteLocalMedia, getRecordingStorageUsage, pruneLocalRecordings } from '../audio/localRecording';

const patchApplier = new InsightPatchApplier();

// Local-First 本地优先持久化读取与写入方法（严格遵守 Zero-Content 与本地主权规范）
function loadStoredHistoryMeetings(): HistoryMeeting[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('tingxu_history_meetings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('[MeetingStore] 读取本地历史会议失败:', e);
  }
  return [];
}

function saveStoredHistoryMeetings(meetings: HistoryMeeting[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('tingxu_history_meetings', JSON.stringify(meetings));
  } catch (e) {
    console.warn('[MeetingStore] 持久化历史会议失败:', e);
  }
}

function loadStoredTasks(): TaskItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('tingxu_tasks');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('[MeetingStore] 读取本地任务失败:', e);
  }
  return [];
}

function saveStoredTasks(tasks: TaskItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('tingxu_tasks', JSON.stringify(tasks));
  } catch (e) {
    console.warn('[MeetingStore] 持久化任务失败:', e);
  }
}

function loadStoredSpeakerProfiles(): SpeakerVoiceprintProfile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('tingxu_speaker_profiles');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('[MeetingStore] 读取本地声纹档案失败:', e);
  }
  return [];
}

function saveStoredSpeakerProfiles(profiles: SpeakerVoiceprintProfile[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('tingxu_speaker_profiles', JSON.stringify(profiles));
  } catch (e) {
    console.warn('[MeetingStore] 持久化本地声纹档案失败:', e);
  }
}

function loadStoredVoiceprintConsent(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('tingxu_voiceprint_consent_at');
    if (raw) {
      const num = Number(raw);
      if (Number.isFinite(num) && num > 0) return num;
    }
  } catch {
    // ignore
  }
  return null;
}

function loadStoredAppearanceSettings(): UiAppearanceSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_APPEARANCE_SETTINGS };
  try {
    const raw = localStorage.getItem('tingxu_ui_appearance');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          ...DEFAULT_APPEARANCE_SETTINGS,
          ...parsed,
        };
      }
    }
  } catch (e) {
    console.warn('[MeetingStore] 读取外观配置失败:', e);
  }
  return { ...DEFAULT_APPEARANCE_SETTINGS };
}

function saveStoredAppearanceSettings(settings: UiAppearanceSettings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('tingxu_ui_appearance', JSON.stringify(settings));
  } catch (e) {
    console.warn('[MeetingStore] 持久化外观配置失败:', e);
  }
}

function loadStoredVoiceprintSettings(): VoiceprintConfigSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_VOICEPRINT_SETTINGS };
  try {
    const raw = localStorage.getItem('tingxu_voiceprint_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          ...DEFAULT_VOICEPRINT_SETTINGS,
          ...parsed,
        };
      }
    }
  } catch (e) {
    console.warn('[MeetingStore] 读取声纹参数配置失败:', e);
  }
  return { ...DEFAULT_VOICEPRINT_SETTINGS };
}

function saveStoredVoiceprintSettings(settings: VoiceprintConfigSettings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('tingxu_voiceprint_settings', JSON.stringify(settings));
  } catch (e) {
    console.warn('[MeetingStore] 持久化声纹参数配置失败:', e);
  }
}

function saveStoredVoiceprintConsent(consentAt: number | null) {
  if (typeof window === 'undefined') return;
  try {
    if (consentAt && consentAt > 0) {
      localStorage.setItem('tingxu_voiceprint_consent_at', String(consentAt));
    } else {
      localStorage.removeItem('tingxu_voiceprint_consent_at');
    }
  } catch {
    // ignore
  }
}

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

// 存储与录音自动清理配置持久化
function loadStoredStorageSettings(): StorageSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_STORAGE_SETTINGS };
  try {
    const raw = localStorage.getItem('tingxu_storage_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.autoCleanupDays === 'number') {
        return {
          autoCleanupDays: parsed.autoCleanupDays,
          lastCleanupAt: parsed.lastCleanupAt,
        };
      }
    }
  } catch (e) {
    console.warn('[MeetingStore] 读取存储清理配置失败:', e);
  }
  return { ...DEFAULT_STORAGE_SETTINGS };
}

function saveStoredStorageSettings(settings: StorageSettings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('tingxu_storage_settings', JSON.stringify(settings));
  } catch (e) {
    console.warn('[MeetingStore] 持久化存储清理配置失败:', e);
  }
}

const initialMeetingState = {
  status: 'IDLE' as MeetingStatus,
  asrSessionDrain: null,
  audioDeviceStop: null,
  isDrainingAsr: false,
  asrDrainWarning: null,
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
  tasks: loadStoredTasks(),
  historyMeetings: loadStoredHistoryMeetings(),
  activeSummaryMeeting: null as HistoryMeeting | null,
  activeTargetSegmentId: null as string | null,
  speakerNames: {} as Record<string, string>,
  speakerProfiles: loadStoredSpeakerProfiles(),
  voiceprintConsentAt: loadStoredVoiceprintConsent(),
  isGeneratingSummary: false,
  gatewayUrl: 'http://localhost:3201',
  appearanceSettings: loadStoredAppearanceSettings(),
  voiceprintSettings: loadStoredVoiceprintSettings(),
  storageSettings: loadStoredStorageSettings(),
  storageUsage: { totalBytes: 0, recordingCount: 0 },
  isStorageLoading: false,
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
    if (get().currentUser?.userId !== user.userId) clearLocalMedia();
    if (typeof window !== 'undefined') {
      localStorage.setItem('tingxu_user_session', JSON.stringify(user));
    }
    set({ currentUser: user, isLoginModalOpen: false });
    get().refreshUserBalance();
    void get().refreshStorageUsage();
    void get().runAutoCleanupIfNeeded();
  },

  logoutUser: () => {
    if (get().status === 'RECORDING') void get().pauseMeeting();
    clearLocalMedia();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('tingxu_user_session');
    }
    set({ currentUser: null, quotaMinutes: 0, activeSummaryMeeting: null });
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
    void get().refreshStorageUsage();
    void get().runAutoCleanupIfNeeded();
  },

  refreshStorageUsage: async () => {
    set({ isStorageLoading: true });
    try {
      const token = get().currentUser?.token;
      const usage = await getRecordingStorageUsage(token);
      set({ storageUsage: usage });
    } finally {
      set({ isStorageLoading: false });
    }
  },

  updateStorageSettings: (settings: Partial<StorageSettings>) => {
    const updated = { ...get().storageSettings, ...settings };
    saveStoredStorageSettings(updated);
    set({ storageSettings: updated });
    if (typeof updated.autoCleanupDays === 'number' && updated.autoCleanupDays > 0) {
      void get().runAutoCleanupIfNeeded();
    }
  },

  cleanupRecordings: async (options?: { olderThanDays?: number; targetIds?: string[] }) => {
    const token = get().currentUser?.token;
    const olderThanSecs = options?.olderThanDays ? options.olderThanDays * 86400 : undefined;
    const res = await pruneLocalRecordings({
      token,
      olderThanSecs,
      targetIds: options?.targetIds,
    });
    if (res.deletedIds && res.deletedIds.length > 0) {
      const deletedSet = new Set(res.deletedIds);
      const newHistory = get().historyMeetings.map((m) => {
        if (m.recording && deletedSet.has(m.recording.id)) {
          return {
            ...m,
            recording: undefined,
            recordingWarning: '本地录音已清理释放空间，会议文字纪要完整保留',
          };
        }
        return m;
      });
      saveStoredHistoryMeetings(newHistory);
      const active = get().activeSummaryMeeting;
      const newActive = active && active.recording && deletedSet.has(active.recording.id)
        ? { ...active, recording: undefined, recordingWarning: '本地录音已清理释放空间，会议文字纪要完整保留' }
        : active;
      set({ historyMeetings: newHistory, activeSummaryMeeting: newActive });
    }
    void get().refreshStorageUsage();
    return res;
  },

  runAutoCleanupIfNeeded: async () => {
    const days = get().storageSettings.autoCleanupDays;
    if (!days || days <= 0) return;
    const now = Date.now();
    await get().cleanupRecordings({ olderThanDays: days });
    const updated = { ...get().storageSettings, lastCleanupAt: now };
    saveStoredStorageSettings(updated);
    set({ storageSettings: updated });
  },

  toggleTask: (id: string) => {
    set((state) => {
      const newTasks = state.tasks.map((t) =>
        t.id === id ? { ...t, completed: !t.completed } : t
      );
      saveStoredTasks(newTasks);
      return { tasks: newTasks };
    });
  },

  startMeeting: (title = '新会议讨论') => {
    if (get().isDrainingAsr || get().isGeneratingSummary || get().audioDeviceStop) return;
    const currentQuota = get().quotaMinutes || 0;
    const initialSec = currentQuota * 60;
    set({
      status: 'RECORDING',
      asrSessionDrain: null,
      asrDrainWarning: null,
      meetingId: `mtg_${Date.now()}`,
      title,
      elapsedSeconds: 0,
      initialQuotaSeconds: initialSec,
      transcripts: [],
      insights: [],
      speakerNames: {},
      highlightedTranscriptId: null,
      currentRoute: 'record',
    });
  },

  pauseMeeting: async () => {
    const { status, meetingId, asrSessionDrain, isDrainingAsr } = get();
    if (status !== 'RECORDING' || isDrainingAsr) return;
    set({ status: 'PAUSED', isDrainingAsr: Boolean(asrSessionDrain) });
    if (!asrSessionDrain) return;
    let outcome: 'complete' | 'timeout' | 'error' = 'error';
    try { outcome = await asrSessionDrain(); } catch { /* 失败不升级草稿 */ }
    if (get().meetingId !== meetingId) return;
    set({ isDrainingAsr: false, asrDrainWarning: outcome === 'complete' ? null : '部分内容未定稿，请核对最后一句' });
  },

  resumeMeeting: () => {
    if (get().status === 'PAUSED' && !get().isDrainingAsr && !get().isGeneratingSummary && !get().audioDeviceStop) {
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

  renameSpeaker: (speakerIdOrOldName: string, newName: string) => {
    if (!speakerIdOrOldName || !newName || speakerIdOrOldName.trim() === newName.trim()) return;
    const targetKey = speakerIdOrOldName.trim();
    const cleanNew = newName.trim();

    set((state) => {
      // 查找与 targetKey 关联的旧显示名及 speakerId
      const matchedSpeakerIds = new Set<string>();
      const matchedOldNames = new Set<string>();

      for (const seg of state.transcripts) {
        if (seg.speakerId === targetKey || seg.speaker === targetKey) {
          if (seg.speakerId) matchedSpeakerIds.add(seg.speakerId);
          if (seg.speaker) matchedOldNames.add(seg.speaker);
        }
      }
      if (targetKey.startsWith('spk_')) {
        matchedSpeakerIds.add(targetKey);
      } else {
        matchedOldNames.add(targetKey);
      }

      const matchesSegment = (t: TranscriptSegment): boolean => {
        if (t.speakerId && matchedSpeakerIds.has(t.speakerId)) return true;
        if (!t.speakerId && t.speaker === targetKey) return true;
        if (t.speaker === targetKey && matchedSpeakerIds.size === 0) return true;
        return false;
      };

      const updatedTranscripts = state.transcripts.map((t) =>
        matchesSegment(t)
          ? {
              ...t,
              speaker: cleanNew,
              speakerManuallyNamed: true,
              tentativeProfileId: null,
              tentativeProfileName: null,
            }
          : t
      );

      const nextSpeakerNames = { ...state.speakerNames };
      matchedSpeakerIds.forEach((id) => {
        nextSpeakerNames[id] = cleanNew;
      });

      const updateMeeting = (m: HistoryMeeting): HistoryMeeting => {
        const meetingOldNames = new Set<string>(matchedOldNames);
        (m.transcripts || []).forEach((t) => {
          if (matchesSegment(t) && t.speaker) {
            meetingOldNames.add(t.speaker);
          }
        });
        const newTranscripts = (m.transcripts || []).map((t) =>
          matchesSegment(t) || meetingOldNames.has(t.speaker) ? { ...t, speaker: cleanNew } : t
        );
        const newSpeakers = Array.from(
          new Set(
            (m.speakers || []).map((s) => (meetingOldNames.has(s) || s === targetKey ? cleanNew : s))
          )
        );
        return {
          ...m,
          speakers: newSpeakers,
          transcripts: newTranscripts,
        };
      };

      const updatedHistory = state.historyMeetings.map((m) => updateMeeting(m));
      const updatedActive = state.activeSummaryMeeting ? updateMeeting(state.activeSummaryMeeting) : null;
      saveStoredHistoryMeetings(updatedHistory);

      return {
        transcripts: updatedTranscripts,
        speakerNames: nextSpeakerNames,
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
    if (get().isGeneratingSummary || get().isDrainingAsr || get().status === 'ENDED') return;
    const currentMeetingId = get().meetingId;
    const drain = get().asrSessionDrain;
    set({ isGeneratingSummary: true, status: 'PAUSED', isDrainingAsr: Boolean(drain) });
    if (drain) {
      let outcome: 'complete' | 'timeout' | 'error' = 'error';
      try { outcome = await drain(); } catch { /* 仍归档已定稿内容 */ }
      if (get().meetingId !== currentMeetingId) return;
      set({ isDrainingAsr: false, asrDrainWarning: outcome === 'complete' ? null : '部分内容未定稿，请核对最后一句' });
    }
    const localAudio = currentMeetingId ? await finishLocalRecording(currentMeetingId) : {};
    // 在排空之后取快照，尾句不会被旧数组漏掉；等待期间计时已经冻结。
    const { meetingId, title, elapsedSeconds, insights, transcripts, historyMeetings, tasks, gatewayUrl } = get();
    if (!meetingId || (elapsedSeconds < 3 && transcripts.length === 0 && !localAudio.recording)) {
      set({ status: 'ENDED', currentRoute: 'home', isGeneratingSummary: false });
      return;
    }

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
      recording: localAudio.recording,
      recordingWarning: localAudio.warning,
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

    // 过滤掉同 id 会议，杜绝重复写入
    const cleanOldHistory = historyMeetings.filter((m) => m.id !== meetingId);
    const updatedHistory = [newHistory, ...cleanOldHistory];
    const updatedTasks = [...newTasks, ...tasks];
    saveStoredHistoryMeetings(updatedHistory);
    saveStoredTasks(updatedTasks);

    set({
      status: 'ENDED',
      title: finalTitle,
      insights: finalInsights,
      historyMeetings: updatedHistory,
      tasks: updatedTasks,
      activeSummaryMeeting: newHistory, // 自动激活总结详情查看
      isGeneratingSummary: false,
      currentRoute: 'summary',
    });

    void get().refreshStorageUsage();
    void get().runAutoCleanupIfNeeded();

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
    set((state) => {
      if (state.transcripts.some(existing => existing.id === segment.id)) return state;
      const mappedSpeaker =
        (segment.speakerId && state.speakerNames[segment.speakerId]) || segment.speaker;
      const nextSpeakerNames =
        segment.speakerId && mappedSpeaker
          ? { ...state.speakerNames, [segment.speakerId]: mappedSpeaker }
          : state.speakerNames;
      return {
        speakerNames: nextSpeakerNames,
        transcripts: [...state.transcripts, { ...segment, speaker: mappedSpeaker }],
      };
    });
  },

  updateTranscriptSpeaker: (id, patch) => {
    set(state => ({
      transcripts: state.transcripts.map(segment => {
        if (segment.id !== id) return segment;
        const name = segment.speakerManuallyNamed ? segment.speaker :
          (patch.speakerId && state.speakerNames[patch.speakerId]) || patch.speaker;
        return { ...segment, ...patch, speaker: name };
      }),
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
      asrSessionDrain: null,
      isDrainingAsr: false,
      asrDrainWarning: null,
      isGeneratingSummary: false,
      meetingId: null,
      title: '未命名会议',
      elapsedSeconds: 0,
      transcripts: [],
      insights: [],
      speakerNames: {},
      highlightedTranscriptId: null,
      currentRoute: 'home',
    });
  },

  deleteHistoryMeeting: async (id: string) => {
    const media = get().historyMeetings.find(m => m.id === id)?.recording;
    if (media) await deleteLocalMedia(media.id, get().currentUser?.token);
    set((state) => {
      const newHistory = state.historyMeetings.filter((m) => m.id !== id);
      const newTasks = state.tasks.filter((t) => t.meetingId !== id);
      saveStoredHistoryMeetings(newHistory);
      saveStoredTasks(newTasks);
      return {
        historyMeetings: newHistory,
        tasks: newTasks,
        activeSummaryMeeting:
          state.activeSummaryMeeting?.id === id ? null : state.activeSummaryMeeting,
      };
    });
  },

  clearAllHistory: async () => {
    for (const meeting of get().historyMeetings) {
      if (meeting.recording) await deleteLocalMedia(meeting.recording.id, get().currentUser?.token);
    }
    saveStoredHistoryMeetings([]);
    saveStoredTasks([]);
    set({
      historyMeetings: [],
      tasks: [],
      activeSummaryMeeting: null,
    });
  },

  grantVoiceprintConsent: () => {
    const now = Date.now();
    saveStoredVoiceprintConsent(now);
    set({ voiceprintConsentAt: now });
    return now;
  },

  registerSpeakerProfile: (input: RegisterSpeakerProfileInput) => {
    const cleanName = input.displayName.trim();
    if (!cleanName || !Array.isArray(input.embedding) || input.embedding.length === 0) {
      return null;
    }

    // 显式授权门禁：consented === false 严禁保存声纹；consented === true 或此前已授权才允许落盘
    if (input.consented === false) {
      return null;
    }

    let consentAt = get().voiceprintConsentAt;
    if (input.consented === true && !consentAt) {
      consentAt = Date.now();
      saveStoredVoiceprintConsent(consentAt);
    }
    if (!consentAt) {
      return null;
    }

    const now = Date.now();
    const accountId = get().currentUser?.userId || 'local_default';
    const normalized = l2Normalize(input.embedding);
    const sampleDurationMs = Math.max(1200, input.sampleDurationMs ?? 3000);

    const existingList = get().speakerProfiles;
    const existingIdx = existingList.findIndex(
      (p) => p.accountId === accountId && p.displayName === cleanName
    );

    let savedProfile: SpeakerVoiceprintProfile;
    let nextProfiles: SpeakerVoiceprintProfile[];

    if (existingIdx >= 0) {
      const prev = existingList[existingIdx];
      const mergedVec = l2Normalize(
        prev.embedding.map((v, i) => v * 0.6 + (normalized[i] ?? 0) * 0.4)
      );
      savedProfile = {
        ...prev,
        displayName: cleanName,
        embedding: mergedVec,
        embeddingDim: mergedVec.length,
        sampleDurationMs: prev.sampleDurationMs + sampleDurationMs,
        consentAt,
        lastMatchedAt: now,
      };
      nextProfiles = existingList.map((p, idx) => (idx === existingIdx ? savedProfile : p));
    } else {
      savedProfile = {
        profileId: `vp_${now}_${Math.random().toString(36).slice(2, 6)}`,
        accountId,
        displayName: cleanName,
        embedding: normalized,
        embeddingDim: normalized.length,
        modelId: 'campplus_zh_en_fp16',
        modelVersion: '1.0',
        sampleDurationMs,
        consentAt,
        createdAt: now,
        lastMatchedAt: now,
      };
      nextProfiles = [...existingList, savedProfile];
    }

    saveStoredSpeakerProfiles(nextProfiles);
    set({
      voiceprintConsentAt: consentAt,
      speakerProfiles: nextProfiles,
    });
    return savedProfile;
  },

  renameSpeakerProfile: (profileId: string, newName: string) => {
    const clean = newName.trim();
    if (!profileId || !clean) return;
    set((state) => {
      const target = state.speakerProfiles.find((p) => p.profileId === profileId);
      const oldName = target?.displayName;
      const nextProfiles = state.speakerProfiles.map((p) =>
        p.profileId === profileId ? { ...p, displayName: clean } : p
      );
      saveStoredSpeakerProfiles(nextProfiles);

      const updatedTranscripts = state.transcripts.map((t) =>
        t.matchedProfileId === profileId || (oldName && t.speaker === oldName)
          ? { ...t, speaker: clean }
          : t
      );

      return {
        speakerProfiles: nextProfiles,
        transcripts: updatedTranscripts,
      };
    });
  },

  deleteSpeakerProfile: (profileId: string) => {
    if (!profileId) return;
    set((state) => {
      const nextProfiles = state.speakerProfiles.filter((p) => p.profileId !== profileId);
      saveStoredSpeakerProfiles(nextProfiles);
      return { speakerProfiles: nextProfiles };
    });
  },

  clearSpeakerProfiles: () => {
    saveStoredSpeakerProfiles([]);
    saveStoredVoiceprintConsent(null);
    set({
      speakerProfiles: [],
      voiceprintConsentAt: null,
    });
  },

  markProfileMatched: (profileId: string) => {
    const now = Date.now();
    set((state) => {
      const nextProfiles = state.speakerProfiles.map((p) =>
        p.profileId === profileId ? { ...p, lastMatchedAt: now } : p
      );
      saveStoredSpeakerProfiles(nextProfiles);
      return { speakerProfiles: nextProfiles };
    });
  },

  dismissTentativeMatch: (speakerId: string, profileId: string) => {
    set((state) => ({
      transcripts: state.transcripts.map((t) =>
        t.speakerId === speakerId && t.tentativeProfileId === profileId
          ? { ...t, tentativeProfileId: null, tentativeProfileName: null }
          : t
      ),
    }));
  },

  setAppearanceSettings: (partial: Partial<UiAppearanceSettings>) => {
    const next = { ...get().appearanceSettings, ...partial };
    saveStoredAppearanceSettings(next);
    set({ appearanceSettings: next });
  },

  resetAppearanceSettings: () => {
    saveStoredAppearanceSettings({ ...DEFAULT_APPEARANCE_SETTINGS });
    set({ appearanceSettings: { ...DEFAULT_APPEARANCE_SETTINGS } });
  },

  setVoiceprintPresetMode: (mode: VoiceprintPresetMode) => {
    let nextSettings: VoiceprintConfigSettings;
    if (mode === 'custom') {
      nextSettings = { ...get().voiceprintSettings, presetMode: 'custom' };
    } else {
      const config = VOICEPRINT_PRESET_CONFIGS[mode];
      nextSettings = {
        presetMode: mode,
        similarityThreshold: config.similarityThreshold,
        continuityThreshold: config.continuityThreshold,
        minClusterDurationMs: config.minClusterDurationMs,
      };
    }
    saveStoredVoiceprintSettings(nextSettings);
    set({ voiceprintSettings: nextSettings });
  },

  updateVoiceprintSettings: (partial: Partial<VoiceprintConfigSettings>) => {
    const current = get().voiceprintSettings;
    const nextSettings: VoiceprintConfigSettings = {
      ...current,
      ...partial,
      presetMode: partial.presetMode ?? 'custom',
    };
    saveStoredVoiceprintSettings(nextSettings);
    set({ voiceprintSettings: nextSettings });
  },

  resetVoiceprintSettings: () => {
    saveStoredVoiceprintSettings({ ...DEFAULT_VOICEPRINT_SETTINGS });
    set({ voiceprintSettings: { ...DEFAULT_VOICEPRINT_SETTINGS } });
  },
}));
