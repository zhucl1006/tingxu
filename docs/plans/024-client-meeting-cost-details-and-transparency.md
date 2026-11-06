# 客户端单场会议 AI 花费明细与成本透明化 (Meeting Cost Details) 分析与实施计划

> **给执行者：** 本计划遵循严格 TDD（测试驱动开发）与 Local-First/Zero-Content 隐私保护铁律，按任务顺序执行。

**Plan ID：** `024-client-meeting-cost-details-and-transparency`  
**创建时间：** 2026-11-06  
**最后更新：** 2026-11-06 09:10  
**当前状态：** 已完成  
**负责人：** Antigravity  
**目标：** 在前端客户端（桌面端与 Web）为用户提供精准的“单场会议 AI 实际花费与明细透明度”，包括会后纪要详情页的费用构成卡片、历史会议卡片费用徽章、时长用量中心的单场会议成本明细列表与场均成本估算，让用户对每次会议所需云端费用一目了然，严格保障 Zero-Content 隐私红线。  
**架构摘要：** 网关扩展支持按 `meetingId` 进行用量与成本聚合，ASR WebSocket 建连携带 `meetingId` 归属语音时长；前端定义 `MeetingAiCost` 数据结构，在 `useMeetingStore` 中进行 Local-First 本地持久化与按需拉取；UI 严格遵循 Impeccable 设计系统，以 `tabular-nums` 与语义化设计令牌呈现费用构成与明细。  
**技术栈：** TypeScript, React, Zustand, Node.js (HTTP / WebSocket), Vitest, Tailwind CSS / Design Tokens

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
| T01 | 网关扩展：AiUsageStore 支持按 meetingId 聚合与过滤用量明细 | 串行 | - | 无 | 已完成 | Antigravity | 08:52 | 08:55 | 无 | `gateway/test/aiUsageStore.test.ts` (5 passed) |
| T02 | 网关与音频客户端：ASR WebSocket 连接支持 meetingId 链路打通 | 串行 | - | T01 | 已完成 | Antigravity | 08:55 | 08:57 | 无 | `src/audio/__tests__/realStreamingAsrClient.test.ts` (8 passed) |
| T03 | 前端数据层：MeetingAiCost 类型定义与 Store 本地持久化与拉取 | 串行 | - | T02 | 已完成 | Antigravity | 08:57 | 09:00 | 无 | `src/store/__tests__/meetingAiCost.test.ts` (2 passed) |
| T04 | 前端视图层 1：MeetingSummaryView 新增本场费用徽章与明细浮层 | 串行 | - | T03 | 已完成 | Antigravity | 09:00 | 09:02 | 无 | `src/components/__tests__/MeetingCostBreakdown.test.tsx` (2 passed) |
| T05 | 前端视图层 2：BillingView 新增单场会议成本明细列表与场均成本看板 | 串行 | - | T04 | 已完成 | Antigravity | 09:02 | 09:04 | 无 | `src/components/__tests__/BillingViewCost.test.tsx` (2 passed) |
| T06 | 前端视图层 3：HomeView 历史会议列表卡片展示单场费用标识 | 串行 | - | T05 | 已完成 | Antigravity | 09:04 | 09:05 | 无 | `src/components/__tests__/HomeViewCost.test.tsx` (1 passed) |
| T07 | 全链路端到端集成验证与 5 大工程门禁验证 | 串行 | - | T06 | 已完成 | Antigravity | 09:05 | 09:10 | 无 | `bash scripts/verify-gates.sh` (ALL GATES PASSED) |

**状态定义：** 待开始 / 进行中 / 阻塞 / 已完成 / 已取消  
**更新规则：** 任务状态每次变化都必须同步更新本表和“执行记录”。

### 0.3 执行记录

| 时间 | 任务ID | 变更 | 操作人 | 备注 |
|---|---|---|---|---|
| 2026-11-06 08:50 | INIT | 初始化计划 | Antigravity | 创建单场会议 AI 花费明细与成本透明化计划 |
| 2026-11-06 08:55 | T01 | 完成网关单场聚合 | Antigravity | 网关提供按 meetingId 过滤与结构化聚合，测试通过 |
| 2026-11-06 08:57 | T02 | 打通 ASR WebSocket 归属 | Antigravity | WebSocket 建连携带 meetingId 并上报用量 |
| 2026-11-06 09:00 | T03 | 前端类型与持久化 | Antigravity | 完成类型声明、fetch 逻辑与 Local-First 持久化 |
| 2026-11-06 09:02 | T04 | 纪要页费用卡片 | Antigravity | MeetingSummaryView 渲染费用徽章与四维明细弹窗 |
| 2026-11-06 09:04 | T05 | 用量中心对账看板 | Antigravity | BillingView 渲染场均成本与会议花费明细流水 |
| 2026-11-06 09:05 | T06 | 首页历史会议费用气泡 | Antigravity | HomeView 历史卡片展示单场实际费用标签 |
| 2026-11-06 09:10 | T07 | 全量门禁通过 | Antigravity | 5 大工程质量门禁全绿，Docker 容器重构并热加载成功 |

