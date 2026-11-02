import {
  ThemeMode,
  FontSizeScale,
  FontFamilyStyle,
  UiAppearanceSettings,
} from '../types/meeting';

export interface FontSizePxConfig {
  basePx: number;
  rootPx: number;
  scale: string;
  label: string;
  diffPx: number;
}

export const FONT_SIZE_PX_CONFIG: Record<FontSizeScale, FontSizePxConfig> = {
  small: {
    basePx: 12,
    rootPx: 12 / 0.875, // ~13.714px
    scale: (12 / 14).toFixed(4),
    label: '紧凑 (12px)',
    diffPx: -2,
  },
  medium: {
    basePx: 14,
    rootPx: 16, // 标准 16px
    scale: '1.0',
    label: '标准 (14px)',
    diffPx: 0,
  },
  large: {
    basePx: 16,
    rootPx: 16 / 0.875, // ~18.286px
    scale: (16 / 14).toFixed(4),
    label: '舒适 (16px)',
    diffPx: 2,
  },
  xlarge: {
    basePx: 18,
    rootPx: 18 / 0.875, // ~20.571px
    scale: (18 / 14).toFixed(4),
    label: '醒目 (18px)',
    diffPx: 4,
  },
};

export const FONT_SCALE_MAP: Record<FontSizeScale, string> = {
  small: FONT_SIZE_PX_CONFIG.small.scale,
  medium: FONT_SIZE_PX_CONFIG.medium.scale,
  large: FONT_SIZE_PX_CONFIG.large.scale,
  xlarge: FONT_SIZE_PX_CONFIG.xlarge.scale,
};

export const FONT_FAMILY_MAP: Record<FontFamilyStyle, string> = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  serif: 'Georgia, "Songti SC", "SimSun", "Noto Serif CJK SC", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

export function resolveEffectiveTheme(
  theme: ThemeMode,
  systemPrefersDark: boolean
): 'light' | 'dark' {
  if (theme === 'light') return 'light';
  if (theme === 'dark') return 'dark';
  return systemPrefersDark ? 'dark' : 'light';
}

export function applyAppearanceToDom(
  settings: UiAppearanceSettings,
  systemPrefersDark?: boolean
): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const isSystemDark =
    typeof systemPrefersDark === 'boolean'
      ? systemPrefersDark
      : typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;

  const effectiveTheme = resolveEffectiveTheme(settings.theme, isSystemDark);

  // 1. 设置主题属性（供 Tailwind darkMode: ['selector', '[data-theme="dark"]'] 以及 CSS 变量匹配）
  root.setAttribute('data-theme', effectiveTheme);

  // 2. 设置排版属性
  root.setAttribute('data-font-size', settings.fontSize);
  root.setAttribute('data-font-family', settings.fontFamily);
  root.setAttribute('data-density', settings.density);

  // 3. 关键：设置 html 根元素 font-size，驱动全应用所有使用 rem（如 text-xs, text-sm, text-base 等）的元素（侧边栏、主界面、弹窗）整体缩放
  const sizeConfig = FONT_SIZE_PX_CONFIG[settings.fontSize] || FONT_SIZE_PX_CONFIG.medium;
  root.style.fontSize = `${sizeConfig.rootPx}px`;

  // 4. 注入动态 CSS 变量
  const fontFamily = FONT_FAMILY_MAP[settings.fontFamily] || FONT_FAMILY_MAP.sans;

  root.style.setProperty('--tingxu-font-base', `${sizeConfig.basePx}px`);
  root.style.setProperty('--tingxu-font-diff', `${sizeConfig.diffPx}px`);
  root.style.setProperty('--tingxu-font-scale', sizeConfig.scale);
  root.style.setProperty('--tingxu-font-family', fontFamily);
}
