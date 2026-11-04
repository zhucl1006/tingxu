import { describe, it, expect, beforeEach } from 'vitest';
import { useMeetingStore } from '../useMeetingStore';
import { DetectedMeetingApp } from '../../types/meeting';

describe('useMeetingStore - 会议感知与桌面悬浮挂件策略 (Plan 017 TDD)', () => {
  beforeEach(() => {
    localStorage.clear();
    useMeetingStore.getState().resetMeeting();
    useMeetingStore.setState({
      detectedMeetingApp: null,
      meetingDetectionSettings: { enabled: true, floatingWidget: true },
      dismissedMeetingAppUntil: {},
    });
  });

  const mockTeams: DetectedMeetingApp = {
    appName: 'Microsoft Teams',
    appId: 'teams',
    processName: 'Teams',
  };

  const mockZoom: DetectedMeetingApp = {
    appName: 'Zoom 会议',
    appId: 'zoom',
    processName: 'zoom.us',
  };

  it('初始状态具备默认感知与悬浮挂件设置', () => {
    const settings = useMeetingStore.getState().meetingDetectionSettings;
    expect(settings.enabled).toBe(true);
    expect(settings.floatingWidget).toBe(true);
    expect(useMeetingStore.getState().detectedMeetingApp).toBeNull();
  });

  it('在 IDLE 状态下成功设置检测到的会议软件', () => {
    useMeetingStore.getState().setDetectedMeetingApp(mockTeams);
    expect(useMeetingStore.getState().detectedMeetingApp).toEqual(mockTeams);
  });

  it('若禁用检测设置 (enabled: false)，调用 setDetectedMeetingApp 应保持为 null', () => {
    useMeetingStore.setState({
      meetingDetectionSettings: { enabled: false, floatingWidget: true },
    });
    useMeetingStore.getState().setDetectedMeetingApp(mockTeams);
    expect(useMeetingStore.getState().detectedMeetingApp).toBeNull();
  });

  it('若会议正在进行中 (status !== IDLE)，绝不弹窗打扰用户', () => {
    useMeetingStore.getState().startMeeting('开会中');
    expect(useMeetingStore.getState().status).toBe('RECORDING');

    useMeetingStore.getState().setDetectedMeetingApp(mockTeams);
    expect(useMeetingStore.getState().detectedMeetingApp).toBeNull();
  });

  it('用户点击忽略后，记录 30 分钟防打扰期，期间再次检测同一软件不打扰', () => {
    useMeetingStore.getState().setDetectedMeetingApp(mockTeams);
    expect(useMeetingStore.getState().detectedMeetingApp).toEqual(mockTeams);

    // 用户选择暂不记录
    useMeetingStore.getState().dismissDetectedMeetingApp(mockTeams.appId);
    expect(useMeetingStore.getState().detectedMeetingApp).toBeNull();

    // 处于防打扰期内再次检测
    useMeetingStore.getState().setDetectedMeetingApp(mockTeams);
    expect(useMeetingStore.getState().detectedMeetingApp).toBeNull();

    // 但是如果检测到了另一个未被防打扰的应用（如 Zoom），应正常触发提示
    useMeetingStore.getState().setDetectedMeetingApp(mockZoom);
    expect(useMeetingStore.getState().detectedMeetingApp).toEqual(mockZoom);
  });

  it('quickStartDetectedMeeting 应立即以应用名称开启会议并重置视图', async () => {
    useMeetingStore.getState().setDetectedMeetingApp(mockTeams);

    await useMeetingStore.getState().quickStartDetectedMeeting(mockTeams);

    const state = useMeetingStore.getState();
    expect(state.status).toBe('RECORDING');
    expect(state.title).toBe('Microsoft Teams 讨论');
    expect(state.detectedMeetingApp).toBeNull();
    expect(state.currentRoute).toBe('record');
    expect(state.activeWindow).toBe('workbench');
  });

  it('updateMeetingDetectionSettings 应更新设置并持久化至 localStorage', async () => {
    await useMeetingStore.getState().updateMeetingDetectionSettings({
      enabled: false,
      floatingWidget: false,
    });

    const state = useMeetingStore.getState();
    expect(state.meetingDetectionSettings.enabled).toBe(false);
    expect(state.meetingDetectionSettings.floatingWidget).toBe(false);

    const stored = JSON.parse(localStorage.getItem('tingxu_meeting_detection_settings') || '{}');
    expect(stored.enabled).toBe(false);
    expect(stored.floatingWidget).toBe(false);
  });
});
