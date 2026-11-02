import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppearance } from '../useAppearance';
import { useMeetingStore } from '../../store/useMeetingStore';

describe('useAppearance Hook (TDD)', () => {
  beforeEach(() => {
    useMeetingStore.getState().resetAppearanceSettings();
  });

  it('挂载时应立即把 store 中的 appearanceSettings 应用到 DOM 根节点', () => {
    useMeetingStore.getState().setAppearanceSettings({
      theme: 'dark',
      fontSize: 'large',
      fontFamily: 'serif',
      density: 'compact',
    });

    renderHook(() => useAppearance());

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-font-size')).toBe('large');
    expect(document.documentElement.getAttribute('data-font-family')).toBe('serif');
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
  });

  it('当 store 设置变更时应实时重新应用到 DOM', () => {
    renderHook(() => useAppearance());

    act(() => {
      useMeetingStore.getState().setAppearanceSettings({
        theme: 'light',
        fontSize: 'small',
      });
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-font-size')).toBe('small');
  });
});
