# AI 实际成本与用量大盘 (Cost Analytics Dashboard) 分析与实施计划

> **给执行者：** 本计划遵循严格 TDD（测试驱动开发）与 Zero-Content 隐私保护铁律，按任务顺序执行。

**Plan ID：** `021-ai-cost-analytics-and-dashboard`  
**创建时间：** 2026-11-04  
**最后更新：** 2026-11-04 16:15  
**当前状态：** 已完成  
**负责人：** Antigravity  
**目标：** 在商业控制面运营后台 `http://localhost:3200/` 中，实时展现 AI 相关部分（LLM 问答/实时洞察/纪要总结 + ASR 语音识别流）的实际使用费用、Token 与时长消耗统计大盘与脱敏流水，严格保障 Zero-Content 隐私红线。  
**架构摘要：** AI Gateway 在处理 LLM 和 ASR 请求时捕获 Token 及音频流时长，通过 `costCalculator` 计算实际人民币费用并脱敏持久化；控制面 Server 聚合 AI 用量指标；Web 运营管理后台新增「AI 用量与成本大盘」页面呈现指标卡片、模型占比与调用流水。  
**技术栈：** TypeScript, Node.js (HTTP / SSE / WebSocket), Vitest, HTML/CSS (Design Tokens, Tabular-Nums)

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
| T01 | 扩展 AI 计费规则与成本计算器 (ASR 定价与统一计算) | 串行 | - | 无 | 已完成 | Antigravity | 2026-11-04 16:05 | 2026-11-04 16:07 | 无 | `gateway/test/costCalculator.test.ts` (4 passed) |
| T02 | 实现 AI 用量脱敏存储与聚合统计服务 (AiUsageStore) | 串行 | - | T01 | 已完成 | Antigravity | 2026-11-04 16:07 | 2026-11-04 16:08 | 无 | `gateway/test/aiUsageStore.test.ts` (4 passed) |
| T03 | 网关全链路自动捕获用量 (Chat/Insights/Summary/ASR) 与暴露查询接口 | 串行 | - | T02 | 已完成 | Antigravity | 2026-11-04 16:08 | 2026-11-04 16:09 | 无 | `gateway/test/gateway-usage-tracking.test.ts` (2 passed) |
| T04 | 控制面 Server 对接 AI 成本统计接口与 OpsService 聚合 | 串行 | - | T03 | 已完成 | Antigravity | 2026-11-04 16:09 | 2026-11-04 16:11 | 无 | `server/test/admin-ai-cost.test.ts` (3 passed) |
| T05 | Web 运营后台界面新增「AI 用量与成本大盘」Tab 与数据看板 | 串行 | - | T04 | 已完成 | Antigravity | 2026-11-04 16:11 | 2026-11-04 16:13 | 无 | `server/test/admin-ai-cost-ui.test.ts` (3 passed) |
| T06 | 全链路端到端集成验证与 5 大工程门禁验证 | 串行 | - | T05 | 已完成 | Antigravity | 2026-11-04 16:13 | 2026-11-04 16:15 | 无 | `bash scripts/verify-gates.sh` (ALL GATES PASSED) |

**状态定义：** 待开始 / 进行中 / 阻塞 / 已完成 / 已取消  
**更新规则：** 任务状态每次变化都必须同步更新本表和“执行记录”。

### 0.3 执行记录

| 时间 | 任务ID | 变更 | 操作人 | 备注 |
|---|---|---|---|---|
| 2026-11-04 16:05 | INIT | 初始化计划 | Antigravity | 创建并确认需求分析与实施计划 |
| 2026-11-04 16:07 | T01 | 完成 T01 | Antigravity | 扩展 ASR 与统一费用计算，TDD 测试全绿 |
| 2026-11-04 16:08 | T02 | 完成 T02 | Antigravity | 实现 AiUsageStore 脱敏存储与聚合统计 |
| 2026-11-04 16:09 | T03 | 完成 T03 | Antigravity | 网关全生命周期自动捕获用量及内部查询接口 |
| 2026-11-04 16:11 | T04 | 完成 T04 | Antigravity | Server 控制面打通 `/v1/ops/ai-usage/stats` 与优雅降级 |
| 2026-11-04 16:13 | T05 | 完成 T05 | Antigravity | 运营后台新增「📊 AI 用量与成本大盘」Tab、指标卡与脱敏流水表 |
| 2026-11-04 16:15 | T06 | 完成 T06 | Antigravity | 门禁 5/5 全绿通过，容器服务重启更新完毕 |

---

## 1. 需求分析

### 1.1 需求摘要

**业务背景：**  
听序已实现本地会议录音、实时语音识别（DashScope）、实时洞察生成、会中提问和会后纪要（DeepSeek/通义千问）。但在商业控制面管理后台（`http://localhost:3200/`）中，此前仅有用户微信充值收入与用户会议时长额度，缺乏对底层 AI API 实际调用成本的监控，导致管理员无法获知平台真实的 AI 成本支出与单笔调用毛利。

**核心目标：**  
1. 精确计算每笔 LLM 调用（Prompt/Completion Token）与 ASR 语音识别（音频流时长秒数）的人民币费用；
2. AI Gateway 自动记录脱敏的用量日志并安全持久化；
3. 控制面后台 `http://localhost:3200/` 呈现「AI 用量与成本大盘」，包括总支出、今日支出、Token 消耗、各模型/场景费用占比以及可扫视的脱敏明细流水；
4. 严格恪守 Zero-Content 隐私红线，绝不记录或持久化任何会议正文、提问、答案或音频片段。

