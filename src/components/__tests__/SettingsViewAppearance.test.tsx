import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsView } from '../views/SettingsView';
import { useMeetingStore } from '../../store/useMeetingStore';
import { DEFAULT_APPEARANCE_SETTINGS } from '../../types/meeting';

describe('SettingsView 界面外观与排版样式配置卡片 (TDD)', () => {
  beforeEach(() => {
    useMeetingStore.getState().resetAppearanceSettings();
  });

  it('应成功渲染外观与排版样式配置区块及实时预览卡片', () => {
    render(<SettingsView />);

    expect(screen.getByTestId('settings-page-section-appearance')).toBeInTheDocument();
    expect(screen.getByTestId('settings-page-appearance-card-preview')).toBeInTheDocument();
    expect(screen.getByTestId('settings-page-appearance-preview-text-transcript')).toBeInTheDocument();
    expect(screen.getByTestId('settings-page-appearance-preview-badge-decision')).toBeInTheDocument();
  });

  it('支持切换主题模式（系统、浅色、深色）并联动 store', () => {
    render(<SettingsView />);

    const darkBtn = screen.getByTestId('settings-page-appearance-btn-theme-dark');
    fireEvent.click(darkBtn);
    expect(useMeetingStore.getState().appearanceSettings.theme).toBe('dark');

    const lightBtn = screen.getByTestId('settings-page-appearance-btn-theme-light');
    fireEvent.click(lightBtn);
    expect(useMeetingStore.getState().appearanceSettings.theme).toBe('light');

    const systemBtn = screen.getByTestId('settings-page-appearance-btn-theme-system');
    fireEvent.click(systemBtn);
    expect(useMeetingStore.getState().appearanceSettings.theme).toBe('system');
  });

  it('支持切换字号大小（紧凑、标准、大号、特大）并联动 store', () => {
    render(<SettingsView />);

    const largeBtn = screen.getByTestId('settings-page-appearance-btn-font-size-large');
    fireEvent.click(largeBtn);
    expect(useMeetingStore.getState().appearanceSettings.fontSize).toBe('large');

    const xlargeBtn = screen.getByTestId('settings-page-appearance-btn-font-size-xlarge');
    fireEvent.click(xlargeBtn);
    expect(useMeetingStore.getState().appearanceSettings.fontSize).toBe('xlarge');

    const smallBtn = screen.getByTestId('settings-page-appearance-btn-font-size-small');
    fireEvent.click(smallBtn);
    expect(useMeetingStore.getState().appearanceSettings.fontSize).toBe('small');
  });

  it('支持切换字体风格（现代黑体、书卷衬线、极客等宽）并联动 store', () => {
    render(<SettingsView />);

    const serifBtn = screen.getByTestId('settings-page-appearance-btn-font-family-serif');
    fireEvent.click(serifBtn);
    expect(useMeetingStore.getState().appearanceSettings.fontFamily).toBe('serif');

    const monoBtn = screen.getByTestId('settings-page-appearance-btn-font-family-mono');
    fireEvent.click(monoBtn);
    expect(useMeetingStore.getState().appearanceSettings.fontFamily).toBe('mono');
  });

  it('支持切换排版密度（舒适、紧凑）并支持恢复默认配置', () => {
    render(<SettingsView />);

    const compactBtn = screen.getByTestId('settings-page-appearance-btn-density-compact');
    fireEvent.click(compactBtn);
    expect(useMeetingStore.getState().appearanceSettings.density).toBe('compact');

    // 此时配置已被更改
    expect(useMeetingStore.getState().appearanceSettings).not.toEqual(DEFAULT_APPEARANCE_SETTINGS);

    // 点击恢复默认
    const resetBtn = screen.getByTestId('settings-page-appearance-btn-reset-default');
    fireEvent.click(resetBtn);
    expect(useMeetingStore.getState().appearanceSettings).toEqual(DEFAULT_APPEARANCE_SETTINGS);
  });
});