---

## 1. 需求分析

### 1.1 需求摘要

**业务背景：**  
用户在日常开会时，不仅关心会议内容纪要与个人剩余的时长额度，也非常关心“一场会议实际会消耗多少 AI 云端成本”。在后台运维视角已有全量用量大盘，但在前端（面向最终用户）此前缺乏单场维度的成本透明度反馈，导致用户对一次 50 分钟或 1 小时的会议大概产生多少费用没有直观认知。

**核心目标：**  
1. **费用精准透明**：用户开完会或进入纪要时，能清晰获知本场会议的实际 AI 成本（如 ￥1.89 元），并能一键展开四维费用构成（ASR 语音转写时长、实时洞察 Token、会中问答 Token、会议纪要总结 Token）；
2. **用量中心全局对账**：在“时长与用量中心（BillingView）”中，提供历史每场会议的实际 AI 成本明细与个人场均开会成本（如“场均 ￥1.80 / 场”）；
3. **Local-First 与离线可用**：费用数据本地持久化存储在客户端，即使离线或网关临时关闭，也能随时回溯历史会议花费；
4. **恪守 Zero-Content 红线**：成本明细仅包含 Token、时长与金额等数值统计元数据，严禁出现任何用户会议正文文本。

**范围内（In Scope）：**  
- [ ] 网关 `AiUsageStore` 支持传入 `meetingId` 进行过滤与单场聚合（返回总花费、分类花费构成、Token 汇总、语音时长）；
- [ ] 网关 `/gateway/v1/billing/ai-usage` 接口增加 `?meetingId=...` 参数支持；
- [ ] ASR WebSocket 建连 URL 携带 `?meetingId=...`，网关在会话结束结算时归属 `meetingId`；
- [ ] 前端类型 `types/meeting.ts` 扩充 `MeetingAiCost` 并加入 `HistoryMeeting` 与 `MeetingState`；
- [ ] 前端 Store 实现 `fetchMeetingAiCost(meetingId)` 并与本地存储持久化打通；
- [ ] `MeetingSummaryView` 顶部展示 `AI 成本 ￥X.XX` 标签及交互式费用明细 Popover / Modal；
- [ ] `BillingView` 新增「单场会议实际 AI 成本明细」列表与「场均 AI 成本」指标；
- [ ] `HomeView` 历史会议列表卡片展示单场费用徽章；
- [ ] 严格遵守 `data-testid` QA 规范与 Impeccable 设计系统。

**范围外（Out of Scope）：**  
- 涉及微信支付账户余额实时扣费（用户扣费仍走会议时长预付包，本功能定位为实际 AI API 成本透明化与审计）；
- 跨设备云端账单同步（遵循 Local-First，保存在本地设备）。

### 1.2 用户路径与核心交互

| 步骤 | 角色 | 操作 | 系统响应 | 验证点 |
|---|---|---|---|---|
| 1 | 用户 | 会议结束进入「会议纪要与总结」页面 | 顶部元数据栏展示本场总花费（如 `￥1.89`，tabular-nums） | 徽章正常显示并带货币符号 |
| 2 | 用户 | 点击「AI 成本 ￥1.89」徽章 | 弹出/展开本场费用明细面板，展示 ASR、洞察、问答、纪要的具体用量与折合人民币 | 4 种类型各自的 Token/时长与金额正确对应 |
| 3 | 用户 | 导航切换至侧边栏「时长与用量」 | 页面展示当前额度看板、场均 AI 成本（如 ￥1.89/场）以及历史会议花费流水表格 | 表格支持查看历史每场会议消耗与费用 |
| 4 | 用户 | 返回「首页 / 历史会议」 | 历史会议卡片列表上展示对应会议的花费标签 | 历史会议卡片呈现单场花费 |

### 1.3 验收标准（AC）

| AC-ID | 可测试条目 | 验证方式（自动/手动） | 对应测试 | 状态 |
|---|---|---|---|---|
| AC-01 | 网关 AiUsageStore 支持按 meetingId 过滤并返回正确的单场费用聚合结构 | 自动 | `gateway/test/aiUsageStore.test.ts` | 通过 |
| AC-02 | ASR WebSocket 流式连接支持 meetingId 并正确记录单场 ASR 时长与成本 | 自动 | `src/audio/__tests__/realStreamingAsrClient.test.ts` | 通过 |
| AC-03 | 前端 useMeetingStore 正确拉取 meetingId 费用并持久化落盘至 HistoryMeeting | 自动 | `src/store/__tests__/meetingAiCost.test.ts` | 通过 |
| AC-04 | MeetingSummaryView 渲染 AI 成本徽章并支持点击查看四维花费明细 | 自动 | `src/components/__tests__/MeetingCostBreakdown.test.tsx` | 通过 |
| AC-05 | BillingView 展示场均会议成本与单场会议花费明细表 | 自动 | `src/components/__tests__/BillingViewCost.test.tsx` | 通过 |
| AC-06 | HomeView 历史会议卡片正确展示对应会议的花费标签 | 自动 | `src/components/__tests__/HomeViewCost.test.tsx` | 通过 |
| AC-07 | 所有新增交互元素 100% 具备合规的 data-testid 且全套 5 大门禁全绿 | 自动 | `bash scripts/verify-gates.sh` | 通过 |

