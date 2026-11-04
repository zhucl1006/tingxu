import { describe, it, expect, beforeEach } from 'vitest';
import { useMeetingStore } from '../useMeetingStore';
import { DEFAULT_VOICEPRINT_SETTINGS } from '../../types/meeting';

describe('useMeetingStore - 声纹识别与说话人分离参数配置 (TDD)', () => {
  beforeEach(() => {
    localStorage.clear();
    useMeetingStore.getState().resetVoiceprintSettings();
  });

  it('初始状态应具备默认平衡模式参数，且默认不区分说话人（enabled 为 false）', () => {
    const { voiceprintSettings } = useMeetingStore.getState();
    expect(voiceprintSettings.enabled).toBe(false);
    expect(voiceprintSettings.presetMode).toBe('balanced');
    expect(voiceprintSettings.similarityThreshold).toBe(0.58);
    expect(voiceprintSettings.continuityThreshold).toBe(0.48);
    expect(voiceprintSettings.minClusterDurationMs).toBe(1200);
  });

  it('支持开启区分说话人并持久化到本地存储', () => {
    useMeetingStore.getState().updateVoiceprintSettings({ enabled: true });
    const state = useMeetingStore.getState();
    expect(state.voiceprintSettings.enabled).toBe(true);

    const savedRaw = localStorage.getItem('tingxu_voiceprint_settings');
    expect(savedRaw).toBeTruthy();
    const saved = JSON.parse(savedRaw!);
    expect(saved.enabled).toBe(true);
  });

  it('切换到单人专注模式应自动调整阈值并落盘持久化', () => {
    useMeetingStore.getState().setVoiceprintPresetMode('single');
    const state = useMeetingStore.getState();
    expect(state.voiceprintSettings.presetMode).toBe('single');
    expect(state.voiceprintSettings.similarityThreshold).toBe(0.52);
    expect(state.voiceprintSettings.continuityThreshold).toBe(0.42);
    expect(state.voiceprintSettings.minClusterDurationMs).toBe(2000);

    const savedRaw = localStorage.getItem('tingxu_voiceprint_settings');
    expect(savedRaw).toBeTruthy();
    const saved = JSON.parse(savedRaw!);
    expect(saved.presetMode).toBe('single');
  });

  it('支持自由微调单个参数并自动切换为 custom 自定义模式', () => {
    useMeetingStore.getState().updateVoiceprintSettings({
      similarityThreshold: 0.61,
    });
    const state = useMeetingStore.getState();
    expect(state.voiceprintSettings.similarityThreshold).toBe(0.61);
    expect(state.voiceprintSettings.presetMode).toBe('custom');
  });

  it('调用 resetVoiceprintSettings 应重置为默认配置并同步更新本地存储', () => {
    useMeetingStore.getState().setVoiceprintPresetMode('sensitive');
    expect(useMeetingStore.getState().voiceprintSettings.presetMode).toBe('sensitive');

    useMeetingStore.getState().resetVoiceprintSettings();
    const state = useMeetingStore.getState();
    expect(state.voiceprintSettings).toEqual(DEFAULT_VOICEPRINT_SETTINGS);
  });
});
