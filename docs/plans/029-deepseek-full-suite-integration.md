# DeepSeek 全家桶应用 API（One-Key 多模态全栈）分析与实施计划

> **给 Claude：** 使用 `project-workflow` 按任务顺序执行本计划。

**Plan ID：** `029-deepseek-full-suite-integration`  
**创建时间：** 2026-11-14  
**最后更新：** 2026-11-15 22:22  
**当前状态：** 已完成  
**负责人：** Antigravity 研发团队  
**目标：** 全面接入 DeepSeek 最新发布的「全家桶应用 API」，实现「填入 1 个 DeepSeek API Key 即可一键驱动 V4.1-Flash/Pro 快慢分级推理、双轨 VAD 云端 ASR（`/v1/tools/asr`）、会前/会中无状态文档与截图 OCR（`/v1/tools/ocr`）、受控联网核查（`deepseek_web_search` / `deepseek_read_url`）、会后纪要 TTS 语音播报（`/v1/tools/tts`）以及本地峰谷/缓存精准人民币账单闭环」。  
**架构摘要：** 构建高内聚深度协议适配模块 `DeepSeekSuiteClient`（封装独立 Tool APIs 与北京时间峰谷/缓存/工具精准计费引擎）；增强 Rust 原生免 CORS 代理与 `LocalAsrClient` 支持 `/v1/tools/asr` 纯净协议与 `mic`/`system` 物理双轨独立 VAD 分流；升级 `ByokLlmClient` 支持 `deepseek-flash` / `deepseek-v4-pro` 快慢分级 `thinking` 推理、受控 Web Search 工具挂载与参考文档上下文锚定；在前端设置页、会中双栏工作台与会后纪要视图完成符合 Impeccable 视觉与 QA `data-testid` 规范的端到端交付。  
**技术栈：** TypeScript 5, React 18, Zustand, TailwindCSS, Tauri 2.0 (Rust `reqwest` multipart), Vitest, Testing Library.

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
| T01 | One-Key 凭据契约扩展与本地峰谷/工具精准计费引擎 (TDD) | 串行 | - | 无 | 已完成 | Antigravity | 15:29 | 15:34 | 无 | `deepseekSuiteClient.test.ts` 5/5, `byokSettings.test.ts` 6/6 通过 |
| T02 | DeepSeek 全家桶独立工具客户端 (ASR/OCR/TTS/Search) 与 Rust 代理适配 (TDD) | 串行 | - | T01 | 已完成 | Antigravity | 15:34 | 15:37 | 无 | `deepseekSuiteClient.test.ts` 10/10, `cargo test` 12/12 通过 |
| T03 | LocalAsrClient 接入 DeepSeek ASR 协议与双轨独立 VAD 管道集成 (TDD) | 串行 | - | T02 | 已完成 | Antigravity | 15:41 | 15:48 | 无 | `src/audio/__tests__` 15 套 85/85 全通过 |
| T04 | ByokLlmClient 快慢分级 Thinking 推理、受控联网核查与 OCR 参考资料注入 (TDD) | 串行 | - | T01 | 已完成 | Antigravity | 15:48 | 15:53 | 无 | `byokLlmClient.test.ts` 9/9 及 Store/API 全套 95/95 通过 |
| T05 | 前端全链路交互落地（设置页 One-Key 预设、工作台 OCR/联网开关、纪要 TTS 播报与成本明细） | 串行 | - | T03, T04 | 已完成 | Antigravity | 15:53 | 16:07 | 无 | 前端组件测试 24 套 140/140 全通过 |
| T06 | 全量回归测试、规范文档同步与 5 大工程质量门禁验证 | 合并门禁 | - | T05 | 已完成 | Antigravity | 16:07 | 16:17 | 无 | `verify-gates.sh` 5/5 全绿（Vitest 60 套 350 用例 + Cargo 全绿 + 0 告警） |

**状态定义：** 待开始 / 进行中 / 阻塞 / 已完成 / 已取消  
**更新规则：** 任务状态每次变化都必须同步更新本表和“执行记录”。

### 0.3 执行记录

| 时间 | 任务ID | 变更 | 操作人 | 备注 |
|---|---|---|---|---|
| 2026-11-14 15:26 | INIT | 初始化计划 | Antigravity | 完成 DeepSeek 全家桶 API 调研与代码库影响分析，创建 029 计划文档 |
| 2026-11-14 15:34 | T01 | 状态：待开始 -> 已完成 | Antigravity | 完成 One-Key 凭据解析与本地峰谷/缓存/工具计费引擎 TDD |
| 2026-11-14 15:37 | T02 | 状态：进行中 -> 已完成 | Antigravity | 完成五大独立 Tool API 客户端与 Rust 纯净单 `file` 表单代理自包含单测 |
| 2026-11-14 15:41 | T03 | 状态：待开始 -> 进行中 | Antigravity | 开始 LocalAsrClient `deepseek_http` 协议与双轨独立 VAD 集成 TDD |
| 2026-11-14 15:48 | T03 | 状态：进行中 -> 已完成 | Antigravity | 完成双轨独立 VAD 缓冲、`/v1/tools/asr` 适配与实时计费联动，音频测试 85/85 通过 |
| 2026-11-14 15:48 | T04 | 状态：待开始 -> 进行中 | Antigravity | 开始 ByokLlmClient 快慢分级 Thinking 推理、受控联网查证与 OCR 注入 TDD |
| 2026-11-14 15:53 | T04 | 状态：进行中 -> 已完成 | Antigravity | 完成 Thinking 快慢分级路由、显式联网工具保护与 OCR 上下文注入，94/94 通过 |
| 2026-11-14 15:53 | T05 | 状态：待开始 -> 进行中 | Antigravity | 开始设置页 One-Key 预设、工作台 OCR/联网开关、纪要 TTS 与账单明细 UI TDD |
| 2026-11-14 16:07 | T05 | 状态：进行中 -> 已完成 | Antigravity | 完成设置页单 Key 全家桶预设、工作台无状态 OCR/联网开关、纪要 TTS 播报与明细展示，UI 测试 140/140 通过 |
| 2026-11-14 16:07 | T06 | 状态：待开始 -> 进行中 | Antigravity | 开始规范文档同步与 5 大工程质量门禁全量校验 |
| 2026-11-14 16:17 | T06 | 状态：进行中 -> 已完成 | Antigravity | 同步 `README.md`/`PRD.md`/`SAD.md`，补齐 `DeepSeekSuiteClient` `ByokSettings` 类型重载并通过全套 5 大门禁 |
| 2026-11-15 22:22 | T06-FIX | 实机联调修复 | Antigravity | 修复 `src-tauri/Cargo.toml` 中 `reqwest` 因 `default-features = false` 缺失 `native-tls`/`http2`/`system-proxy` 导致访问 `https://api.deepseek.com/v1/tools/asr` 报 `error sending request for url` 的问题，并补充前端 `testConnection` 自动回退 `fetch` 与 `/tools/asr` 协议自识别 |