**范围内（In Scope）：**  
- [x] 扩展 `gateway/src/billing/costCalculator.ts` 支持 ASR（DashScope 实时语音）计费规则；
- [x] 创建 `gateway/src/billing/aiUsageStore.ts` 支持脱敏用量流水落盘与指标聚合；
- [x] 在 `gateway/src/server.ts` 问答、实时整理、会议纪要与 ASR WebSocket 完整生命周期中自动结算记录；
- [x] 在网关提供 `/internal/billing/ai-usage` 查询接口；
- [x] 在控制面 `server/src/server.ts` 提供 `/v1/ops/ai-usage/stats` 接口（受 Admin 密码保护）；
- [x] 在控制面 `server/src/admin.html.ts` 增加看板页面与数据交互。

**范围外（Out of Scope）：**  
- [ ] 外部大模型服务商账户的自动充值扣款（仍由管理员在各大厂商后台进行充值）；
- [ ] 跨多租户企业级账单报表导出（当前仅针对单机/私有部署控制面）。

### 1.2 用户路径与核心交互

| 步骤 | 角色 | 操作 | 系统响应 | 验证点 |
|---|---|---|---|---|
| 1 | 系统所有者 (Owner) | 访问 `http://localhost:3200/` 输入超级密码登录 | 进入控制面后台，顶部导航展示「📊 AI 用量与成本大盘」标签 | 导航高亮与标签存在 |
| 2 | 系统所有者 (Owner) | 点击「📊 AI 用量与成本大盘」标签 | 切换至成本看板，展示统计卡片（累计费用、今日费用、Token总数、ASR时长）、模型分布与脱敏调用流水 | 数值使用 tabular-nums，展示格式如 ￥0.0421 |
| 3 | 系统/用户 | 客户端发起会中提问、实时整理或会议总结 | AI Gateway 结算并落盘脱敏用量 | 费用增加，审计日志不含任何会议正文 |
| 4 | 系统所有者 (Owner) | 点击「刷新数据」按钮 | 获取最新统计与最新流水行 | 数据实时无感知更新 |

### 1.3 验收标准（AC）

| AC-ID | 可测试条目 | 验证方式（自动/手动） | 对应测试 | 状态 |
|---|---|---|---|---|
| AC-01 | ASR 与 LLM 成本计算正确（DeepSeek、Qwen、DashScope ASR） | 自动 | `gateway/test/costCalculator.test.ts` | 已验证 |
| AC-02 | AiUsageStore 正确汇总今日/总花费、各模型费用占比及脱敏流水持久化 | 自动 | `gateway/test/aiUsageStore.test.ts` | 已验证 |
| AC-03 | 网关各 AI 接口（chat/insights/summary/asr）调用后均生成脱敏记录并落盘 | 自动 | `gateway/test/gateway-usage-tracking.test.ts` | 已验证 |
| AC-04 | 控制面 Server 接口 `/v1/ops/ai-usage/stats` 正常聚合数据并支持鉴权 | 自动 | `server/test/admin-ai-cost.test.ts` | 已验证 |
| AC-05 | Web 后台页面包含完整的 AI 成本看板元素及唯一 `data-testid` | 自动 | `server/test/admin-ai-cost-ui.test.ts` | 已验证 |
| AC-06 | 绝无会议正文泄露（Zero-Content 验证） | 自动 | `gateway/test/gateway-usage-tracking.test.ts` | 已验证 |

### 1.4 影响分析与约束

- **零内容策略（Zero-Content Policy）**：用量结构仅保存统计元数据（token、耗时、模型、费用），绝对不允许出现任何用户文本；
- **QA 元素标识规范**：所有可见元素与交互控件标注语义化 `data-testid`（如 `data-testid="admin-tab-btn-ai-cost"`, `data-testid="admin-ai-cost-stat-card-total-cost"`）；
- **设计风格一致性**：严格使用现有深色主题 CSS 变量（`--bg`, `--card`, `--card-border`, `--brand`）以及 `tabular-nums`。

---

## 2. 实施计划

### T01 扩展 AI 计费规则与成本计算器
- 状态：已完成
- 完成证据：`gateway/test/costCalculator.test.ts` 全部通过

### T02 实现 AI 用量脱敏存储与聚合统计服务 (AiUsageStore)
- 状态：已完成
- 完成证据：`gateway/test/aiUsageStore.test.ts` 全部通过

### T03 网关全链路自动捕获用量与暴露内部查询接口
- 状态：已完成
- 完成证据：`gateway/test/gateway-usage-tracking.test.ts` 全部通过

### T04 控制面 Server 对接 AI 成本统计接口与 OpsService 聚合
- 状态：已完成
- 完成证据：`server/test/admin-ai-cost.test.ts` 全部通过

### T05 Web 运营后台界面新增「AI 用量与成本大盘」Tab 与数据看板
- 状态：已完成
- 完成证据：`server/test/admin-ai-cost-ui.test.ts` 全部通过

### T06 全链路端到端集成验证与 5 大工程门禁验证
- 状态：已完成
- 完成证据：`bash scripts/verify-gates.sh` 全部通过，Docker 容器重构更新上线。
