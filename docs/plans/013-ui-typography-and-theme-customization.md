# 界面字体大小、排版与风格样式自定义实施计划

> **给 AI 智能体 / 开发者：** 本计划遵循 `AGENTS.md` 四大铁律与严格 TDD 流程。所有前端用户可见交互元素均必须标注规范的 `data-testid`。所有样式令牌与变量变更必须严格遵循 `docs/specs/UIUX-DESIGN-SPEC.md`。

**Plan ID：** `013-ui-typography-and-theme-customization`  
**创建时间：** 2026-11-01  
**最后更新：** 2026-11-01  
**当前状态：** 已完成（字号阶梯、字体风格、深浅主题、阅读密度与会中快捷键调节已全量交付并全通质量门禁）  
**负责人：** 前端工程组、UI/UX 设计组、QA 组  
**目标：** 为听序桌面端提供完善的界面字体大小调节、字体风格（Sans/Serif/Mono）、主题外观模式（跟随系统/浅色明亮/深色夜间）与排版密度（舒适/紧凑）的自定义配置能力，支持即时预览、本地 Local-First 记忆存储及会中快捷键调节。  
**架构摘要：** 基于 React 18 + Tailwind CSS + CSS 变量设计令牌（Design Tokens）；通过在 `document.documentElement` 上动态挂载 `data-theme`、`data-font-size`、`data-font-family` 与 `--tingxu-font-scale` 变量，实现全应用无需刷新的毫秒级响应；状态由 Zustand `useMeetingStore` 集中管理并持久化到本地存储；在系统设置（SettingsView）提供所见即所得的可视化预览看板。  
**技术栈：** React 18、Tailwind CSS、Zustand、TypeScript 5、Vitest、Testing Library

---

## 0. 状态管理

### 0.1 整体进度

- [x] 阶段 1：外观与排版数据契约设计与 Store 状态持久化（TDD）
- [x] 阶段 2：设计令牌、CSS 变量与 Tailwind 动态主题改造
- [x] 阶段 3：系统设置页「界面外观与排版样式」配置面板与所见即所得预览（QA 门禁）
- [x] 阶段 4：会中工作台文本响应与快捷键调节
- [x] 阶段 5：全量门禁检查、回归测试与端到端桌面版验证

**完成度：** 5/5（100%）

### 0.2 任务状态总览

| 任务ID | 任务名称 | 执行模式 | 依赖任务 | 状态 | 负责人 | 验证证据 |
|---|---|---|---|---|---|---|
| T01 | 外观与排版数据契约与 Store 状态管理（TDD） | 串行 | 无 | 已完成 | 前端组 | `src/store/__tests__/appearanceSettings.test.ts` |
| T02 | 设计令牌 CSS 变量扩展与 Tailwind 主题联动工具 | 串行 | T01 | 已完成 | UI/UX 组 | `src/utils/__tests__/appearanceApplier.test.ts`、`src/index.css` |
| T03 | 系统设置页外观排版配置卡片与实时预览组件 | 串行 | T02 | 已完成 | 前端组 | `src/components/__tests__/SettingsViewAppearance.test.tsx` |
| T04 | 会中工作台字号响应、间距自适应与键盘快捷键微调 | 串行 | T03 | 已完成 | 前端组 | `src/components/__tests__/InMeetingWorkbenchAppearance.test.tsx` |
| T05 | 全量测试与工程 5 大质量门禁验证（Gate 1~5） | 串行 | T04 | 已完成 | QA 组 | `bash scripts/verify-gates.sh` |

---

## 1. 需求分析与验收标准

### 1.1 业务目标
用户在不同屏幕尺寸（如 13 寸 MacBook、27 寸 4K 显示器）、不同光照环境（暗光会议室、明亮办公桌）以及不同视力偏好下，对会议记录文本的可读性有极高要求。听序需要提供无损、不破布局、所见即所得的显示自适应能力。