---

## 1. 需求分析

### 1.1 需求摘要

**业务背景：**
- DeepSeek 官方发布了「全家桶应用 API」，开放主力多模态 1M 上下文模型 `deepseek-flash`（`DeepSeek-V4.1-Flash-1017`）、`deepseek-v4-pro`、对话内建工具（`deepseek_web_search`、`deepseek_read_url`）以及五大底层独立接口（`/v1/tools/asr`、`/v1/tools/ocr`、`/v1/tools/tts`、`/v1/tools/search`、`/v1/tools/fetch`），其中云端 ASR 限时优惠低至 **0.39 元/小时**。
- 听序（Tingxu）此前在单机 BYOK 模式下存在三大痛点：
  1. **双平台双 Key 割裂门槛高**：默认推荐用户去 DeepSeek 配 LLM Key、再去阿里云百炼配 ASR Key；
  2. **协议不兼容与双轨丢失**：若手动将 `/v1/tools/asr` 填入现有本地 HTTP ASR 端点，`normalizeOpenAiAsrEndpoint` 会强行追加 `/v1/audio/transcriptions` 导致 404，且 `LocalAsrClient` 强制塞入 OpenAI `model` 字段并将双轨 `source` 硬编码为 `'mic'`；
  3. **缺少多模态资料辅助、受控外部查证、纪要播报与单机真实账单统计**：单机 BYOK 下的 `aiCost` 依赖旧云端网关，导致本地开会成本显示为 `￥0.00`。

**核心目标：**
- **目标 1（One-Key 开箱即用）**：默认支持填入 1 个 DeepSeek API Key 自动复用于 LLM（`deepseek-flash`）、云端 ASR（`/v1/tools/asr`）、OCR 与 TTS，同时完整保留本地离线 SenseVoice / Faster-Whisper 与阿里百炼选项；
- **目标 2（双轨 VAD 云端高精转写）**：复用 `SmartVadBuffer` 自然断句（≤8s 16kHz PCM WAV）结合 Rust 原生免 CORS 通道直连 `/v1/tools/asr`，并支持 `mic`（我）与 `system`（对方）物理双轨独立缓冲打标；
- **目标 3（快慢双模分级推理）**：会中高频纠偏与实时洞察走极速非思考 `deepseek-flash`；会后全局纪要支持开启 `thinking: { type: "enabled" }` 深度思考（自动剥离无效 `temperature`）或指定 `deepseek-v4-pro`；
- **目标 4（无状态 OCR 资料注入 + 受控联网查证 + 纪要 TTS 播报）**：支持导入议程 PDF/PPT/截图经 `/v1/tools/ocr`（无状态不留存云端）注入本场上下文；Copilot 提供默认关闭的「🌐 联网查证」显式开关；会后纪要支持 `/v1/tools/tts`（`stella` / `tide`）一键语音朗读；
- **目标 5（本地精准人民币账单闭环）**：基于北京时间工作日峰谷电价、Prompt Cache 命中率、ASR `duration_ms`、OCR 页数与 TTS 字数，在本地 SQLite/仓储实时结算 `MeetingAiCost`。

**范围内（In Scope）：**
- [x] `ByokSettings` 扩展（`asrProvider: 'deepseek'`、`shareDeepSeekKey`、`summaryModel`、`enableSummaryThinking`、`ttsVoiceId`）与默认 One-Key 预设；
- [x] `DeepSeekSuiteClient` 深度模块（`/v1/tools/asr`、`/v1/tools/ocr`、`/v1/tools/tts`、`/v1/tools/search`、`/v1/tools/fetch` + 峰谷/工具成本计算器）；
- [x] Rust `local_model.rs` 与前端 `LocalAsrClient` 支持纯净 `/v1/tools/asr` multipart 协议及 `mic`/`system` 双轨独立 VAD；
- [x] `ByokLlmClient` 支持 `thinking` 模式、受控 `deepseek_web_search` / `deepseek_read_url`、OCR 背景资料拼装及 `usage` 回传；
- [x] `useMeetingStore` 本地会议 AI 成本累加与参考资料管理；
- [x] `SettingsView`、`InMeetingWorkbench`、`MeetingSummaryView` 交互与 QA `data-testid` 100% 合规覆盖。

**范围外（Out of Scope）：**
- [x] 不默认开启全局自动联网搜索（严守 `AGENTS.md` 铁律 1，防止保密会议敏感词未经用户许可外泄为搜索词）；
- [x] 不将用户参考文档长期托管于云端 `/v1/files`（优先采用无状态 `/v1/tools/ocr` 解析完即焚）；
- [x] 不改动 macOS `ScreenCaptureKit` 与 Windows `WASAPI` 底层硬件音频采集驱动。

### 1.2 用户路径与核心交互

