# 桌面端骨架搭建与双栏工作台实现计划

> **给 Claude / AI 智能体：** 使用 `project-workflow` 按任务顺序执行本计划。

**Plan ID：** `003-desktop-skeleton-and-ui-workbench`  
**创建时间：** 2026-10-30  
**最后更新：** 2026-10-30 22:55  
**当前状态：** 已完成  
**负责人：** 桌面前端与 Tauri 架构小组  
**目标：** 初始化 Tauri 2.0 + React + TailwindCSS 开发骨架，构建轻量常驻桌面架构，实现会中双栏工作台（左侧洞察/问答看板、右侧逐字稿/手记）与微型贴边悬浮窗（C04/C05）。  
**架构摘要：** 利用 Tauri 2 多窗口与透明无边框能力，拆分主设置窗口、会中工作台与微型置顶悬浮条；结合 Zustand 进行轻量响应式状态订阅；全面覆盖 QA `data-testid` 规范。  
**技术栈：** Tauri 2.0, Rust 1.99.1, React 18, TypeScript (strict), TailwindCSS, Zustand, Vitest  

---

## 0. 状态管理

### 0.1 整体进度

- [x] 阶段 A：Tauri 2 骨架与多窗口配置完成
- [x] 阶段 B：会中双栏布局与微型悬浮条完成
- [x] 阶段 C：组件单元测试与 QA 属性覆盖完成
- [x] 阶段 D：集成验证完成
- [x] 阶段 E：文档与交付完成

**完成度：** 5/5（100%）

### 0.2 任务状态总览

| 任务ID | 任务名称 | 执行模式 | 并行组 | 依赖任务 | 状态 | 负责人 | 开始时间 | 完成时间 | 阻塞原因 | 验证证据 |
|---|---|---|---|---|---|---|---|---|---|---|
| T01 | 初始化 Tauri 2.0 + Vite + React + Tailwind 工程骨架 | 串行 | - | 无 | 已完成 | 前端组 | 22:36 | 22:41 | 无 | Vite 5 + React 18 + Tailwind + PostCSS 初始化完毕，npm run build 通过 |
| T02 | 配置 Tauri 2 多窗口机制（主窗口与微型置顶悬浮条） | 串行 | - | T01 | 已完成 | 前端组 | 22:41 | 22:43 | 无 | `src-tauri/Cargo.toml`, `tauri.conf.json`, `main.rs` 编译通过，支持单/多窗口模式切换 |
| T03 | 构建会中双栏工作台（C04：左侧看板 54%，右侧逐字稿 46%） | 可并行 | G1 | T02 | 已完成 | 前端组 | 22:43 | 22:48 | 无 | `InMeetingWorkbench.tsx` 实现，支持依据联动、React.memo 性能优化、人工保护待复核卡片 |
| T04 | 构建微型贴边悬浮药丸/小条组件（C05） | 可并行 | G1 | T02 | 已完成 | 前端组 | 22:48 | 22:50 | 无 | `FloatingPill.tsx` 实现，42px 高度，支持 `data-tauri-drag-region` 原生拖拽与呼吸点 |
| T05 | 落地 QA data-testid 属性与组件单元测试验证 | 串行 | - | T03, T04 | 已完成 | 前端组 | 22:50 | 22:55 | 无 | 12 个 Vitest 单元测试全部通过，verify-gates.sh 5 大门禁 100% PASS |

---

## 1. 需求分析与验收标准

### 验收标准（AC）验证结果

| AC-ID | 可测试条目 | 验证方式 | 对应测试 | 状态 |
|---|---|---|---|---|
| **AC-01** | 启动应用后在 macOS / Windows 正常渲染主窗口，初始构建大小精简 | 自动/构建 | `npm run build` 耗时 445ms，产物正常 | 已验证 |
| **AC-02** | 点击“最小化至悬浮条”能隐藏主界面并唤起无边框透明置顶小条，支持贴边吸附与拖拽 | 自动/单元测试 | `FloatingPill.test.tsx` + `data-tauri-drag-region` | 已验证 |
| **AC-03** | 会中双栏工作台（左 54% + 右 46%），点击左侧证据按钮可触发事件定位与平滑呼吸高亮 | 自动/单元测试 | `InMeetingWorkbench.test.tsx` 联动测试通过 | 已验证 |
| **AC-04** | 所有按钮、输入框、卡片容器均严格按 `<page>-<section>-<type>-<purpose>` 标注唯一 `data-testid` | 自动/门禁 | Gate 5 QA 静态检测 100% 覆盖通过 | 已验证 |
| **AC-05** | 核心铁律保护：已确认或编辑结论产生事实冲突时，挂载琥珀色待复核新修订，严禁静默算法覆盖 | 自动/单元测试 | `useMeetingStore.test.ts` 冲突保护测试通过 | 已验证 |

