import React from 'react';

interface TingxuLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

/**
 * 听序（Tingxu）品牌官方 Logo — 【声波聚光镜 · 秩序共鸣 (浅色纯净版)】
 *
 * 视觉升级特性：
 * 1. 【高对比明亮底盘】：摒弃压抑的深黑背景，采用纯白至冰川浅蓝（#FFFFFF -> #EFF6FF）的高透光 Squircle 底盘；
 * 2. 【高饱和声序同心环】：
 *    - 外圈主声波共鸣弧：深邃皇家蓝至电光天青（#1D4ED8 -> #0284C7），在浅色背景下轮廓分明、极速扫视辨识度极高；
 *    - 中圈秩序决策横轨：纯正科技蓝至优雅靛蓝（#2563EB -> #4F46E5），线条饱满利落；
 *    - 核心共鸣奇点：双层同心能量环（#2563EB + #38BDF8 + 高光纯白），晶莹剔透；
 * 3. 【精致边缘微光】：搭配微弱的浅蓝微光边框与柔和投影，在任何深浅模式侧边栏中均格外清爽立体。
 */
export const TingxuLogo: React.FC<TingxuLogoProps> = ({
  size = 32,
  className = '',
  showText = false,
}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform duration-300 hover:scale-105"
        role="img"
        aria-label="听序 Logo"
      >
        <defs>
          {/* 超椭圆底盘渐变：纯净白至浅冰川蓝 */}
          <linearGradient id="txLightBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="60%" stopColor="#F8FAFC" />
            <stop offset="100%" stopColor="#EFF6FF" />
          </linearGradient>

          {/* 边缘浅蓝精致描边 */}
          <linearGradient id="txLightBorder" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#BFDBFE" />
            <stop offset="50%" stopColor="#93C5FD" />
            <stop offset="100%" stopColor="#C7D2FE" />
          </linearGradient>

          {/* 外环主声波渐变（深邃纯蓝 -> 电光青蓝） */}
          <linearGradient id="txWaveClearOuter" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0284C7" />
            <stop offset="50%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>

          {/* 中圈秩序核心横轨（科技主蓝 -> 极光靛蓝） */}
          <linearGradient id="txWaveClearMid" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="60%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#4F46E5" />
          </linearGradient>

          {/* 核心光晕滤镜 */}
          <filter id="txLightShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#2563EB" floodOpacity="0.12" />
          </filter>
        </defs>

        {/* 1. Squircle 纯净圆角容器底盘 */}
        <rect
          x="1.5"
          y="1.5"
          width="61"
          height="61"
          rx="17"
          fill="url(#txLightBg)"
          stroke="url(#txLightBorder)"
          strokeWidth="1.5"
          filter="url(#txLightShadow)"
        />

        {/* 2. 背景微弱浅蓝声场共鸣斑 */}
        <circle cx="28" cy="32" r="14" fill="#3B82F6" opacity="0.08" />
        <circle cx="42" cy="32" r="12" fill="#4F46E5" opacity="0.06" />

        {/* 3. 【声序合一核心矢量图形】：高清晰度深邃蓝同心声波与秩序阶梯 */}
        {/* 外圈主律动弧（广度收音，左侧大圆弧舒展，右上与右下平直收束） */}
        <path
          d="M 45 19 C 46.65 19 48 20.35 48 22 C 48 23.65 46.65 25 45 25 L 34 25 C 27.9 25 23 29.9 23 36 C 23 42.1 27.9 47 34 47 L 45 47 C 46.65 47 48 48.35 48 50 C 48 51.65 46.65 53 45 53 L 34 53 C 24.6 53 17 45.4 17 36 C 17 26.6 24.6 19 34 19 L 45 19 Z"
          fill="url(#txWaveClearOuter)"
        />

        {/* 中圈秩序核心横轨（穿插于声环中心，象征从语音到决议的提炼） */}
        <path
          d="M 28 32 C 28 29.8 29.8 28 32 28 L 47 28 C 49.2 28 51 29.8 51 32 C 51 34.2 49.2 36 47 36 L 32 36 C 29.8 36 28 34.2 28 32 Z"
          fill="url(#txWaveClearMid)"
        />

        {/* 核心高光结晶点（秩序奇点） */}
        <circle cx="39" cy="32" r="3.2" fill="#2563EB" />
        <circle cx="39" cy="32" r="1.8" fill="#38BDF8" />
        <circle cx="39" cy="32" r="0.8" fill="#FFFFFF" />

        {/* 辅助对齐标尺微光点（右上与右下结构化标记） */}
        <circle cx="46.5" cy="22" r="1.5" fill="#0284C7" />
        <circle cx="46.5" cy="42" r="1.5" fill="#4F46E5" />
      </svg>

      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 leading-none">
            <span className="text-sm font-bold tracking-tight text-text-primary">听序</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-sans font-medium bg-brand-blue-subtle text-brand-blue border border-brand-blue/20">
              AI
            </span>
          </div>
          <span className="text-[10px] text-text-tertiary mt-0.5 tracking-wide">
            极简无感会议助手
          </span>
        </div>
      )}
    </div>
  );
};
