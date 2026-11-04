import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsView } from '../views/SettingsView';
import { useMeetingStore } from '../../store/useMeetingStore';

describe('SettingsView - 声纹聚类与说话人分离参数配置界面 (TDD)', () => {
  beforeEach(() => {
    localStorage.clear();
    useMeetingStore.getState().resetVoiceprintSettings();
  });

  it('应渲染声纹识别参数配置模块，并包含区分说话人总开关、场景模式选择与参数滑块', () => {
    render(<SettingsView />);

    // 验证模块区域
    expect(
      screen.getByTestId('settings-page-section-voiceprint-params')
    ).toBeInTheDocument();

    // 验证区分说话人总开关
    const toggle = screen.getByTestId('settings-page-switch-voiceprint-enabled') as HTMLInputElement;
    expect(toggle).toBeInTheDocument();
    expect(toggle.checked).toBe(false); // 默认不区分说话人

    // 验证三种预设模式按钮
    expect(
      screen.getByTestId('settings-page-btn-preset-single')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('settings-page-btn-preset-balanced')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('settings-page-btn-preset-sensitive')
    ).toBeInTheDocument();

    // 验证三个滑块控件
    expect(
      screen.getByTestId('settings-page-slider-similarity')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('settings-page-slider-continuity')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('settings-page-slider-duration')
    ).toBeInTheDocument();
  });

  it('点击区分说话人开关应能切换开启状态并更新 store', () => {
    render(<SettingsView />);
    const toggle = screen.getByTestId('settings-page-switch-voiceprint-enabled');
    fireEvent.click(toggle);

    expect(useMeetingStore.getState().voiceprintSettings.enabled).toBe(true);
  });

  it('点击“单人/演讲专注模式”预设卡片应快速切换并更新当前参数', () => {
    render(<SettingsView />);

    const singleBtn = screen.getByTestId('settings-page-btn-preset-single');
    fireEvent.click(singleBtn);

    const storeState = useMeetingStore.getState();
    expect(storeState.voiceprintSettings.presetMode).toBe('single');
    expect(storeState.voiceprintSettings.similarityThreshold).toBe(0.52);

    // 验证界面数值展示
    expect(
      screen.getByTestId('settings-page-text-similarity-value')
    ).toHaveTextContent('0.52');
  });

  it('拖动或修改滑动条数值应实时更新 store 并将模式转为 custom', () => {
    render(<SettingsView />);

    const slider = screen.getByTestId('settings-page-slider-similarity');
    fireEvent.change(slider, { target: { value: '0.66' } });

    const storeState = useMeetingStore.getState();
    expect(storeState.voiceprintSettings.similarityThreshold).toBe(0.66);
    expect(storeState.voiceprintSettings.presetMode).toBe('custom');
  });

  it('点击恢复默认参数按钮应重置回 balanced 模式', () => {
    render(<SettingsView />);

    fireEvent.click(screen.getByTestId('settings-page-btn-preset-sensitive'));
    expect(useMeetingStore.getState().voiceprintSettings.presetMode).toBe('sensitive');

    fireEvent.click(screen.getByTestId('settings-page-btn-reset-voiceprint-params'));
    expect(useMeetingStore.getState().voiceprintSettings.presetMode).toBe('balanced');
    expect(useMeetingStore.getState().voiceprintSettings.similarityThreshold).toBe(0.58);
  });
});
