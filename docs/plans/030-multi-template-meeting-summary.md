# 多角色多场景智能会议纪要模板体系（10 大经典模板）分析与实施计划

> **给 Claude：** 使用 `project-workflow` 按任务顺序执行本计划。

**Plan ID：** `030-multi-template-meeting-summary`  
**创建时间：** 2026-11-16  
**最后更新：** 2026-11-16 15:10  
**当前状态：** 已完成  
**负责人：** Antigravity 研发团队  
**目标：** 在听序（Tingxu）中全面引入并落地包含「高校会议纪要、德鲁克有效会议、康奈尔笔记、客户拜访纪要、采访内容分析、麦克菲整理法、面试复盘纪要、GRAI 复盘、精简版纪要、角色总结纪要」在内的 10 大经典结构化会议模板体系，实现面向学生、销售、记者、媒体、招聘者、职场管理层和秘书等全角色的精准总结、多态卡片渲染、一键切换重排与规范 Markdown 导出。  
**架构摘要：** 构建模块化模板引擎 `MeetingTemplateRegistry`，定义 10 大模板元数据契约（Schema、Prompt 编排与多态渲染转换）；升级 `ByokLlmClient` 与 `useMeetingStore` 支持模板参数路由、多态 Payload 本地持久化与会后一键重新生成；在 `MeetingSummaryView` 构建多态卡片看板（德鲁克 DRI 责任矩阵、康奈尔三区双栏、GRAI 四阶复盘、面试评分雷达等）与专属 Markdown 导出；严格遵循 Local-First 隐私铁律、人工编辑保护与 QA `data-testid` 门禁。  
**技术栈：** TypeScript 5, React 18, Zustand, TailwindCSS, Vitest, Testing Library.

---

## 0. 状态管理

### 0.1 整体进度

- [x] 阶段 A：需求分析完成
- [x] 阶段 B：实施计划完成
- [x] 阶段 C：开发与自测完成
- [x] 阶段 D：集成验证完成
- [x] 阶段 E：文档与交付完成

**完成度：** 5/5（100%）

### 0.2 任务状态总览

| 任务ID | 任务名称 | 执行模式 | 并行组 | 依赖任务 | 状态 | 负责人 | 开始时间 | 完成时间 | 阻塞原因 | 验证证据 |
|---|---|---|---|---|---|---|---|---|---|---|
| T01 | 10 大会议模板契约定义与模板注册表引擎构建 (TDD) | 串行 | - | 无 | 已完成 | Antigravity | 14:35 | 14:39 | 无 | `templateRegistry.test.ts` 5/5 通过，`tsc --noEmit` 0 报错 |
| T02 | ByokLlmClient 模板 Prompt 编排与结构化 Schema 提取能力升级 (TDD) | 串行 | - | T01 | 已完成 | Antigravity | 14:40 | 14:47 | 无 | `byokLlmClient.test.ts` 10/10 通过（含 grai 模板提示词与 Payload 校验） |
| T03 | useMeetingStore 模板状态、多态 Payload 持久化与会后重生成动作 (TDD) | 串行 | - | T02 | 已完成 | Antigravity | 14:48 | 14:53 | 无 | `multiTemplateStore.test.ts` 2/2 通过，人工编辑保护测试通过 |
| T04 | 多模板差异化 Markdown 导出与剪贴板生成引擎 (TDD) | 串行 | - | T01 | 已完成 | Antigravity | 14:54 | 14:56 | 无 | `templateMarkdownFormatter.test.ts` 4/4 通过（德鲁克/GRAI/康奈尔专属排版） |
| T05 | 前端 MeetingSummaryView 模板切换选择器与多态组件视图渲染 (TDD) | 串行 | - | T03, T04 | 已完成 | Antigravity | 14:58 | 15:06 | 无 | `MeetingSummaryViewTemplate.test.tsx` 3/3 通过，14 套既有测试全部通过 |
| T06 | 模块文档落盘、系统设计同步与 5 大工程质量门禁全量验证 | 合并门禁 | - | T05 | 已完成 | Antigravity | 15:07 | 15:10 | 无 | `verify-gates.sh` 5/5 全绿，`docs/modules/multi-template-summary.md` 索引就绪 |