---

## 2. 实施产出清单

1. **工程配置与架构**：
   - [`package.json`](file:///Users/zhuchunlei/work/02_mycode/tingxu/package.json)：Vite 5, React 18, Zustand, Vitest, TailwindCSS, Tauri 2 CLI.
   - [`tailwind.config.js`](file:///Users/zhuchunlei/work/02_mycode/tingxu/tailwind.config.js) & [`src/index.css`](file:///Users/zhuchunlei/work/02_mycode/tingxu/src/index.css)：完整落地 UIUX-DESIGN-SPEC 语义设计令牌（含深浅色变量、等宽数字、透明边框与毛玻璃背景）。
   - [`src-tauri/Cargo.toml`](file:///Users/zhuchunlei/work/02_mycode/tingxu/src-tauri/Cargo.toml) & [`src-tauri/tauri.conf.json`](file:///Users/zhuchunlei/work/02_mycode/tingxu/src-tauri/tauri.conf.json) & [`src-tauri/src/main.rs`](file:///Users/zhuchunlei/work/02_mycode/tingxu/src-tauri/src/main.rs)：Tauri 2 多窗口与动态尺寸变形机制。
2. **状态管理与领域模型**：
   - [`src/types/meeting.ts`](file:///Users/zhuchunlei/work/02_mycode/tingxu/src/types/meeting.ts)：严格 TypeScript 领域类型（会议状态、洞察卡片、逐字稿流、修订提议）。
   - [`src/store/useMeetingStore.ts`](file:///Users/zhuchunlei/work/02_mycode/tingxu/src/store/useMeetingStore.ts)：Zustand 会议状态机与不可覆盖的人工编辑保护（Human Protection）机制。
3. **UI 核心组件**：
   - [`src/components/InMeetingWorkbench.tsx`](file:///Users/zhuchunlei/work/02_mycode/tingxu/src/components/InMeetingWorkbench.tsx)：C-04 会中双栏工作台（左侧 54% 看板 + 右侧 46% 逐字稿，支持 React.memo 性能优化与证据联动滚动）。
   - [`src/components/FloatingPill.tsx`](file:///Users/zhuchunlei/work/02_mycode/tingxu/src/components/FloatingPill.tsx)：C-05 微型置顶悬浮药丸（42px、呼吸红点、等宽秒表、原生可拖拽）。
   - [`src/App.tsx`](file:///Users/zhuchunlei/work/02_mycode/tingxu/src/App.tsx)：主入口多窗口路由与秒级时钟调度。
4. **自动化单元测试与门禁验证**：
   - [`src/store/__tests__/useMeetingStore.test.ts`](file:///Users/zhuchunlei/work/02_mycode/tingxu/src/store/__tests__/useMeetingStore.test.ts)：6 个状态流转与铁律保护测试。
   - [`src/components/__tests__/InMeetingWorkbench.test.tsx`](file:///Users/zhuchunlei/work/02_mycode/tingxu/src/components/__tests__/InMeetingWorkbench.test.tsx)：4 个双栏工作台与交互定位测试。
   - [`src/components/__tests__/FloatingPill.test.tsx`](file:///Users/zhuchunlei/work/02_mycode/tingxu/src/components/__tests__/FloatingPill.test.tsx)：2 个悬浮胶囊窗测试。

---

## 3. 执行记录

| 时间 | 任务ID | 变更内容 | 操作人 | 备注 |
|---|---|---|---|---|
| 2026-10-30 22:36 | T01 | 初始化 Vite + React + Tailwind + Vitest 依赖与脚手架配置 | AI Assistant | 建立 tsconfig, postcss, tailwind 基础体系 |
| 2026-10-30 22:41 | T02 | 初始化 Tauri 2.0 原生多窗口与 Cargo 配置 | AI Assistant | 升级 Rust 1.99.1，生成应用图标集，验证 cargo check 通过 |
| 2026-10-30 22:43 | T03 | 严格 TDD 驱动实现 Zustand Store 与双栏工作台组件 | AI Assistant | 编写测试用例（红），实现组件（绿），落实 Human Protection 铁律 |
| 2026-10-30 22:48 | T04 | 实现 42px 原生置顶悬浮药丸组件（C05） | AI Assistant | 支持 `data-tauri-drag-region` 拖拽与等宽秒表跳动 |
| 2026-10-30 22:50 | T05 | 强化 QA data-testid，通过代码审查子代理完成性能与样式优化 | AI Assistant | 抽离 HeaderTimer 与 React.memo 组件，修复 Tailwind alpha 变量通道 |
| 2026-10-30 22:55 | DONE | 运行 `verify-gates.sh` 全套 5 大门禁自动化扫描 | AI Assistant | 12 个单元测试全过，5/5 门禁通过，Plan 003 闭环交付 |
