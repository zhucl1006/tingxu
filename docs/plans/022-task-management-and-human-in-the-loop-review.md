# 待办任务管理重构与会后人工审查入库 (Human-in-the-loop Task Review) 实施计划

> **给执行者：** 本计划遵循严格 TDD（测试驱动开发）与不可覆盖的人工编辑保护（Human Protection）铁律，按任务顺序执行。

**Plan ID：** `022-task-management-and-human-in-the-loop-review`  
**创建时间：** 2026-11-05  
**最后更新：** 2026-11-05 10:49  
**当前状态：** 已完成  
**负责人：** Antigravity  
**目标：** 
1. 解除会议结束时 AI 自动向全局任务列表强行灌入未经确认待办的反模式，改为在会议总结中由用户审查确认后入库（Human-in-the-loop）；
2. 重构全局待办任务视图（TasksView）与数据模型，支持状态流转（todo / in_progress / done / canceled）、优先级管理（high / medium / low）、行内修改与编辑、删除与批量清理已完成，以及手动快速创建待办；
3. **针对用户最新体验诉求进行深度落地**：
   - 支持多行编辑（标题与多行详细描述备注 Textarea）；
   - 优先级直接单选胶囊化（直选 P1/P2/P3，告别窄下拉菜单）；
   - 截止时间集成标准日期时间选择器（`<input type="date">`）与快捷填充（今天/明天/下周）；
   - 显式提供【推进到进行中】、【标记已完成】等明确动作按钮；
   - 支持多选模式与批量悬浮操作栏（批量推进至进行中、批量标记完成、批量设为待办、批量删除）。
4. 确保符合《UIUX-DESIGN-SPEC.md》与《AGENTS.md》的 5 大工程门禁。

**技术栈：** TypeScript, React, TailwindCSS (Design Tokens, Tabular-Nums), Vitest, Local-First SQLite / localStorage

---

## 0. 状态管理

### 0.1 整体进度

- [x] 阶段 A：需求分析与方案设计完成
- [x] 阶段 B：实施计划与架构定义完成
- [x] 阶段 C：TDD 测试与核心逻辑开发完成
- [x] 阶段 D：UI/UX 组件重构与交互落地完成
- [x] 阶段 E：体验深度优化（多行编辑、直选优先级、日期控件、显式推进、多选批量）完成
- [x] 阶段 F：门禁验证与交付完成

**完成度：** 6/6（100%）

### 0.2 任务状态总览

| 任务ID | 任务名称 | 执行模式 | 并行组 | 依赖任务 | 状态 | 负责人 | 开始时间 | 完成时间 | 阻塞原因 | 验证证据 |
|---|---|---|---|---|---|---|---|---|---|---|
| T01 | 扩展 TaskItem 模型与编写 Store 任务管理与人工确认入库测试 (TDD) | 串行 | - | 无 | 已完成 | Antigravity | 2026-11-05 10:15 | 2026-11-05 10:17 | 无 | `src/store/__tests__/useMeetingStore.test.ts` (7 Red tests) |
| T02 | 实现 Store 待办 CRUD、状态流转与会后采纳入库逻辑 | 串行 | - | T01 | 已完成 | Antigravity | 2026-11-05 10:17 | 2026-11-05 10:20 | 无 | `src/store/__tests__/useMeetingStore.test.ts` (20 passed) |
| T03 | 会议总结页 (MeetingSummaryView) 行动项采纳交互重构与测试 | 串行 | - | T02 | 已完成 | Antigravity | 2026-11-05 10:20 | 2026-11-05 10:24 | 无 | `src/components/__tests__/MeetingSummaryView.test.tsx` (14 passed) |
| T04 | 全局待办视图 (TasksView) UI/UX 全面重构 (增删改查+状态+优先级) | 串行 | - | T02 | 已完成 | Antigravity | 2026-11-05 10:24 | 2026-11-05 10:26 | 无 | `src/components/__tests__/TasksView.test.tsx` (7 passed) |
| T05 | 5 大工程质量门禁全自动化验证 (Harness) 与验收 | 串行 | - | T03, T04 | 已完成 | Antigravity | 2026-11-05 10:28 | 2026-11-05 10:33 | 无 | `bash scripts/verify-gates.sh` (ALL GATES PASSED) |
| T06 | Store 扩展批量操作 (batchSetTaskStatus, batchDeleteTasks) 与 TDD 测试 | 串行 | - | T05 | 已完成 | Antigravity | 2026-11-05 10:45 | 2026-11-05 10:46 | 无 | `src/store/__tests__/useMeetingStore.test.ts` (21 passed) |
| T07 | TasksView 深度优化 (多行编辑、胶囊优先级、日期控件、显式推进、多选悬浮栏) | 串行 | - | T06 | 已完成 | Antigravity | 2026-11-05 10:46 | 2026-11-05 10:48 | 无 | `src/components/__tests__/TasksView.test.tsx` (9 passed) |
| T08 | 组件全场景测试更新与 5 大质量门禁全绿验证 | 串行 | - | T07 | 已完成 | Antigravity | 2026-11-05 10:48 | 2026-11-05 10:49 | 无 | `bash scripts/verify-gates.sh` (ALL GATES PASSED, 351 passed) |

**状态定义：** 待开始 / 进行中 / 阻塞 / 已完成 / 已取消  
**更新规则：** 任务状态每次变化都必须同步更新本表和“执行记录”。

### 0.3 执行记录

| 时间 | 任务ID | 变更 | 操作人 | 备注 |
|---|---|---|---|---|
| 2026-11-05 10:15 | INIT | 初始化计划 | Antigravity | 建立 022 待办任务重构计划 |
| 2026-11-05 10:17 | T01 | 完成 T01 | Antigravity | 扩展模型与编写 Store 单元测试，红灯确认 |
| 2026-11-05 10:20 | T02 | 完成 T02 | Antigravity | Store 逻辑实现，移除散会无脑强塞，通过所有 Store 测试 |
| 2026-11-05 10:24 | T03 | 完成 T03 | Antigravity | 会议总结页落地人工审查采纳交互，14 项测试全绿 |
| 2026-11-05 10:26 | T04 | 完成 T04 | Antigravity | 全新 TasksView UI/UX 落地，CRUD、优先级、状态与快捷添加全绿 |
| 2026-11-05 10:33 | T05 | 完成 T05 | Antigravity | 5 大工程门禁全自动化验证通过 (ALL GATES PASSED) |
| 2026-11-05 10:46 | T06 | 完成 T06 | Antigravity | Store 支持批量流转与批量删除接口，测试全绿 |
| 2026-11-05 10:48 | T07 | 完成 T07 | Antigravity | TasksView 落地多行编辑、优先级直选胶囊、日期选择与快捷填充、显式推进按钮与批量悬浮栏 |
| 2026-11-05 10:49 | T08 | 完成 T08 | Antigravity | 5 大质量门禁自动化验证通过 (ALL GATES PASSED, 351 passed) |