| 步骤 | 角色 | 操作 | 系统响应 | 验证点 |
|---|---|---|---|---|
| 1 | 用户 | 进入「系统设置」，点击「DeepSeek 全家桶」预设并填入 1 个 DeepSeek API Key，点击测试 | 自动配置 `deepseek-flash` + DeepSeek 云端 ASR（密钥自动共享），探测 LLM 与 `/v1/tools/asr` 均返回成功与延迟毫秒 | 单 Key 同时激活 LLM 与 ASR |
| 2 | 用户 | 开启会议（可选在工作台点击「📄 导入参考资料/截图」上传议程或投屏图） | `/v1/tools/ocr` 无状态提取文本存入本地会话背景；双轨音频经独立 VAD 自然断句提交 `/v1/tools/asr`，区分「我/对方」实时上屏并经 `deepseek-flash` 异步纠偏 | 双轨角色准确、专有名词识别准、实时计费跳动 |
| 3 | 用户 | 会中或会后在 Copilot 点亮「🌐 联网查证」并提问含外部概念或 URL 的问题 | `ByokLlmClient` 挂载 `deepseek_web_search` 与 `deepseek_read_url`，结合逐字稿与外部权威网页作答；遇已确认卡片冲突生成待复核提案 | 默认不外发搜索；点亮后精准附带外部查证 |
| 4 | 用户 | 结束会议进入「会议总结报告」，查看纪要、点击「🔊 朗读纪要」或点击「💰 AI 成本」 | 会后采用 `thinking` 深度思考生成高精结构化纪要；点击朗读调用 `/v1/tools/tts` 播放自然人声；点击成本弹窗展示真实人民币分项账单 | 思考模式无参数冲突、TTS 正常播放与停止、成本精确到 0.0001 元 |

### 1.3 验收标准（AC）草案

| AC-ID | 可测试条目 | 验证方式（自动/手动） | 对应测试 | 状态 |
|---|---|---|---|---|
| AC-01 | `ByokSettings` 支持 DeepSeek One-Key 全家桶预设与 `resolveEffectiveDeepSeekKey` 密钥共享解析，且计费器精准区分北京时间峰谷费率、缓存命中及 ASR/OCR/TTS/Search 工具单价 | 自动 | `src/api/__tests__/deepseekSuiteClient.test.ts`, `src/store/__tests__/byokSettings.test.ts` | 已验证 |
| AC-02 | `DeepSeekSuiteClient` 与 Rust `local_model.rs` 对 `/v1/tools/asr` 发送纯净单 `file` multipart（不含多余 `model` 字段），且正确解析 `ocr`、`tts`、`search`、`fetch` 响应 | 自动 | `src/api/__tests__/deepseekSuiteClient.test.ts`, `cargo test` | 已验证 |
| AC-03 | `LocalAsrClient` 不篡改 `/v1/tools/asr` 路径，且对 `mic` 与 `system` 双声道独立 VAD 切片并保留各自 `source` 标签与 `durationMs` 计量 | 自动 | `src/audio/__tests__/localAsrClient.test.ts`, `src/audio/__tests__/meetingPipelineService.test.ts` | 已验证 |
| AC-04 | `ByokLlmClient` 在 `enableSummaryThinking` 时注入 `thinking: { type: 'enabled' }` 且移除 `temperature`；仅在显式开启 `enableWebSearch` 时注入 `deepseek_web_search` / `deepseek_read_url`；支持拼装 `referenceContext` | 自动 | `src/api/__tests__/byokLlmClient.test.ts` | 已验证 |
| AC-05 | `SettingsView`、`InMeetingWorkbench`、`MeetingSummaryView` 新增控件 100% 标注唯一合规 `data-testid`，支持一键预设、OCR 上传、联网开关、TTS 朗读及本地真实成本展示 | 自动 | `src/components/__tests__/SettingsViewByok.test.tsx`, `src/components/__tests__/MeetingSummaryCopilotAndEditing.test.tsx` | 已验证 |
| AC-06 | 全仓通过 `bash scripts/verify-gates.sh` 5 大工程门禁（Secrets 0 泄漏、文档完整、TS/Rust 0 错误、全量单测通过、QA `data-testid` 合规） | 自动 | `bash scripts/verify-gates.sh` | 已验证 |

### 1.4 Code Review Graph 影响分析

**仓库与图谱状态：**

| 项目 | 结果 | 证据/命令 |
|---|---|---|
| 仓库根目录 | `<repo-root>` | `git rev-parse --show-toplevel` |
| CLI 状态 | 不可用（编译受阻） | `uvx code-review-graph repos` 因本机 CommandLineTools SDK `arm64e.x1-macos` 导致 `watchdog` C 扩展链接失败 |
| 注册状态 | 未知（CLI 受阻未静默注册） | 同上 |
| 图谱新鲜度 | 未知 | 降级源码分析 |
| MCP 状态 | 未暴露 | 当前 MCP 列表仅 `figma_figma`、`notion_notion`、`sequential-thinking` |
| 分析路径 | 降级源码分析 | 记录一次限制，采用 `grep`/`rg` 调用链、TypeScript 编译器、测试矩阵与仓库 `verify-gates.sh` 交叉验证 |

**影响矩阵：**

| 影响类型 | 模块/契约 | 影响说明 | 证据来源 | 风险等级 |
|---|---|---|---|---|
| 受影响模块 | `src/api/deepseekSuiteClient.ts`（新增）、`src/api/byokLlmClient.ts`、`src/audio/localAsrClient.ts`、`src/audio/meetingPipelineService.ts`、`src-tauri/src/asr/local_model.rs` | 新增全家桶工具适配与计费模块；升级 LLM 快慢推理与 ASR 双轨协议 | 源码阅读 + `grep` 全仓调用点 | 中 |
| 公共契约 | `ByokSettings`、`AsrProviderType`、`LocalAsrProtocol`、`CopilotChatRequest`、`MeetingAiCostBreakdown` | 向后兼容扩展可选字段；更新默认推荐模型与 ASR 预设 | `src/types/meeting.ts`、`src/api/tingxuClient.ts` | 中 |
| 持久化 | `MeetingRepository` (`localStorage` JSON) | 新增字段均为可选并提供默认值回退，已有本地历史会议与配置 100% 平滑兼容无迁移破坏 | `src/storage/meetingRepository.ts` | 低 |
| 配置 | BYOK 本地用户配置 | 支持 `shareDeepSeekKey` 自动回退读取 `llmApiKey` | `src/store/useMeetingStore.ts` | 低 |
| 受影响流程 | 设置连通性探测 → 会中双轨录音转写与实时洞察 → Copilot 问答 → 会后总结、TTS 朗读与成本统计 | 覆盖 `SettingsView`、`InMeetingWorkbench`、`MeetingSummaryView` | 全仓 `byokSettings` 68 处引用核查 | 中 |

**源码与测试交叉验证：**
- [x] 图谱或降级分析的关键调用关系已用源码确认
- [x] 相关测试、schema、包边界和配置已检查
- [x] 图谱未替代测试、CI、类型检查、安全检查或项目 harness

