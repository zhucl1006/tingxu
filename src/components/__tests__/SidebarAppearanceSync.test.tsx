import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Sidebar } from '../Sidebar';
import { useMeetingStore } from '../../store/useMeetingStore';
import { applyAppearanceToDom } from '../../utils/appearanceApplier';

describe('Sidebar 与全局页面字号 2px 差值响应 (TDD)', () => {
  beforeEach(() => {
    useMeetingStore.getState().resetAppearanceSettings();
    applyAppearanceToDom(useMeetingStore.getState().appearanceSettings);
  });

  it('侧边栏元素正常挂载，且当字号变化时 html 根字号与变量产生精准 2px 梯度', () => {
    render(<Sidebar />);

    // 默认 medium (14px 基准，根字号 16px)
    expect(screen.getByTestId('app-sidebar-container')).toBeInTheDocument();
    expect(document.documentElement.style.fontSize).toBe('16px');
    expect(document.documentElement.style.getPropertyValue('--tingxu-font-base')).toBe('14px');

    // 切换至 Large (16px，比标准高 2px)
    act(() => {
      useMeetingStore.getState().setAppearanceSettings({ fontSize: 'large' });
      applyAppearanceToDom(useMeetingStore.getState().appearanceSettings);
    });

    expect(document.documentElement.style.fontSize).toMatch(/18\./);
    expect(document.documentElement.style.getPropertyValue('--tingxu-font-base')).toBe('16px');
    expect(document.documentElement.style.getPropertyValue('--tingxu-font-diff')).toBe('2px');

    // 切换至 Small (12px，比标准低 2px)
    act(() => {
      useMeetingStore.getState().setAppearanceSettings({ fontSize: 'small' });
      applyAppearanceToDom(useMeetingStore.getState().appearanceSettings);
    });

    expect(document.documentElement.style.fontSize).toMatch(/13\./);
    expect(document.documentElement.style.getPropertyValue('--tingxu-font-base')).toBe('12px');
    expect(document.documentElement.style.getPropertyValue('--tingxu-font-diff')).toBe('-2px');

    // 切换至 XLarge (18px，比 Large 高 2px，比标准高 4px)
    act(() => {
      useMeetingStore.getState().setAppearanceSettings({ fontSize: 'xlarge' });
      applyAppearanceToDom(useMeetingStore.getState().appearanceSettings);
    });

    expect(document.documentElement.style.fontSize).toMatch(/20\./);
    expect(document.documentElement.style.getPropertyValue('--tingxu-font-base')).toBe('18px');
    expect(document.documentElement.style.getPropertyValue('--tingxu-font-diff')).toBe('4px');
  });
});
