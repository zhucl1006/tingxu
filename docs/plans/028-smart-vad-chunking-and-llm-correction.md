# 智能 VAD 语义断句切片与会话级 LLM 实时纠偏分析与实施计划

> **给 Claude：** 使用 `project-workflow` 按任务顺序执行本计划。

**Plan ID：** `028-smart-vad-chunking-and-llm-correction`  
**创建时间：** 2026-11-07  
**最后更新：** 2026-11-07 12:55  
**当前状态：** 已完成  
**负责人：** Antigravity 团队  
**目标：** 彻底解决本地与内嵌 ASR 识别“十几个字就零碎切断”和“错别字与同音字率高”的体验痛点，通过智能 VAD 自然停顿断句、Whisper 上下文 Prompt 记忆注入，以及会话级轻量 LLM 异步实时纠偏，使本地离线转写达到流畅完整的整句感与高准确率。  
**架构摘要：** 引入轻量级 `SmartVadBuffer` 实现基于 RMS/过零率双门限的自然语音停顿断句（取代固定 2 秒机械切片）；在 ASR 请求中注入前文上下文 `prompt`；构建 `LlmTranscriptCorrector` 异步非阻塞纠偏流水线，实现 ASR 即时上屏与大模型毫秒级平滑订正。  
**技术栈：** TypeScript, React, Zustand, Tauri (Rust reqwest/socket), Vitest, ByokLlmClient (Ollama / DashScope).

---

## 0. 状态管理

### 0.1 整体进度

- [x] 阶段 A：需求分析与方案设计完成
- [x] 阶段 B：实施计划与 TDD 任务拆解完成
- [x] 阶段 C：开发与自测完成
- [x] 阶段 D：集成验证完成
- [x] 阶段 E：文档与门禁交付完成

**完成度：** 5/5（100%）

### 0.2 任务状态总览

| 任务ID | 任务名称 | 执行模式 | 并行组 | 依赖任务 | 状态 | 负责人 | 开始时间 | 完成时间 | 阻塞原因 | 验证证据 |
|---|---|---|---|---|---|---|---|---|---|---|
| T01 | 需求配置扩展与 SmartVadBuffer 核心算法实现 (TDD) | 串行 | - | 无 | 已完成 | Antigravity | 12:51 | 12:53 | 无 | `smartVadBuffer.test.ts` 5/5 通过 |
| T02 | LocalAsrClient & EmbeddedAsrClient 接入 VAD 切片与 Prompt 记忆 (TDD) | 串行 | - | T01 | 已完成 | Antigravity | 12:53 | 13:00 | 无 | `localAsrClient.test.ts` 8/8, `embeddedAsrClient.test.ts` 8/8 通过 |
| T03 | Rust 原生代理层增加 prompt 参数支持并杜绝 CORS | 串行 | - | T02 | 已完成 | Antigravity | 13:00 | 13:02 | 无 | `cargo test asr` 4/4 通过 |
| T04 | LlmTranscriptCorrector 异步纠偏服务与 Store 状态集成 (TDD) | 串行 | - | T02 | 已完成 | Antigravity | 13:02 | 13:05 | 无 | `llmTranscriptCorrector.test.ts` 3/3 通过 |
| T05 | 前端设置面板与逐字稿润色高亮状态展示 (QA Compliance) | 串行 | - | T04 | 已完成 | Antigravity | 13:05 | 13:07 | 无 | `SettingsViewByok.test.tsx` 9/9 通过 |
| T06 | 全量回归与 5 大工程门禁验证 (ALL GATES PASSED) | 合并门禁 | - | T05 | 已完成 | Antigravity | 13:07 | 13:13 | 无 | 自动化门禁 Gate 1~5 全绿 (326 前端测试 + Rust 单元测试) |

**状态定义：** 待开始 / 进行中 / 阻塞 / 已完成 / 已取消  
**更新规则：** 任务状态每次变化都必须同步更新本表和“执行记录”。

### 0.3 执行记录

| 时间 | 任务ID | 变更 | 操作人 | 备注 |
|---|---|---|---|---|
| 2026-11-07 12:55 | INIT | 初始化计划 | Antigravity | 创建 028 计划文档，拆解 VAD 断句与 LLM 纠偏任务 |
| 2026-11-07 13:07 | T01-T05 | 核心功能完成 | Antigravity | 完成 SmartVadBuffer、Prompt 上下文注入、LlmTranscriptCorrector 与前端设置开关及高亮展示 |
| 2026-11-07 13:13 | T06 | 门禁全绿 | Antigravity | 运行 verify-gates.sh，5 大门禁 100% 通过，版本升级为 v0.3.6 |