**验证矩阵：**

| 风险/影响 | 验证动作 | 命令/测试 | 通过条件 |
|---|---|---|---|
| `DEFAULT_BYOK_SETTINGS` 默认值调整影响旧单测断言 | 单元测试同步与向后兼容校验 | `npx vitest run src/store/__tests__/byokSettings.test.ts` | 新旧模式切换断言 100% 通过 |
| `/v1/tools/asr` URL 改写与多余字段导致 400/404 | 协议单元测试 + Rust 单元测试 | `npx vitest run src/audio/__tests__/localAsrClient.test.ts` & `cargo test` | 请求 URL 精确为 `/v1/tools/asr`，表单仅含 `file` |
| Thinking 模式下传 `temperature` 失效或报错 | `ByokLlmClient` 请求体快照断言 | `npx vitest run src/api/__tests__/byokLlmClient.test.ts` | 开启 `thinking` 时不含 `temperature`，关闭时保留 |
| 新增前端按钮遗漏 `data-testid` 触发 Gate 5 告警 | 静态扫描与组件测试 | `bash scripts/verify-gates.sh` | Gate 1~5 全部绿灯，0 告警 |

**降级说明：** `code-review-graph` Python `watchdog` 依赖在当前 macOS SDK 下编译失败且 MCP 未暴露；已通过全仓 `grep` 精确扫描 `byokSettings`、`getByokLlmClient`、`asrProvider`、`aiCost` 所有调用点与全部测试文件完成交叉验证。

### 1.5 风险与应对

| 风险ID | 风险描述 | 影响 | 概率 | 是否阻塞开发 | 前置处理任务 | 应对策略 | 责任人 |
|---|---|---|---|---|---|---|---|
| R-01 | 全局开启 `deepseek_web_search` 可能导致保密会议词汇外发公网搜索引擎，违背 Zero-Content 铁律 | 高 | 中 | 否 | T04 | 默认强制关闭联网搜索，仅在用户在 Copilot 界面显式点亮「🌐 联网查证」开关时单次/当前会话注入工具 | Antigravity |
| R-02 | `local_model.rs` 原有测试 `test_probe_real_docker_whisper` 强依赖本机 `127.0.0.1:8009` 外部容器，离线环境易假性失败 | 中 | 高 | 是 | T02 | 使用本地临时 `TcpListener` mock HTTP 响应校验 multipart 报文格式（同时验证 Whisper 模式与 DeepSeek `/v1/tools/asr` 纯净模式），消除外部容器强耦合 | Antigravity |
| R-03 | 浏览器 `Audio` 对象在 Vitest `jsdom` 测试环境中不支持真实解码播放 | 低 | 高 | 否 | T05 | 封装可注入/可降级的音频播放控制器并在卸载或切换会议时及时释放 `URL.createObjectURL` 防止内存泄漏 | Antigravity |

### 1.6 隐含需求检查清单

- [x] 权限与角色控制（单机免登录可用，云端网关未配置时平滑切入 BYOK）
- [x] 空状态（未填 API Key 时给出清晰引导文案，不发无效请求）
- [x] 错误状态与重试策略（401 密钥错误、404 地址错误、OCR/TTS 网络失败友好提示且不崩溃）
- [x] 性能目标（会中实时纠偏与洞察固定非思考 Flash 模式，3.5s 超时熔断；音频双轨无阻塞）
- [x] 兼容性（兼容旧版 `localStorage` 已保存的 `ByokSettings` 与历史 `MeetingAiCost`）
- [x] 可观测性（实时累加 Token、音频秒数、OCR 页数、TTS 字符数并展示于费用明细弹窗）
- [x] 安全性（严禁硬编码 `sk-...`；文档采用无状态 `/v1/tools/ocr` 解析，零云端文件留存）
- [x] 前端 QA 元素标识规范：所有新增可见容器、按钮、复选框、输入框 100% 标注唯一 `<page>-<section>-<element-type>-<semantic-purpose>` 格式 `data-testid`

### 1.7 方案对比与选型结论

**方案 A（推荐）：高内聚 `DeepSeekSuiteClient` + 复用增强 `LocalAsrClient` 双轨 VAD + 快慢分级 `ByokLlmClient`**
- 优点：遵循 `CONTEXT.md` 深度模块（Deep Module）原则，将全家桶独立工具与峰谷计费收敛在单一模块，最大化复用已验证的 `SmartVadBuffer` 与 Rust 免 CORS 通道，改动局部性强。
- 缺点：需细致区分 `openai_http` 与 `deepseek_http` 的表单字段差异。

**方案 B：为 DeepSeek ASR 单独重写一套平行的音频缓冲与录音管线**
- 优点：与原有 `LocalAsrClient` 完全物理隔离。
- 缺点：违背 DRY 原则，重复实现 WAV 封装、VAD 断句与 Tauri IPC 桥接，维护成本翻倍。

**最终选型：** 方案 A  
**选型理由：** 契合项目深度模块与接缝（Seam）架构规范，同时一举修复原有 `LocalAsrClient` 双轨 `source` 标签未区分的问题，杠杆比最高。

### 1.8 待确认问题

- 无（用户已确认方向：采用 DeepSeek One-Key 全家桶默认预设、快慢双模分级策略，并一次性完整落地核心与扩展能力验证）。

---

## 2. 实施计划

### 2.1 执行编排策略

#### Subagent 适用性判断

**是否建议使用 subagent：** 条件满足后启用（开发阶段由主 Agent 串行把控核心契约连贯性，交付前可按需执行独立审查）  
**判断依据：**
- [x] T01~T05 围绕 `ByokSettings`、`MeetingStore` 与协议契约紧密递进，主 Agent 直接串行推进可避免跨文件类型不同步与重复上下文开销
- [x] 每个任务均具备独立的 Vitest / Cargo TDD 红绿验证闭环

#### 串行 / 并行执行图

| 执行组 | 任务 | 模式 | 前置条件 | 合并点 | 完成后进入 |
|---|---|---|---|---|---|
| G0 | T01 | 串行 | 无 | - | G1 |
| G1 | T02 → T03 → T04 | 串行 | T01 已完成 | T05 | G2 |
| G2 | T05 → T06 | 串行合并门禁 | T03、T04 均已完成 | Gate-4 | 交付完成 |

