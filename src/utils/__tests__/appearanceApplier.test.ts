import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyAppearanceToDom,
  resolveEffectiveTheme,
  FONT_SIZE_PX_CONFIG,
} from '../appearanceApplier';
import { UiAppearanceSettings } from '../../types/meeting';

describe('UI 外观 DOM 映射与主题生效解析器 (TDD)', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-font-size');
    document.documentElement.removeAttribute('data-font-family');
    document.documentElement.removeAttribute('data-density');
    document.documentElement.style.removeProperty('--tingxu-font-scale');
    document.documentElement.style.removeProperty('--tingxu-font-family');
    document.documentElement.style.removeProperty('--tingxu-font-base');
    document.documentElement.style.removeProperty('--tingxu-font-diff');
    document.documentElement.style.fontSize = '';
  });

  describe('resolveEffectiveTheme', () => {
    it('当主题显式为 light 时应解析为 light', () => {
      expect(resolveEffectiveTheme('light', false)).toBe('light');
      expect(resolveEffectiveTheme('light', true)).toBe('light');
    });

    it('当主题显式为 dark 时应解析为 dark', () => {
      expect(resolveEffectiveTheme('dark', false)).toBe('dark');
      expect(resolveEffectiveTheme('dark', true)).toBe('dark');
    });

    it('当主题为 system 时应根据系统 prefers-color-scheme 偏好决定', () => {
      expect(resolveEffectiveTheme('system', false)).toBe('light');
      expect(resolveEffectiveTheme('system', true)).toBe('dark');
    });
  });

  describe('FONT_SIZE_PX_CONFIG 2px 差值定义', () => {
    it('基准字号应满足严格的 2px 差值（12px, 14px, 16px, 18px）', () => {
      expect(FONT_SIZE_PX_CONFIG.small.basePx).toBe(12);
      expect(FONT_SIZE_PX_CONFIG.medium.basePx).toBe(14);
      expect(FONT_SIZE_PX_CONFIG.large.basePx).toBe(16);
      expect(FONT_SIZE_PX_CONFIG.xlarge.basePx).toBe(18);

      expect(FONT_SIZE_PX_CONFIG.medium.basePx - FONT_SIZE_PX_CONFIG.small.basePx).toBe(2);
      expect(FONT_SIZE_PX_CONFIG.large.basePx - FONT_SIZE_PX_CONFIG.medium.basePx).toBe(2);
      expect(FONT_SIZE_PX_CONFIG.xlarge.basePx - FONT_SIZE_PX_CONFIG.large.basePx).toBe(2);
    });
  });

  describe('applyAppearanceToDom', () => {
    it('能够正确将设置挂载为 document.documentElement 的 data 属性、根字号与 CSS 变量', () => {
      const settings: UiAppearanceSettings = {
        theme: 'dark',
        fontSize: 'large',
        fontFamily: 'serif',
        density: 'compact',
      };

      applyAppearanceToDom(settings, false);

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(document.documentElement.getAttribute('data-font-size')).toBe('large');
      expect(document.documentElement.getAttribute('data-font-family')).toBe('serif');
      expect(document.documentElement.getAttribute('data-density')).toBe('compact');
      expect(document.documentElement.style.getPropertyValue('--tingxu-font-base')).toBe('16px');
      expect(document.documentElement.style.getPropertyValue('--tingxu-font-diff')).toBe('2px');
      // 验证 html 根字号已被修改，使得使用 rem 的侧边栏和主界面能够实际缩放
      expect(document.documentElement.style.fontSize).toMatch(/18\./);
    });

    it('当选择 small (12px, -2px) 字号与 mono 字体时正确应用根字号与等宽字体族', () => {
      const settings: UiAppearanceSettings = {
        theme: 'light',
        fontSize: 'small',
        fontFamily: 'mono',
        density: 'comfortable',
      };

      applyAppearanceToDom(settings, false);

      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.documentElement.getAttribute('data-font-size')).toBe('small');
      expect(document.documentElement.style.getPropertyValue('--tingxu-font-base')).toBe('12px');
      expect(document.documentElement.style.getPropertyValue('--tingxu-font-diff')).toBe('-2px');
      expect(document.documentElement.style.fontSize).toMatch(/13\./);
      expect(document.documentElement.style.getPropertyValue('--tingxu-font-family')).toContain('monospace');
    });

    it('当选择 medium (14px, 默认) 时，html 根字号为标准的 16px', () => {
      const settings: UiAppearanceSettings = {
        theme: 'system',
        fontSize: 'medium',
        fontFamily: 'sans',
        density: 'comfortable',
      };

      applyAppearanceToDom(settings, false);

      expect(document.documentElement.style.fontSize).toBe('16px');
      expect(document.documentElement.style.getPropertyValue('--tingxu-font-base')).toBe('14px');
      expect(document.documentElement.style.getPropertyValue('--tingxu-font-diff')).toBe('0px');
    });
  });
});