**状态定义：** 待开始 / 进行中 / 阻塞 / 已完成 / 已取消  
**更新规则：** 任务状态每次变化都必须同步更新本表和“执行记录”。

### 0.3 执行记录

| 时间 | 任务ID | 变更 | 操作人 | 备注 |
|---|---|---|---|---|
| 2026-11-16 14:32 | INIT | 初始化计划 | Antigravity | 调研讯飞听见 10 大模板并创建 030 分析计划文档 |
| 2026-11-16 14:35 | T01 | 状态：待开始 -> 进行中 | Antigravity | 开始编写模板元数据定义与 Registry 注册表单测 |
| 2026-11-16 14:39 | T01 | 状态：进行中 -> 已完成 | Antigravity | 完成 10 大模板类型契约、多态 Payload 与 templateRegistry 引擎 |
| 2026-11-16 14:40 | T02 | 状态：待开始 -> 进行中 | Antigravity | 开始 ByokLlmClient 模板专属提示词与 Schema 解析 TDD |
| 2026-11-16 14:47 | T02 | 状态：进行中 -> 已完成 | Antigravity | 完成 generateMeetingSummary 模板支持与 Token 计费联动 |
| 2026-11-16 14:48 | T03 | 状态：待开始 -> 进行中 | Antigravity | 开始 useMeetingStore 会议模板重生成动作与人工编辑保护 TDD |
| 2026-11-16 14:53 | T03 | 状态：进行中 -> 已完成 | Antigravity | 完成 regenerateSummaryWithTemplate 动作与历史会议多态持久化 |
| 2026-11-16 14:54 | T04 | 状态：待开始 -> 进行中 | Antigravity | 开始 10 大模板专属 GitHub Flavored Markdown 生成器 TDD |
| 2026-11-16 14:56 | T04 | 状态：进行中 -> 已完成 | Antigravity | 完成 formatTemplateMarkdown 德鲁克、GRAI、康奈尔等专属排版 |
| 2026-11-16 14:58 | T05 | 状态：待开始 -> 进行中 | Antigravity | 开始 MeetingSummaryView 模板下拉菜单与多态卡片组件 TDD |
| 2026-11-16 15:06 | T05 | 状态：进行中 -> 已完成 | Antigravity | 完成 MeetingTemplateSectionRenderer 与选择器联动，测试全绿 |
| 2026-11-16 15:07 | T06 | 状态：待开始 -> 进行中 | Antigravity | 编写 multi-template-summary.md 模块文档并更新全套规范与门禁 |
| 2026-11-16 15:10 | T06 | 状态：进行中 -> 已完成 | Antigravity | 全套 5 大质量门禁验证通过，完成文档与代码闭环 |

---

## 1. 需求分析

### 1.1 需求摘要

**业务背景：**
- 现行智能会议纪要工具普遍输出通用的“概览 + 决策 + 待办”流水账，无法满足不同工种与垂直场景的深度诉求：
  1. **学生与学者**在学术组会中需要区分课题进展、导师批评与待求证科学问题，或在听课时习惯康奈尔 5R 空间分区；
  2. **商务销售（BD/AM）**拜访客户后急需捕捉 BANT 要素（预算、决策链、痛点）与跟进节点；
  3. **招聘官与主管（HR/HM）**需要根据岗位胜任力模型与 STAR 法则做出是否录用的量化决策；
  4. **管理者与业务高管**开会追求德鲁克“成果与决策导向”，要求无情剔除过程废话并记录关键反对意见；
  5. **项目经理（PM）**在复盘时依赖 GRAI 闭环（目标回顾、结果对照、根本归因、规律启示）；
  6. **媒体记者与非虚构作家**需要分类采撷受访者高价值金句（Quotes）或使用麦克菲卡片整理法重组跨时间线逻辑。

