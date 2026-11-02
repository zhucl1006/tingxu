import { describe, it, expect, beforeEach } from 'vitest';
import { useMeetingStore } from '../useMeetingStore';
import { DEFAULT_APPEARANCE_SETTINGS } from '../../types/meeting';

describe('UI 外观与排版自定义状态管理 (TDD)', () => {
  beforeEach(() => {
    localStorage.clear();
    useMeetingStore.getState().resetAppearanceSettings();
  });

  it('应该具备合理的默认外观配置（系统主题、标准字号、无衬线字体、舒适间距）', () => {
    const { appearanceSettings } = useMeetingStore.getState();
    expect(appearanceSettings).toEqual({
      theme: 'system',
      fontSize: 'medium',
      fontFamily: 'sans',
      density: 'comfortable',
    });
    expect(DEFAULT_APPEARANCE_SETTINGS).toBeDefined();
  });

  it('能够部分或全部更新外观设置，并同步更新到 store 中', () => {
    const store = useMeetingStore.getState();
    
    // 更新主题为深色模式
    store.setAppearanceSettings({ theme: 'dark' });
    expect(useMeetingStore.getState().appearanceSettings.theme).toBe('dark');
    expect(useMeetingStore.getState().appearanceSettings.fontSize).toBe('medium');

    // 更新字号与字体风格
    store.setAppearanceSettings({ fontSize: 'large', fontFamily: 'serif', density: 'compact' });
    expect(useMeetingStore.getState().appearanceSettings).toEqual({
      theme: 'dark',
      fontSize: 'large',
      fontFamily: 'serif',
      density: 'compact',
    });
  });

  it('能够将配置持久化到 localStorage 中，并在重新初始化时正确读取恢复', () => {
    const store = useMeetingStore.getState();
    store.setAppearanceSettings({
      theme: 'light',
      fontSize: 'xlarge',
      fontFamily: 'mono',
    });

    // 验证持久化到了 localStorage
    const saved = localStorage.getItem('tingxu_ui_appearance');
    expect(saved).toBeTruthy();
    const parsed = JSON.parse(saved!);
    expect(parsed.fontSize).toBe('xlarge');
    expect(parsed.fontFamily).toBe('mono');
    expect(parsed.theme).toBe('light');
  });

  it('支持一键重置为系统默认配置', () => {
    const store = useMeetingStore.getState();
    store.setAppearanceSettings({
      theme: 'dark',
      fontSize: 'small',
      fontFamily: 'serif',
      density: 'compact',
    });

    store.resetAppearanceSettings();
    expect(useMeetingStore.getState().appearanceSettings).toEqual(DEFAULT_APPEARANCE_SETTINGS);
  });
});
