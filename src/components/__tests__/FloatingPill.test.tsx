import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FloatingPill } from '../FloatingPill';
import { useMeetingStore } from '../../store/useMeetingStore';

describe('FloatingPill - 微型置顶悬浮药丸组件 (TDD)', () => {
  beforeEach(() => {
    useMeetingStore.getState().resetMeeting();
    useMeetingStore.getState().startMeeting('微型悬浮测试');
    useMeetingStore.getState().tickTimer();
    useMeetingStore.getState().tickTimer();
  });

  it('渲染 42px 高度微型胶囊浮条并包含关键元素', () => {
    render(<FloatingPill />);

    const container = screen.getByTestId('floating-pill-section-container');
    expect(container).toBeInTheDocument();
    expect(container.className).toContain('h-[42px]');

    // 录音呼吸指示红点
    expect(screen.getByTestId('floating-pill-section-badge-record-dot')).toBeInTheDocument();

    // 等宽时间跳动
    const timerText = screen.getByTestId('floating-pill-section-text-timer');
    expect(timerText).toBeInTheDocument();
    expect(timerText.className).toContain('tabular-nums');

    // 展开为主窗口按钮
    expect(screen.getByTestId('floating-pill-section-btn-expand-workbench')).toBeInTheDocument();
  });

  it('点击展开按钮切换窗口状态回主工作台', () => {
    useMeetingStore.getState().setActiveWindow('floating-pill');
    render(<FloatingPill />);

    const expandBtn = screen.getByTestId('floating-pill-section-btn-expand-workbench');
    fireEvent.click(expandBtn);

    expect(useMeetingStore.getState().activeWindow).toBe('workbench');
  });
});