**核心目标：**
- **目标 1（10 大模板全量支持）**：在听序中内置全部 10 种经典模板（高校会议、德鲁克有效会议、康奈尔笔记、客户拜访、采访分析、麦克菲整理法、面试复盘、GRAI、精简版、角色总结），覆盖学生、商务销售、记者、媒体、招聘者、职场管理层和秘书 7 大典型角色。
- **目标 2（强类型 Schema 抽取与证据回溯）**：每个模板具备专属的结构化抽取 Schema 与思维链 Prompt，提取的内容必须绑定原逐字稿段落 ID（`evidenceSegmentId`），支持点击一键居中滚动高亮回溯原文。
- **目标 3（会后一键切换与低成本重塑）**：基于本地缓存的完整逐字稿流，用户在纪要视图可自由切换模板并一键“重新总结”，无需重新录制即可秒级重构为另一种思维框架。
- **目标 4（多态视觉卡片与专业 Markdown 导出）**：界面采用符合 Impeccable 规范的多态交互组件（康奈尔左右分栏、GRAI 四阶卡片、德鲁克 DRI 责任人表格等），复制与导出的 Markdown 完整呈现该模板专属格式。
- **目标 5（严守工程红线）**：全本地闭环持久化（Zero-Content Policy）、人工编辑保护（已确认卡片绝不被新模板覆盖）以及 100% 覆盖 QA `data-testid`。

**范围内（In Scope）：**
- [ ] 模板核心注册表 `MeetingTemplateRegistry` 及 10 种模板元数据；
- [ ] `ByokLlmClient.generateMeetingSummary` 升级支持 `templateId` 与定制化 Prompt / Schema；
- [ ] `useMeetingStore` 扩展 `selectedTemplateId`、模板多态 Payload 存储与重生成 Action；
- [ ] 专属 Markdown 格式化引擎 `templateMarkdownFormatter`；
- [ ] `MeetingSummaryView` 模板选择下拉组件、多态卡片渲染与 QA 门禁覆盖；
- [ ] 模块设计文档 `docs/modules/multi-template-summary.md` 与全局索引同步。

**范围外（Out of Scope）：**
- [ ] 本期不包含用户自定义上传脚本的第三方外部模板市场，先稳定内置经典的 10 大官方模板；
- [ ] 不改变会中实时流式转写核心引擎。

### 1.2 用户路径与核心交互

| 步骤 | 角色 | 操作 | 系统响应 | 验证点 |
|---|---|---|---|---|
| 1 | 用户（如销售） | 结束一场客户拜访会议，系统进入会后总结报告页面 | 默认呈现当前模板纪要，顶部显著显示模板切换选择器（带角色与场景标签） | 模板选择器可见，包含 10 个选项 |
| 2 | 用户 | 在模板下拉菜单中选择「客户拜访纪要模板（商务销售）」并点击「重新总结」 | 系统弹出轻量加载态，调用大模型按照客户拜访 Schema（痛点、BANT商务、Next Steps）重新提取并刷新卡片 | 结构化卡片瞬间切换为客户拜访专属字段 |
| 3 | 用户 | 在客户痛点卡片中点击「依据」标签 | 右侧逐字稿平滑居中滚动至对应的客户原话段落，并呈现呼吸焦点高亮 | 依据锚点准确无误联动 |
| 4 | 用户 | 点击「复制纪要」或「导出 Markdown」 | 剪贴板或下载的 `.md` 文件严格按照客户拜访专属格式排版，包含客户基本信息、痛点与后续跟进表 | 导出的 Markdown 结构与模板定义一致 |

### 1.3 验收标准（AC）草案

| AC-ID | 可测试条目 | 验证方式 | 对应测试 | 状态 |
|---|---|---|---|---|
| AC-01 | 10 大模板元数据定义完整，每个模板包含唯一 ID、名称、角色标签、描述、SystemPrompt 与 Schema 规范 | 自动 | `meetingTemplateRegistry.test.ts` | 待验证 |
| AC-02 | ByokLlmClient 在指定 templateId 时能正确拼装专属 Prompt，并解析返回多态 Payload | 自动 | `byokLlmClient.test.ts` | 待验证 |
| AC-03 | useMeetingStore 支持设置与持久化当前会议的 templateId 与 templatePayload，且切换重总结保留人工编辑项 | 自动 | `multiTemplateStore.test.ts` | 待验证 |
| AC-04 | 针对 10 大模板能够生成格式标准的专属 Markdown 字符串 | 自动 | `templateMarkdownFormatter.test.ts` | 待验证 |
| AC-05 | MeetingSummaryView 渲染模板选择器（带 data-testid），切换模板后正确展示对应的多态 UI 结构 | 自动 | `MeetingSummaryViewTemplate.test.tsx` | 待验证 |
| AC-06 | 全量回归与 5 大质量门禁（代码格式、类型检查、测试全绿、无敏感词）100% 通过 | 自动 | `bash scripts/verify-gates.sh` | 待验证 |