### 1.2 范围内（In Scope）
1. **字号阶梯调节（Font Size Scale）**：
   - 紧凑（Small / 13px，缩放系数 0.90）
   - 标准（Medium / 14px，缩放系数 1.00，默认）
   - 舒适（Large / 15.5px，缩放系数 1.10）
   - 醒目（X-Large / 17px，缩放系数 1.22）
2. **主题外观模式（Theme Mode）**：
   - 跟随系统（System，默认）
   - 浅色明亮（Light）
   - 深色暗黑（Dark）
3. **字体风格（Font Family Style）**：
   - 现代黑体（Sans - 默认系统无衬线，最强可扫视性）
   - 典雅阅读（Serif - 衬线体，沉浸式长文阅读）
   - 极客等宽（Mono - 代码/技术讨论风格）
4. **阅读密度（Content Density）**：
   - 舒适宽松（Comfortable，间距适度，护眼）
   - 紧凑高密（Compact，信息量大，减少翻页）
5. **本地持久化与无闪烁加载**：
   - 配置保存在本地 `localStorage`，重启应用或热重载时即时还原，避免白屏或样式闪跳（FOUC）。
6. **实时预览与一键还原**：
   - 在设置中提供即时渲染的预览卡片，包含逐字稿、说话人标签与决议徽标；提供“恢复系统默认”按钮。

### 1.3 范围外（Out of Scope）
- 不引入网络下载的第三方外部 Web 字体（保持 Local-First，零外网依赖，保证毫秒级启动）；
- 不做花哨的多彩渐变皮肤或破坏克制设计理念的个性化装饰。

### 1.4 验收标准（Acceptance Criteria）
- **AC-01**：在“系统设置”页面可自由切换 4 档字号，主界面所有文字、工作台逐字稿、洞察卡片即时按比例缩放，不发生遮挡或文字截断。
- **AC-02**：主题支持系统、浅色、深色三种模式切换，即便系统处于深色，用户强制选择浅色也能立即正确生效（反之亦然）。
- **AC-03**：字体家族支持 Sans、Serif、Mono 三种风格无缝切换。
- **AC-04**：所有设置在刷新页面或重新启动客户端后自动保持。
- **AC-05**：所有新增交互元素与预览卡片 100% 覆盖符合规范的 `data-testid`。
- **AC-06**：既有全部 143 项测试保持 100% 通过，不引入回归故障。

---

## 2. 代码影响与架构设计

### 2.1 受影响模块
- `src/types/meeting.ts`：声明 `ThemeMode`、`FontSizeScale`、`FontFamilyStyle`、`ContentDensity` 与 `UiAppearanceSettings` 类型契约。
- `src/store/useMeetingStore.ts`：扩展全局 Store，接入持久化加载与更新逻辑。
- `src/utils/appearanceApplier.ts`（新建）：负责将设置应用至 DOM 根节点的纯函数工具。
- `src/index.css`：完善设计令牌，支持 `[data-theme]`、`[data-font-size]` 等属性选择器与 `--tingxu-font-scale` 变量。
- `tailwind.config.js`：适配深色模式选择器 `darkMode: ['selector', '[data-theme="dark"]']`。
- `src/components/views/SettingsView.tsx`：嵌入「界面外观与排版样式」卡片与预览组件。
- `src/App.tsx`：全局监听与初始加载绑定。

### 2.2 验证矩阵
| 变更项 | 单元测试 | 集成测试 | 门禁校验 |
|---|---|---|---|
| Appearance 状态管理 | `appearanceSettings.test.ts` | Vitest Store 集成 | Gate 4 |
| DOM 属性应用函数 | `appearanceApplier.test.ts` | DOM 属性与 CSS 变量断言 | Gate 3, Gate 4 |
| 设置界面与预览渲染 | `SettingsViewAppearance.test.tsx` | React Testing Library 用户交互 | Gate 4, Gate 5 |
| 全局回归测试 | 现有 26 个测试文件 | 全量 Vitest | Gate 4 |
