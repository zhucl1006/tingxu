import { useEffect } from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import { applyAppearanceToDom } from '../utils/appearanceApplier';

export function useAppearance(): void {
  const appearanceSettings = useMeetingStore((s) => s.appearanceSettings);

  useEffect(() => {
    // 首次挂载与设置变化时应用
    applyAppearanceToDom(appearanceSettings);

    if (appearanceSettings.theme !== 'system' || typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      applyAppearanceToDom(appearanceSettings, e.matches);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handler);
      return () => mediaQuery.removeListener(handler);
    }
  }, [appearanceSettings]);
}