---

## 2. 实施计划与任务编排

### T01：10 大会议模板契约定义与模板注册表引擎构建 (TDD)
- **目标**：在 `src/types/template.ts` 与 `src/engine/templateRegistry.ts` 中完整定义 10 大模板数据结构、角色枚举与元数据注册表。
- **RED**：编写 `src/engine/__tests__/templateRegistry.test.ts`，验证能够按 ID 正确检索 10 个模板，检验高校、德鲁克、康奈尔、拜访、采访、麦克菲、面试、GRAI、精简版、角色总结的元数据完整性。
- **GREEN**：实现 `src/types/template.ts` 与 `src/engine/templateRegistry.ts`，内置全部 10 套模板定义。
- **REFACTOR**：统一导出便捷查询与校验助手。

### T02：ByokLlmClient 模板 Prompt 编排与结构化 Schema 提取能力升级 (TDD)
- **目标**：扩展 `src/api/byokLlmClient.ts` 的 `generateMeetingSummary` 方法，支持 `templateId?: MeetingTemplateId`。
- **RED**：在 `src/api/__tests__/byokLlmClient.test.ts` 中增加测试用例，验证传入不同 `templateId` 时拼装的系统提示词，以及正确解析模板多态字段。
- **GREEN**：重构 `generateMeetingSummary`，动态注入模板指定的 JSON Schema 与抽取指导语，返回标准的结构化 Payload。
- **REFACTOR**：保证旧格式（无 templateId）平滑向后兼容。

### T03：useMeetingStore 模板状态、多态 Payload 持久化与会后重生成动作 (TDD)
- **目标**：在 `useMeetingStore` 中扩展会议数据模型，支持保存 `templateId` 和 `templatePayload`，并提供 `regenerateSummaryWithTemplate(meetingId, templateId)` 异步方法。
- **RED**：在 `src/store/__tests__/multiTemplateStore.test.ts` 编写测试，模拟切换模板并重生成总结，验证 store 状态与本地持久化更新。
- **GREEN**：在 `src/store/useMeetingStore.ts` 中实现对应 action 与数据落盘。
- **REFACTOR**：确保与原有的 `MeetingStructuredSummary`（decisions, actions, overview）双向同步。

### T04：多模板差异化 Markdown 导出与剪贴板生成引擎 (TDD)
- **目标**：实现 `src/utils/templateMarkdownFormatter.ts`，为 10 种模板分别设计清晰美观的 GitHub Flavored Markdown 排版生成器。
- **RED**：编写 `src/utils/__tests__/templateMarkdownFormatter.test.ts`，验证德鲁克（包含分歧与 DRI）、GRAI（包含四个阶段表）、康奈尔（三区分割）、面试（STAR事实与录用决策）等导出的 Markdown 格式。
- **GREEN**：实现各模板专用的 Markdown 生成逻辑，并提供统一的入口函数。
- **REFACTOR**：支持未配置多态数据时的优雅降级。

### T05：前端 MeetingSummaryView 模板切换选择器与多态组件视图渲染 (TDD)
- **目标**：在 `src/components/views/MeetingSummaryView.tsx` 增加模板选择下拉菜单、重生成按钮，并实现针对不同模板的多态展示卡片。
- **RED**：编写 `src/components/__tests__/MeetingSummaryViewTemplate.test.tsx`，测试选择器交互、触发重总结、多态组件渲染以及 `data-testid` 规范。
- **GREEN**：在 `MeetingSummaryView.tsx` 中集成模板组件与选择器，完成多态渲染分支与导出联动。
- **REFACTOR**：统一符合 `UIUX-DESIGN-SPEC.md` 的 CSS 变量与圆角间距。

### T06：模块文档落盘、系统设计同步与 5 大工程质量门禁全量验证
- **目标**：编写 `docs/modules/multi-template-summary.md`，更新 `docs/README.md`、`docs/specs/PRD.md`、`docs/specs/SAD.md`，执行全量回归与 `scripts/verify-gates.sh`。
- **验收**：所有门禁绿灯通过，无类型报错，测试用例 100% 通过。