### 1.4 Code Review Graph 影响分析

- **仓库根目录**：`/Users/zhuchunlei/work/02_mycode/tingxu`
- **CLI/MCP 状态**：降级为源码、测试与 harness 分析
- **受影响模块**：
  - `gateway/src/billing/aiUsageStore.ts`：增加按 meetingId 聚合逻辑；
  - `gateway/src/server.ts` & `gateway/src/asr/streamingAsrServer.ts`：处理 meetingId 参数；
  - `src/types/meeting.ts`：增加 `MeetingAiCost` 类型定义；
  - `src/store/useMeetingStore.ts`：新增 `fetchMeetingAiCost` 动作与历史会议成本存储；
  - `src/audio/realStreamingAsrClient.ts`：ASR 连接传递 meetingId；
  - `src/components/views/MeetingSummaryView.tsx`：顶部展示成本徽章与明细卡片；
  - `src/components/views/BillingView.tsx`：增加单场会议成本明细大盘与场均统计；
  - `src/components/views/HomeView.tsx`：历史卡片渲染花费标签。
- **公共契约影响**：
  - `GET /gateway/v1/billing/ai-usage?meetingId=...` 为完全向下兼容的扩展查询，不破坏现有大盘调用。
- **持久化影响**：
  - 前端本地存储向后兼容（缺失 `aiCost` 的历史会议优雅降级或按需拉取）。

---

## 2. 实施计划与 TDD 编排

### T01 网关扩展：AiUsageStore 支持按 meetingId 聚合与过滤用量明细
- **目标**：在 `AiUsageStore` 中提供 `getStats(meetingId?: string)`，支持精准统计单场会议的 `totalCostYuan`、`totalTokens`、`totalAudioSeconds` 与四维分类明细。
- **RED 测试**：在 `gateway/test/aiUsageStore.test.ts` 中编写单场会议用量聚合测试用例。
- **GREEN 实现**：实现过滤与结构化返回。
- **REFACTOR**：保持时间与 Provider 聚合兼容。

### T02 网关与音频客户端：ASR WebSocket 连接支持 meetingId 链路打通
- **目标**：在 `RealStreamingAsrClient` 与 `streamingAsrServer` 中打通 `meetingId` 传递与结算归属。
- **RED 测试**：编写测试验证带有 `meetingId` 的 WebSocket 结束时上报带 `meetingId` 的 ASR 用量。
- **GREEN 实现**：解析 query 参数并在 `onStreamEnd` 中传递 `meetingId`。

### T03 前端数据层：MeetingAiCost 类型定义与 Store 本地持久化与拉取
- **目标**：在 `src/types/meeting.ts` 声明 `MeetingAiCost`，并在 `useMeetingStore` 中添加 `fetchMeetingAiCost` 与持久化逻辑。
- **RED 测试**：编写 `src/store/__tests__/meetingAiCost.test.ts`。
- **GREEN 实现**：实现 Store action 与本地缓存逻辑。

### T04 前端视图层 1：MeetingSummaryView 新增本场费用徽章与明细浮层
- **目标**：在纪要详情页顶部渲染费用徽章，点击呈现 ASR、洞察、问答、纪要四维明细。
- **RED 测试**：编写 `src/components/__tests__/MeetingCostBreakdown.test.tsx`。
- **GREEN 实现**：实现高保真徽章与 Popover 明细卡片。

### T05 前端视图层 2：BillingView 新增单场会议成本明细列表与场均成本看板
- **目标**：在用量中心展示历史会议单场 AI 成本列表与场均统计。
- **RED 测试**：编写 `src/components/__tests__/BillingViewCost.test.tsx`。
- **GREEN 实现**：实现用量中心单场会议对账表与场均卡片。

### T06 前端视图层 3：HomeView 历史会议列表卡片展示单场费用标识
- **目标**：在首页历史会议卡片中展示单场费用气泡。
- **RED 测试**：编写 `src/components/__tests__/HomeViewCost.test.tsx`。
- **GREEN 实现**：更新历史卡片渲染逻辑。

### T07 全链路端到端集成验证与 5 大工程门禁验证
- **目标**：运行 `bash scripts/verify-gates.sh` 确保 5 大门禁（凭据、文档、类型、测试、data-testid）全绿，重启并更新容器。