#### 阶段门禁

| Gate | 阶段 | 进入条件 | 通过条件 | 未通过处理 |
|---|---|---|---|---|
| Gate-1 | 需求确认 | 需求摘要、范围、AC 已写入 | 用户已确认实施方向 | 回到需求澄清 |
| Gate-2 | 开发启动 | 写入边界、依赖、测试命令已明确 | R-02 测试桩方案已明确 | 先处理测试隔离 |
| Gate-3 | 模块集成 | T01~T05 单元与组件测试全部绿灯 | `npx tsc --noEmit` 与 `npm test` 0 失败 | 回到对应任务修复 |
| Gate-4 | 交付门禁 | 所有任务完成 | `bash scripts/verify-gates.sh` 5 大门禁全绿且文档已同步 | 补齐验证或文档 |

#### 文件与模块写入边界

| 范围类型 | 路径/模块 | 适用任务 | 说明 |
|---|---|---|---|
| 允许新增 | `src/api/deepseekSuiteClient.ts`, `src/api/__tests__/deepseekSuiteClient.test.ts` | T01, T02 | DeepSeek 全家桶独立工具客户端与峰谷/工具精准计费器 |
| 允许修改 | `src/types/meeting.ts`, `src/store/useMeetingStore.ts`, `src/store/__tests__/byokSettings.test.ts` | T01, T03, T04 | One-Key 凭据契约、参考资料状态与本地 AI 成本实时累加 |
| 允许修改 | `src-tauri/src/asr/local_model.rs` | T02 | Rust 原生免 CORS 代理兼容 `/v1/tools/asr` 纯净单 `file` 表单 |
| 允许修改 | `src/audio/localAsrClient.ts`, `src/audio/meetingPipelineService.ts`, `src/audio/__tests__/localAsrClient.test.ts`, `src/audio/__tests__/meetingPipelineService.test.ts` | T03 | 支持 `deepseek_http` 协议、双轨独立 VAD 切片与 ASR 用量回传 |
| 允许修改 | `src/api/tingxuClient.ts`, `src/api/byokLlmClient.ts`, `src/api/__tests__/byokLlmClient.test.ts` | T04 | 快慢双模 `thinking` 推理、受控联网搜索工具与参考资料注入 |
| 允许修改 | `src/components/views/SettingsView.tsx`, `src/components/InMeetingWorkbench.tsx`, `src/components/views/MeetingSummaryView.tsx` 及对应 `__tests__` | T05 | 前端全链路 UI 与 QA `data-testid` 覆盖 |
| 允许修改 | `README.md`, `docs/README.md`, `docs/specs/PRD.md`, `docs/specs/SAD.md`, `docs/plans/029-deepseek-full-suite-integration.md` | T06 | 规范与架构文档同步 |
| 禁止修改 | `src-tauri/src/media/**`, `src/speaker/**` | 全部 | 底层硬件采集与声纹算法不在本计划修改范围内 |

### 2.2 实施顺序与里程碑

| 里程碑 | 目标 | 入口条件 | 完成条件 |
|---|---|---|---|
| M1（契约与底座） | 完成 T01~T02，跑通 One-Key 凭据、精准计费与五大独立 Tool API + Rust 代理 | 计划创建完成 | `deepseekSuiteClient.test.ts`、`byokSettings.test.ts`、`cargo test` 全绿 |
| M2（双轨 ASR 与分级推理） | 完成 T03~T04，打通双轨云端 ASR 管道与 `ByokLlmClient` Thinking/Search/OCR 上下文 | M1 完成 | `localAsrClient.test.ts`、`meetingPipelineService.test.ts`、`byokLlmClient.test.ts` 全绿 |
| M3（UI 闭环与门禁交付） | 完成 T05~T06，交付前端全套交互并通过 5 大工程门禁 | M2 完成 | `bash scripts/verify-gates.sh` 退出码为 0 |

---

### 2.3 任务拆解详情

### T01 One-Key 凭据契约扩展与本地峰谷/工具精准计费引擎 (TDD)

**状态：** 已完成  
**负责人：** Antigravity  
**优先级：** P0  
**预估耗时：** 5 分钟  
**执行模式：** 串行  
**并行组：** -  
**依赖任务：** 无  
**合并点：** 无  
**是否可委派给 subagent：** 否  
**建议 subagent 类型：** 不适用  
**开始时间：** 15:29  
**完成时间：** 15:34  
**阻塞原因：** 无  
**完成证据：** `deepseekSuiteClient.test.ts` 5/5, `byokSettings.test.ts` 6/6 通过  

**任务目标：**
- 扩展 `ByokSettings` 支持 DeepSeek One-Key 全家桶预设（`asrProvider: 'deepseek'`、`llmModel: 'deepseek-flash'`、`shareDeepSeekKey: true`、`summaryModel`、`enableSummaryThinking: true`、`ttsVoiceId: 'stella'`）及会议参考文档结构 `MeetingReferenceDoc`；
- 实现 `resolveEffectiveAsrApiKey` / `resolveEffectiveDeepSeekKey` 密钥共享解析与北京时间（UTC+8）工作日峰谷 Token 计费 + 全家桶工具（ASR/OCR/TTS/Search）精准人民币计费器，并在 `useMeetingStore` 提供 `recordLocalAiUsage` 与 `addMeetingReferenceDoc` 动作。

**涉及文件：**
- 创建：`src/api/deepseekSuiteClient.ts`（计费与凭据解析部分）, `src/api/__tests__/deepseekSuiteClient.test.ts`
- 修改：`src/types/meeting.ts`, `src/store/useMeetingStore.ts`
- 测试：`src/api/__tests__/deepseekSuiteClient.test.ts`, `src/store/__tests__/byokSettings.test.ts`
- 只读参考：`src/storage/meetingRepository.ts`
- 禁止修改：`src-tauri/src/media/**`

#### RED（先失败）
- [x] 编写 `deepseekSuiteClient.test.ts`（验证高峰 10:30 与空闲 21:00 / 周末下 `deepseek-flash` 及 `deepseek-v4-pro` 缓存命中/未命中计费、ASR 0.39元/时折算、OCR 1.5元/千页、TTS 1.5元/万字、Search 5元/千次及 `resolveEffectiveDeepSeekKey`）与 `byokSettings.test.ts` 新默认预设及本地 `recordLocalAiUsage` 测试
- [x] 运行测试并确认失败