---

## 1. 需求分析

### 1.1 需求摘要

**业务背景：**
- 用户使用本地 Docker Faster-Whisper 或内嵌轻量 ASR 开会时，反馈两个明显问题：
  1. 识别结果“十几个字就出来了”，句子被切得零碎、语意不完整；
  2. 识别准确率明显低于阿里云百炼，缺少上下文语义纠偏。
- 本地硬切片（每 2 秒切一刀）腰斩了词汇，破坏了完整语音特征，且切片之间缺少前文联系。

**核心目标：**
- **目标 1**：基于智能人声停顿检测（VAD），实现人说话停顿时自然断句切片（4~8 秒整句），彻底消除机械式“十几个字零碎蹦出”的割裂感；
- **目标 2**：在请求本地 Whisper 时注入上一句识别文本作为上下文 `prompt`，强化同音字推断；
- **目标 3**：引入轻量级 LLM 会话级实时异步纠偏（方案 4），对 ASR 原始文本进行错别字校正并平滑回写逐字稿。

**范围内（In Scope）：**
- [ ] `SmartVadBuffer` 语音活动检测器与自然停顿切片实现；
- [ ] `LocalAsrClient` & `EmbeddedAsrClient` 支持 VAD 驱动与 `prompt` 上下文注入；
- [ ] Rust 端 `proxy_post_local_asr` 支持携带 `prompt` 字段；
- [ ] `LlmTranscriptCorrector` 轻量会话纠偏服务，非阻塞异步校对；
- [ ] 逐字稿状态更新与前端标注（带原文本对比）。

**范围外（Out of Scope）：**
- 暂不重写 C++ 底层动态链接库（保持跨平台无外部动态库纯净打包）；
- 云端百炼 ASR 保持其现有的全双工 WebSocket 流（百炼本身已有服务端 2-Pass 纠偏）。

### 1.2 用户路径与核心交互

| 步骤 | 角色 | 操作 | 系统响应 | 验证点 |
|---|---|---|---|---|
| 1 | 用户 | 在设置中开启【智能 VAD 语义断句】与【AI 实时文本润色纠偏】 | 保存设置到本地沙箱 LocalStorage | 设置持久化生效 |
| 2 | 用户 | 开启会议，以正常语速说出一段完整长句（例如 6 秒） | 麦克风录入音频，SmartVadBuffer 持续累积并不卡死在 2 秒切断 | 说话中途不突兀断句 |
| 3 | 系统 | 用户说话停顿超过 500ms | 触发自然整句切片，携带上一句文字作为 `prompt` 提交 Faster-Whisper | 生成完整语义的整句逐字稿 |
| 4 | 系统 | 获得 ASR Final 文本 | 立即渲染上屏（保证零延迟视听），同时异步派发给 LLM 纠偏管道 | 快速出字 |
| 5 | 系统 | LLM 完成同音字与标点润色（约 300~800ms） | 平滑更新该条逐字稿文本，并在卡片旁微标注 ✨ 符号 | 语法自然、错别字纠正 |

### 1.3 验收标准（AC）草案

| AC-ID | 可测试条目 | 验证方式 | 对应测试 | 状态 |
|---|---|---|---|---|
| AC-01 | SmartVadBuffer 在连续人声时不切断，停顿超过指定毫秒且达最小长度时输出完整整句 | 自动 | `smartVadBuffer.test.ts` | 已通过 |
| AC-02 | LocalAsrClient 提交切片时，正确包含历史句 `prompt` 参数 | 自动 | `localAsrClient.test.ts` | 已通过 |
| AC-03 | EmbeddedAsrClient 具备相同的 VAD 断句与 Prompt 上下文能力 | 自动 | `embeddedAsrClient.test.ts` | 已通过 |
| AC-04 | LlmTranscriptCorrector 收到 ASR 文本后正确调用 ByokLlmClient 异步纠偏并触发回调 | 自动 | `llmTranscriptCorrector.test.ts` | 已通过 |
| AC-05 | 5 大质量门禁全绿，无 TypeScript 与 Rust 编译警告，无回归破坏 | 自动 | `scripts/verify-gates.sh` | 已通过 |

### 1.4 Code Review Graph 影响分析

