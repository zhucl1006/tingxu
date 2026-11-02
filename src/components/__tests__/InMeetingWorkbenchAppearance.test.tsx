import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InMeetingWorkbench } from '../InMeetingWorkbench';
import { useMeetingStore } from '../../store/useMeetingStore';

describe('InMeetingWorkbench 会中工作台字号快速调节与键盘快捷键 (TDD)', () => {
  beforeEach(() => {
    useMeetingStore.getState().resetMeeting();
    useMeetingStore.getState().resetAppearanceSettings();
  });

  it('顶栏应渲染快速字号缩放按钮，点击能逐级放大与缩小', () => {
    render(<InMeetingWorkbench />);

    const badge = screen.getByTestId('workbench-page-header-badge-font-size');
    expect(badge).toHaveTextContent(/标准|14px|Medium/i);

    const increaseBtn = screen.getByTestId('workbench-page-header-btn-font-increase');
    const decreaseBtn = screen.getByTestId('workbench-page-header-btn-font-decrease');

    // 放大：medium -> large
    fireEvent.click(increaseBtn);
    expect(useMeetingStore.getState().appearanceSettings.fontSize).toBe('large');

    // 再放大：large -> xlarge
    fireEvent.click(increaseBtn);
    expect(useMeetingStore.getState().appearanceSettings.fontSize).toBe('xlarge');

    // 缩小：xlarge -> large
    fireEvent.click(decreaseBtn);
    expect(useMeetingStore.getState().appearanceSettings.fontSize).toBe('large');
  });

  it('支持键盘快捷键 (Cmd/Ctrl + = 放大, Cmd/Ctrl + - 缩小, Cmd/Ctrl + 0 重置)', () => {
    render(<InMeetingWorkbench />);

    // Cmd + = 放大
    fireEvent.keyDown(window, { key: '=', metaKey: true });
    expect(useMeetingStore.getState().appearanceSettings.fontSize).toBe('large');

    // Cmd + 0 重置
    fireEvent.keyDown(window, { key: '0', metaKey: true });
    expect(useMeetingStore.getState().appearanceSettings.fontSize).toBe('medium');

    // Cmd + - 缩小
    fireEvent.keyDown(window, { key: '-', metaKey: true });
    expect(useMeetingStore.getState().appearanceSettings.fontSize).toBe('small');
  });
});
