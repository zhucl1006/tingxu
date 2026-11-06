/**
 * 听序（Tingxu）— 统一存储仓储契约与适配器模块 (MeetingRepository)
 *
 * 核心架构定位：
 * 遵循 Local-First 与 Zero-Content 隐私红线，实现客户端多端存储统一接缝。
 * 屏蔽 localStorage 与 Rust 本地 SQLite 之间的差异，为上层状态机提供稳定持久化契约。
 */

import type {
  HistoryMeeting,
  TaskItem,
  SpeakerVoiceprintProfile,
  UiAppearanceSettings,
  VoiceprintConfigSettings,
  StorageSettings,
  MeetingDetectionSettings,
  ByokSettings,
  LiveInsightSettings,
} from '../types/meeting';

export interface StorageAdapter {
  getHistoryMeetings(): HistoryMeeting[];
  saveHistoryMeetings(meetings: HistoryMeeting[]): void;

  getTasks(): TaskItem[];
  saveTasks(tasks: TaskItem[]): void;

  getSpeakerProfiles(): SpeakerVoiceprintProfile[];
  saveSpeakerProfiles(profiles: SpeakerVoiceprintProfile[]): void;

  getVoiceprintConsent(): number | null;
  saveVoiceprintConsent(ts: number): void;

  getAppearanceSettings(): UiAppearanceSettings | null;
  saveAppearanceSettings(settings: UiAppearanceSettings): void;

  getVoiceprintSettings(): VoiceprintConfigSettings | null;
  saveVoiceprintSettings(settings: VoiceprintConfigSettings): void;

  getStorageSettings(): StorageSettings | null;
  saveStorageSettings(settings: StorageSettings): void;

  getDetectionSettings(): MeetingDetectionSettings | null;
  saveDetectionSettings(settings: MeetingDetectionSettings): void;

  getByokSettings(): ByokSettings | null;
  saveByokSettings(settings: ByokSettings): void;

  getLiveInsightSettings(): LiveInsightSettings | null;
  saveLiveInsightSettings(settings: LiveInsightSettings): void;
}

/**
 * Web 端与单元测试适配器 (WebStorageAdapter)
 */
export class WebStorageAdapter implements StorageAdapter {
  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  private loadJson<T>(key: string, fallback: T): T {
    if (!this.isBrowser()) return fallback;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed !== null && parsed !== undefined) return parsed;
      }
    } catch (e) {
      console.warn(`[WebStorageAdapter] 读取 ${key} 失败:`, e);
    }
    return fallback;
  }

  private saveJson(key: string, value: any): void {
    if (!this.isBrowser()) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`[WebStorageAdapter] 写入 ${key} 失败:`, e);
    }
  }

  public getHistoryMeetings(): HistoryMeeting[] {
    const data = this.loadJson<HistoryMeeting[]>('tingxu_history_meetings', []);
    return Array.isArray(data) ? data : [];
  }

  public saveHistoryMeetings(meetings: HistoryMeeting[]): void {
    this.saveJson('tingxu_history_meetings', meetings);
  }

  public getTasks(): TaskItem[] {
    const data = this.loadJson<TaskItem[]>('tingxu_tasks', []);
    return Array.isArray(data) ? data : [];
  }

  public saveTasks(tasks: TaskItem[]): void {
    this.saveJson('tingxu_tasks', tasks);
  }

  public getSpeakerProfiles(): SpeakerVoiceprintProfile[] {
    const data = this.loadJson<SpeakerVoiceprintProfile[]>('tingxu_speaker_profiles', []);
    return Array.isArray(data) ? data : [];
  }

  public saveSpeakerProfiles(profiles: SpeakerVoiceprintProfile[]): void {
    this.saveJson('tingxu_speaker_profiles', profiles);
  }

  public getVoiceprintConsent(): number | null {
    if (!this.isBrowser()) return null;
    try {
      const raw = localStorage.getItem('tingxu_voiceprint_consent_at');
      if (raw) {
        const num = Number(raw);
        if (Number.isFinite(num) && num > 0) return num;
      }
    } catch {}
    return null;
  }

  public saveVoiceprintConsent(ts: number): void {
    if (!this.isBrowser()) return;
    try {
      localStorage.setItem('tingxu_voiceprint_consent_at', String(ts));
    } catch {}
  }

  public getAppearanceSettings(): UiAppearanceSettings | null {
    return this.loadJson<UiAppearanceSettings | null>('tingxu_ui_appearance', null);
  }

  public saveAppearanceSettings(settings: UiAppearanceSettings): void {
    this.saveJson('tingxu_ui_appearance', settings);
  }

  public getVoiceprintSettings(): VoiceprintConfigSettings | null {
    return this.loadJson<VoiceprintConfigSettings | null>('tingxu_voiceprint_settings', null);
  }

  public saveVoiceprintSettings(settings: VoiceprintConfigSettings): void {
    this.saveJson('tingxu_voiceprint_settings', settings);
  }

  public getStorageSettings(): StorageSettings | null {
    return this.loadJson<StorageSettings | null>('tingxu_storage_settings', null);
  }

  public saveStorageSettings(settings: StorageSettings): void {
    this.saveJson('tingxu_storage_settings', settings);
  }

  public getDetectionSettings(): MeetingDetectionSettings | null {
    return this.loadJson<MeetingDetectionSettings | null>('tingxu_detection_settings', null);
  }

  public saveDetectionSettings(settings: MeetingDetectionSettings): void {
    this.saveJson('tingxu_detection_settings', settings);
  }

  public getByokSettings(): ByokSettings | null {
    return this.loadJson<ByokSettings | null>('tingxu_byok_settings', null);
  }

  public saveByokSettings(settings: ByokSettings): void {
    this.saveJson('tingxu_byok_settings', settings);
  }

  public getLiveInsightSettings(): LiveInsightSettings | null {
    return this.loadJson<LiveInsightSettings | null>('tingxu_live_insight_settings', null);
  }

  public saveLiveInsightSettings(settings: LiveInsightSettings): void {
    this.saveJson('tingxu_live_insight_settings', settings);
  }
}