- **分析路径**：由于环境系统 SDK 缺少 arm64e 静态库导致 watchdog 编译受阻，降级为源码交叉检验与精准 AST 影响分析；
- **受影响模块**：
  - `src/audio/smartVadBuffer.ts`（新增）
  - `src/audio/localAsrClient.ts`（改造音频缓冲与提交）
  - `src/audio/embeddedAsrClient.ts`（接入 VAD 与 prompt）
  - `src/audio/llmTranscriptCorrector.ts`（新增）
  - `src-tauri/src/asr/local_model.rs` & `src-tauri/src/main.rs`（新增 prompt 支持）
  - `src/audio/meetingPipelineService.ts`（挂载纠偏器）
- **风险等级**：中。通过 TDD 红绿测试隔离验证，确保已有全量测试用例无破坏。

---

## 2. 实施计划与 TDD 任务拆解

### T01：需求配置扩展与 SmartVadBuffer 核心算法实现 (TDD)
- **目标**：实现人声能量/过零率双门限停顿检测缓冲区；
- **创建文件**：`src/audio/smartVadBuffer.ts`, `src/audio/__tests__/smartVadBuffer.test.ts`；
- **RED 阶段**：编写单元测试，验证连续说话持续累积、遇静音停顿平滑切片、最大时长保护保护机制；
- **GREEN 阶段**：实现基于 RMS 能量计算与状态机（SPEECH / SILENCE）的智能切片算法；
- **REFACTOR 阶段**：优化内存拷贝性能与边界空音频过滤。

### T02：LocalAsrClient & EmbeddedAsrClient 接入 VAD 切片与 Prompt 记忆 (TDD)
- **目标**：将定时死切片升级为 VAD 事件切片，并记录最近 2 句文本作为 Whisper `prompt`；
- **修改文件**：`src/audio/localAsrClient.ts`, `src/audio/embeddedAsrClient.ts`；
- **测试文件**：`src/audio/__tests__/localAsrClient.test.ts`, `src/audio/__tests__/embeddedAsrClient.test.ts`；
- **RED 阶段**：添加对 prompt 附带提交和 VAD 切片的单元测试；
- **GREEN 阶段**：接入 `SmartVadBuffer`，并在 HTTP FormData 与 Base64 代理请求中增加 `prompt` 字段；
- **REFACTOR 阶段**：保证排空（finish）时无残留音频丢弃。

### T03：Rust 原生代理层增加 prompt 参数支持并杜绝 CORS
- **目标**：在 Rust 原生 `proxy_post_local_asr` 和 `probe_local_asr_http_endpoint` 中支持可选的 `prompt` 文本；
- **修改文件**：`src-tauri/src/asr/local_model.rs`, `src-tauri/src/main.rs`；
- **命令**：`cargo test --manifest-path src-tauri/Cargo.toml`；
- **验证**：Rust 测试全部通过，成功向 Docker Whisper 提交带 prompt 的 multipart 表单。

### T04：LlmTranscriptCorrector 异步纠偏服务与 Store 状态集成 (TDD)
- **目标**：实现会话级异步纠偏器，使用当前配置的 LLM（百炼/本地 Ollama）对 ASR 进行低延迟纠偏；
- **创建文件**：`src/audio/llmTranscriptCorrector.ts`, `src/audio/__tests__/llmTranscriptCorrector.test.ts`；
- **修改文件**：`src/audio/meetingPipelineService.ts`, `src/types/meeting.ts`, `src/store/useMeetingStore.ts`；
- **RED 阶段**：测试纠偏文本返回后正确触发逐字稿更新回调；
- **GREEN 阶段**：实现轻量 Prompt 模板，非阻塞更新逐字稿并保持幂等；
- **REFACTOR 阶段**：增加请求超时熔断（最多 3 秒，失败自动静默跳过不阻断会议）。

### T05：前端设置面板与逐字稿润色高亮状态展示 (QA Compliance)
- **目标**：在 SettingsView 中提供智能断句与 AI 纠偏开关，在逐字稿中展示轻量润色标识；
- **修改文件**：`src/components/views/SettingsView.tsx`, `src/components/InMeetingWorkbench.tsx`；
- **测试文件**：`src/components/__tests__/SettingsViewByok.test.tsx`；
- **验证**：规范 data-testid 覆盖，所有按钮与开关符合规范。

### T06：全量回归与 5 大工程门禁验证 (ALL GATES PASSED)
- **目标**：运行完整自动化门禁检查，确保 0 失败、0 泄露、0 破坏；
- **命令**：`bash scripts/verify-gates.sh`；
- **验证**：Gate 1~5 全部通过。