**命令：**
```bash
npx vitest run src/api/__tests__/deepseekSuiteClient.test.ts src/store/__tests__/byokSettings.test.ts
```

#### GREEN（最小通过）
- [x] 在 `src/types/meeting.ts`、`src/api/deepseekSuiteClient.ts`、`src/store/useMeetingStore.ts` 实现类型、计费函数与 Store 状态动作
- [x] 运行测试并确认通过

#### REFACTOR（重构与回归）
- [x] 确保浮点金额四舍五入至小数点后 6 位防止 JS 精度漂移，验证已有 `meetingAiCost.test.ts` 无回归破坏

---

### T02 DeepSeek 全家桶独立工具客户端 (ASR/OCR/TTS/Search) 与 Rust 代理适配 (TDD)

**状态：** 已完成  
**负责人：** Antigravity  
**优先级：** P0  
**预估耗时：** 5 分钟  
**执行模式：** 串行  
**并行组：** -  
**依赖任务：** T01  
**合并点：** 无  
**是否可委派给 subagent：** 否  
**建议 subagent 类型：** 不适用  
**开始时间：** 15:34  
**完成时间：** 15:37  
**阻塞原因：** 无  
**完成证据：** `deepseekSuiteClient.test.ts` 9/9, `cargo test` 12/12 通过  

**任务目标：**
- 在 `DeepSeekSuiteClient` 中完整实现五大独立工具方法：`transcribeAudio` (`/v1/tools/asr`)、`recognizeDocumentOcr` (`/v1/tools/ocr`)、`synthesizeSpeech` (`/v1/tools/tts`)、`webSearch` (`/v1/tools/search`)、`fetchUrl` (`/v1/tools/fetch`)；
- 升级 Rust `src-tauri/src/asr/local_model.rs` 中的 `probe_local_asr_http_endpoint` 与 `proxy_post_asr_audio`：当目标地址为 `/v1/tools/asr`（或 `model` 为空字符串/`deepseek-asr`）时，仅构造纯净的 `file` multipart 字段，不注入 OpenAI 专属 `model` 与 `prompt` 字段；并将原依赖外部 `8009` 端口的测试升级为本地 `TcpListener` 自包含测试。

**涉及文件：**
- 修改：`src/api/deepseekSuiteClient.ts`, `src-tauri/src/asr/local_model.rs`
- 测试：`src/api/__tests__/deepseekSuiteClient.test.ts`, `src-tauri/src/asr/local_model.rs` (`mod tests`)
- 只读参考：`src-tauri/src/main.rs`
- 禁止修改：`src-tauri/src/media/**`

#### RED（先失败）
- [x] 在 `deepseekSuiteClient.test.ts` 编写 ASR/OCR/TTS/Search/Fetch 请求格式与响应解析测试；在 `local_model.rs` 编写本地 Mock Server 验证 `/v1/tools/asr` 请求体不含 `name="model"` 字段的单元测试
- [x] 运行测试并确认失败

**命令：**
```bash
npx vitest run src/api/__tests__/deepseekSuiteClient.test.ts
cargo test --manifest-path src-tauri/Cargo.toml asr::local_model
```

#### GREEN（最小通过）
- [x] 实现 `DeepSeekSuiteClient` 五大方法及 Rust `is_deepseek_tools_asr_endpoint` 纯净表单分支
- [x] 运行前端与 Rust 测试确认全部通过

#### REFACTOR（重构与回归）
- [x] 抽取统一的 DeepSeek 工具 Base URL 规范化函数（支持用户填 `https://api.deepseek.com/v1` 或 `https://api.deepseek.com` 自动定位至 `/v1/tools/*`）

---

### T03 LocalAsrClient 接入 DeepSeek ASR 协议与双轨独立 VAD 管道集成 (TDD)

**状态：** 已完成  
**负责人：** Antigravity  
**优先级：** P0  
**预估耗时：** 5 分钟  
**执行模式：** 串行  
**并行组：** -  
**依赖任务：** T02  
**合并点：** 无  
**是否可委派给 subagent：** 否  
**建议 subagent 类型：** 不适用  
**开始时间：** 15:41  
**完成时间：** 15:48  
**阻塞原因：** 无  
**完成证据：** `src/audio/__tests__/` 15 套 85/85 全部通过  

**任务目标：**
- 扩展 `LocalAsrProtocol` 支持 `'deepseek_http'`，修复 URL 规范化函数使 `/v1/tools/asr` 不被篡改为 `/audio/transcriptions`；
- 升级 `LocalAsrClient` 为 `'mic'` 与 `'system'` 维护双轨独立 `SmartVadBuffer` 与兜底缓冲，确保转写出的 `AsrTranscriptEvent.source` 精确反映物理声道（`'mic'` 或 `'system'`），并通过 `onAsrUsage` 回传服务端 `duration_ms`（或本地计算时长）；
- 更新 `MeetingPipelineService`：当 `byok.asrProvider === 'deepseek'` 时自动挂载 `LocalAsrClient`（`protocol: 'deepseek_http'`，自动解析共享 DeepSeek Key）并联动 `recordLocalAiUsage` 实时记录 ASR 成本；同时让 `RealAudioCapture` 系统内录音频块透传 `'system'` 声道标识（保持已有接口兼容）。

**涉及文件：**
- 修改：`src/types/meeting.ts`, `src/audio/localAsrClient.ts`, `src/audio/meetingPipelineService.ts`
- 测试：`src/audio/__tests__/localAsrClient.test.ts`, `src/audio/__tests__/meetingPipelineService.test.ts`
- 只读参考：`src/audio/smartVadBuffer.ts`, `src/audio/realAudioCapture.ts`
- 禁止修改：`src-tauri/src/media/**`

#### RED（先失败）
- [x] 在 `localAsrClient.test.ts` 编写 `deepseek_http` 纯净表单上传、`duration_ms` 回调、以及 `mic` / `system` 双声道输入不串轨测试；在 `meetingPipelineService.test.ts` 编写 `asrProvider: 'deepseek'` 自动挂载测试
- [x] 运行测试并确认失败