/**
 * 听序通用仓储 (MeetingRepository)
 */
export class MeetingRepository {
  constructor(private adapter: StorageAdapter = new WebStorageAdapter()) {}

  public getAdapter(): StorageAdapter {
    return this.adapter;
  }

  public setAdapter(adapter: StorageAdapter): void {
    this.adapter = adapter;
  }

  public getHistoryMeetings(): HistoryMeeting[] {
    return this.adapter.getHistoryMeetings();
  }

  public saveHistoryMeetings(meetings: HistoryMeeting[]): void {
    this.adapter.saveHistoryMeetings(meetings);
  }

  public getTasks(): TaskItem[] {
    return this.adapter.getTasks();
  }

  public saveTasks(tasks: TaskItem[]): void {
    this.adapter.saveTasks(tasks);
  }

  public getSpeakerProfiles(): SpeakerVoiceprintProfile[] {
    return this.adapter.getSpeakerProfiles();
  }

  public saveSpeakerProfiles(profiles: SpeakerVoiceprintProfile[]): void {
    this.adapter.saveSpeakerProfiles(profiles);
  }

  public getVoiceprintConsent(): number | null {
    return this.adapter.getVoiceprintConsent();
  }

  public saveVoiceprintConsent(ts: number): void {
    this.adapter.saveVoiceprintConsent(ts);
  }

  public getAppearanceSettings(): UiAppearanceSettings | null {
    return this.adapter.getAppearanceSettings();
  }

  public saveAppearanceSettings(settings: UiAppearanceSettings): void {
    this.adapter.saveAppearanceSettings(settings);
  }

  public getVoiceprintSettings(): VoiceprintConfigSettings | null {
    return this.adapter.getVoiceprintSettings();
  }

  public saveVoiceprintSettings(settings: VoiceprintConfigSettings): void {
    this.adapter.saveVoiceprintSettings(settings);
  }

  public getStorageSettings(): StorageSettings | null {
    return this.adapter.getStorageSettings();
  }

  public saveStorageSettings(settings: StorageSettings): void {
    this.adapter.saveStorageSettings(settings);
  }

  public getDetectionSettings(): MeetingDetectionSettings | null {
    return this.adapter.getDetectionSettings();
  }

  public saveDetectionSettings(settings: MeetingDetectionSettings): void {
    this.adapter.saveDetectionSettings(settings);
  }

  public getByokSettings(): ByokSettings | null {
    return this.adapter.getByokSettings();
  }

  public saveByokSettings(settings: ByokSettings): void {
    this.adapter.saveByokSettings(settings);
  }

  public getLiveInsightSettings(): LiveInsightSettings | null {
    return this.adapter.getLiveInsightSettings();
  }

  public saveLiveInsightSettings(settings: LiveInsightSettings): void {
    this.adapter.saveLiveInsightSettings(settings);
  }
}

let currentRepository: MeetingRepository = new MeetingRepository();

export function getMeetingRepository(): MeetingRepository {
  return currentRepository;
}

export function setMeetingRepository(repo: MeetingRepository): void {
  currentRepository = repo;
}

export function resetMeetingRepository(): void {
  currentRepository = new MeetingRepository(new WebStorageAdapter());
}