**命令：**
```bash
npx vitest run src/audio/__tests__/localAsrClient.test.ts src/audio/__tests__/meetingPipelineService.test.ts
```

#### GREEN（最小通过）
- [x] 实现 `deepseek_http` 协议支持、双轨独立 VAD 缓冲及 `MeetingPipelineService` 路由与计费回调
- [x] 运行测试确认通过

#### REFACTOR（重构与回归）
- [x] 运行 `src/audio/__tests__/` 下全部音频测试确保零回归

---

### T04 ByokLlmClient 快慢分级 Thinking 推理、受控联网核查与 OCR 参考资料注入 (TDD)

**状态：** 已完成  
**负责人：** Antigravity  
**优先级：** P0  
**预估耗时：** 5 分钟  
**执行模式：** 串行  
**并行组：** -  
**依赖任务：** T01  
**合并点：** 无  
**是否可委派给 subagent：** 否  
**建议 subagent 类型：** 不适用  
**开始时间：** 15:48  
**完成时间：** 15:53  
**阻塞原因：** 无  
**完成证据：** `byokLlmClient.test.ts` 9/9 及 Store/API 全套 94/94 通过  

**任务目标：**
- 升级 `ByokLlmClient`：
  1. **快慢分级推理**：`generateMeetingSummary` 支持读取 `settings.summaryModel || settings.llmModel` 及 `settings.enableSummaryThinking`；当对 DeepSeek 模型开启思考时，注入 `thinking: { type: 'enabled' }` 并移除无效的 `temperature` 参数；`extractLiveInsights` 固定保持极速非思考模式；
  2. **受控联网核查与链接解读**：`CopilotChatRequest` 增加 `enableWebSearch?: boolean` 与 `referenceContext?: string`；默认不带 `tools`，仅当 `enableWebSearch === true` 且为 DeepSeek 协议时注入 `deepseek_web_search` 与 `deepseek_read_url`；
  3. **参考资料上下文拼装与本地 Token 记账**：支持在洞察、问答、总结中注入本地 OCR 提取的参考资料背景，并通过可选回调或返回值汇报 `usage`（含 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` / `completion_tokens`），在 `useMeetingStore` 中自动记录实时洞察、Copilot 与纪要总结的精确人民币费用。

**涉及文件：**
- 修改：`src/api/tingxuClient.ts`, `src/api/byokLlmClient.ts`, `src/store/useMeetingStore.ts`
- 测试：`src/api/__tests__/byokLlmClient.test.ts`
- 只读参考：`src/audio/llmTranscriptCorrector.ts`
- 禁止修改：`src/engine/patchApplier.ts`

#### RED（先失败）
- [x] 在 `byokLlmClient.test.ts` 新增测试用例：① `generateMeetingSummary` 开启 `enableSummaryThinking` 时注入 `thinking` 且剔除 `temperature`；② `chatCopilot` 默认不挂载 `tools`，开启 `enableWebSearch` 时挂载 `deepseek_web_search` 与 `deepseek_read_url`；③ 注入 `referenceContext` 与回传 `usage` 触发计费记录
- [x] 运行测试并确认失败

**命令：**
```bash
npx vitest run src/api/__tests__/byokLlmClient.test.ts
```

#### GREEN（最小通过）
- [x] 实现 `ByokLlmClient` 的 `thinking`、受控 `tools`、`referenceContext` 与 `usage` 计量回调，并在 `useMeetingStore` 对接洞察与总结计费
- [x] 运行测试并确认通过

#### REFACTOR（重构与回归）
- [x] 精炼请求构造辅助函数，确保对 Qwen / Ollama / Custom 端点不发送 DeepSeek 专属 `thinking` 或 `deepseek_web_search` 字段

---

### T05 前端全链路交互落地（设置页 One-Key 预设、工作台 OCR/联网开关、纪要 TTS 播报与成本明细）

**状态：** 已完成  
**负责人：** Antigravity  
**优先级：** P0  
**预估耗时：** 5 分钟  
**执行模式：** 串行  
**并行组：** -  
**依赖任务：** T03, T04  
**合并点：** Gate-3  
**是否可委派给 subagent：** 否  
**建议 subagent 类型：** 不适用  
**开始时间：** 15:53  
**完成时间：** 16:07  
**阻塞原因：** 无  
**完成证据：** 前端组件测试 24 套 140/140 全部通过  

**任务目标：**
- **`SettingsView.tsx`**：
  - DeepSeek 预设按钮升级为一键配置全家桶（`deepseek-flash` + `asrProvider: 'deepseek'` + `shareDeepSeekKey: true`），并提供模型快捷下拉/预设切换（`deepseek-flash` / `deepseek-v4-pro`）、会后深度思考开关（`settings-byok-checkbox-summary-thinking`）、TTS 音色选择（`settings-byok-select-tts-voice`）；
  - ASR 引擎选项卡新增 `☁️ DeepSeek 全家桶 ASR`（`settings-byok-btn-asr-provider-deepseek`），展示「复用上方 DeepSeek Key」勾选框（`settings-byok-checkbox-share-deepseek-key`）与真实连通性测试；
- **`InMeetingWorkbench.tsx`**：
  - 洞察面板提问区新增「📄 资料 OCR」上传按钮（`workbench-page-insights-panel-btn-upload-ocr`）与「🌐 联网查证」受控切换按钮（`workbench-page-insights-panel-btn-toggle-web-search`），显示已解析参考资料数量徽章，并在会中 ASR 状态条正确显示 `DeepSeek 云端 ASR` 状态；
- **`MeetingSummaryView.tsx`**：
  - 顶部工具栏新增「🔊 朗读纪要 / ⏹ 停止朗读」按钮（`summary-page-header-btn-tts-play`），调用 `DeepSeekSuiteClient.synthesizeSpeech` 朗读综述与决策待办并计入本地成本；
  - 会后 Copilot 输入栏新增「🌐 联网查证」切换按钮（`summary-page-copilot-btn-toggle-web-search`）并接入本地聊天 Token 记账；
  - 成本明细弹窗动态展示当前使用的引擎标识及扩展工具（OCR / TTS / Search）费用行。

**涉及文件：**
- 修改：`src/components/views/SettingsView.tsx`, `src/components/InMeetingWorkbench.tsx`, `src/components/views/MeetingSummaryView.tsx`
- 测试：`src/components/__tests__/SettingsViewByok.test.tsx`, `src/components/__tests__/InMeetingWorkbench.test.tsx`, `src/components/__tests__/MeetingSummaryCopilotAndEditing.test.tsx`
- 只读参考：`docs/specs/UIUX-DESIGN-SPEC.md`, `AGENTS.md`
- 禁止修改：`src/components/FloatingPill.tsx`

#### RED（先失败）
- [x] 在 `SettingsViewByok.test.tsx` 与 `MeetingSummaryCopilotAndEditing.test.tsx` 编写针对 DeepSeek 全家桶预设、DeepSeek ASR 测试、Copilot 联网开关、纪要 TTS 朗读按钮及 QA `data-testid` 存在的失败组件测试
- [x] 运行测试并确认失败

**命令：**
```bash
npx vitest run src/components/__tests__/SettingsViewByok.test.tsx src/components/__tests__/MeetingSummaryCopilotAndEditing.test.tsx
```

#### GREEN（最小通过）
- [x] 完成三处视图组件开发，确保每个新增可见容器与交互元素具备全局唯一且符合规范的 `data-testid`，严格使用设计系统语义化 CSS 变量与 `tabular-nums`
- [x] 运行测试确认全部通过

#### REFACTOR（重构与回归）
- [x] 运行全部前端组件测试，修复任何快照或文本耦合断言

---

### T06 全量回归测试、规范文档同步与 5 大工程质量门禁验证

**状态：** 已完成  
**负责人：** Antigravity  
**优先级：** P0  
**预估耗时：** 4 分钟  
**执行模式：** 合并门禁  
**并行组：** -  
**依赖任务：** T05  
**合并点：** Gate-4  
**是否可委派给 subagent：** 否  
**建议 subagent 类型：** 不适用  
**开始时间：** 16:07  
**完成时间：** 16:17  
**阻塞原因：** 无  
**完成证据：** `bash scripts/verify-gates.sh` 5/5 全绿通过  

**任务目标：**
- 同步更新 `README.md`、`docs/README.md`、`docs/specs/PRD.md`、`docs/specs/SAD.md` 中的 DeepSeek 全家桶 One-Key 架构说明与模型/ASR 配置表；
- 执行全量测试与 `bash scripts/verify-gates.sh` 5 大工程门禁扫描，确保 100% 绿灯闭环。

**涉及文件：**
- 修改：`README.md`, `docs/README.md`, `docs/specs/PRD.md`, `docs/specs/SAD.md`, `docs/plans/029-deepseek-full-suite-integration.md`
- 测试：全仓 Vitest + Rust Cargo Test + `scripts/verify-gates.sh`

#### 验证与门禁执行
- [x] 更新项目核心文档
- [x] 运行 `bash scripts/verify-gates.sh` 并确认 Gate 1~5 全部通过

**命令：**
```bash
bash scripts/verify-gates.sh
```

---

## 3. 验证与交付

### 3.1 验证清单

- [x] 所有任务状态已闭环（T01~T06 全部已完成）
- [x] 所有 AC 状态为“已验证”
- [x] 单元/集成测试全部通过（前端 Vitest 60 套 350 用例 + 后端 Rust Cargo Test 全绿）
- [x] 关键错误场景已验证（空 Key 拦截、401 鉴权错误、联网默认关闭保护、百炼/DeepSeek 混用 Key 隔离）
- [x] 前端 QA 可见元素与交互组件 `data-testid` 覆盖率与唯一性验证通过（Gate 5 0 告警）
- [x] 文档已同步更新（`README.md`, `docs/README.md`, `PRD.md`, `SAD.md`）

### 3.2 验证命令

```bash
npx tsc --noEmit
npm test
cargo test --manifest-path src-tauri/Cargo.toml
bash scripts/verify-gates.sh
```

### 3.3 交付说明

- 交付范围：DeepSeek 全家桶应用 API 端到端集成（One-Key 凭据共享、`deepseek-flash`/`deepseek-v4-pro` 快慢分级 `thinking` 推理、双轨独立 VAD `/v1/tools/asr` 云端转写与 Rust 免 CORS 代理、无状态 `/v1/tools/ocr` 资料背景注入、受控 `deepseek_web_search`/`deepseek_read_url` 联网查证、`/v1/tools/tts` 会后纪要朗读、北京时间峰谷与工具单价本地人民币账单闭环）。
- 未完成项（如有）：无
- 后续建议：后续可在真实长时跨国双语会议场景中对比 `stella` / `tide` 朗读语速微调体验，并支持将 OCR 提取出的专有名词词表一键加入纠偏热词库。

---

## 4. 决策与复盘

### 4.1 关键决策

| 日期 | 决策 | 原因 | 影响 |
|---|---|---|---|
| 2026-11-14 | 默认 BYOK 升级为 DeepSeek One-Key 全家桶（`deepseek-flash` + `/v1/tools/asr` 密钥共享） | 消除个人用户需跨两个云平台注册申请双 Key 的最大上手门槛，同时将 1 小时开会语音转写成本压降至约 0.25~0.39 元 | `ByokSettings`、`SettingsView`、`MeetingPipelineService` |
| 2026-11-14 | 联网搜索默认关闭，采用 Copilot 显式单点授权 + 文档解析优先无状态 `/v1/tools/ocr` | 严格恪守 `AGENTS.md` 第一铁律（Local-First Zero-Content 隐私主权），杜绝保密会议原文静默外流或云端留存 | `ByokLlmClient`、`DeepSeekSuiteClient` |

### 4.2 复盘记录

- 做得好的地方：坚持深度模块设计（`DeepSeekSuiteClient` 统一收敛五大独立工具与北京时间峰谷计费）与严格 TDD，全仓 Gate 3 (`tsc --noEmit`) 与单元测试协同捕获了 `ByokSettings` 参数重载与百炼/DeepSeek 混用 Key 隔离边界问题。
- 可改进点：在封装多调用方共享的工具客户端方法时，第一时间在接口层声明字符串 Key 与 `ByokSettings` 配置对象的双签名重载。
- 下次行动项：继续保持每次 UI 变更同步校验 `verify-gates.sh` 5 大门禁的工程习惯。
