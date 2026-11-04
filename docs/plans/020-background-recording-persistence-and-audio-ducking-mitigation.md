# 后台常驻录音分析持久化与系统音频变小（Ducking/AGC）优化实施计划

> **给 Claude：** 使用 `project-workflow` 按任务顺序执行本计划。

**Plan ID：** `020-background-recording-persistence-and-audio-ducking-mitigation`  
**创建时间：** 2026-11-03  
**最后更新：** 2026-11-03 21:55  
**当前状态：** 已完成  
**负责人：** 主执行者  
**目标：**  
1. 解决用户切换侧边栏页面或将窗口缩至微型悬浮胶囊时录音与洞察分析意外终止的严重缺陷，实现“一旦开启录音，无论界面如何切换均在后台持续稳定记录与分析”；  
2. 排查并彻底消除录制开始后系统声音“变小了一点点”的声学现象（macOS CoreAudio 通信模式 Voice Ducking 与 AGC 压制），实现高保真无感拾音。  
**架构摘要：** 将录音采集、ASR 流式转写、双轨时钟混音、声纹聚类与大模型滑动窗口洞察从 `InMeetingWorkbench.tsx` 视图组件中彻底解耦，提升为常驻应用根层级的 Headless 会议管道服务（`meetingPipelineService` / 常驻 Runner）；同时优化 Web Audio 约束策略，在具备原生 ScreenCaptureKit 数字内录或耳机场景下自适应关闭侵入式 `echoCancellation` 与 `autoGainControl`，杜绝 macOS 触发系统级音频闪避与扬声器硬件衰减。  
**技术栈：** React 19, TypeScript, Tauri 2.0 (Rust), Web Audio API, ScreenCaptureKit, Vitest.

---

## 0. 状态管理

### 0.1 整体进度

- [x] 阶段 A：需求分析与根因诊断完成
- [x] 阶段 B：实施计划与架构设计完成
- [x] 阶段 C：开发与自测完成
- [x] 阶段 D：集成验证完成
- [x] 阶段 E：文档与交付完成

**完成度：** 5/5（100%）

### 0.2 任务状态总览

| 任务ID | 任务名称 | 执行模式 | 并行组 | 依赖任务 | 状态 | 负责人 | 开始时间 | 完成时间 | 阻塞原因 | 验证证据 |
|---|---|---|---|---|---|---|---|---|---|---|
| T01 | 编写与对齐 Plan 020 实施计划文档 | 串行 | - | 无 | 已完成 | 主执行者 | 2026-11-03 16:35 | 2026-11-03 17:45 | 无 | `docs/plans/020-...` |
| T02 | 编写 Headless 会议管道跨页面与胶囊持久运行单元测试（TDD 先红灯） | 串行 | - | T01 | 已完成 | 主执行者 | 2026-11-03 18:30 | 2026-11-03 19:15 | 无 | `src/audio/__tests__/meetingPipelineService.test.ts` (4/4 passed) |
| T03 | 抽离实现常驻 Headless 会议管道服务，解耦 `InMeetingWorkbench` 视图生命周期 | 串行 | - | T02 | 已完成 | 主执行者 | 2026-11-03 19:15 | 2026-11-03 20:20 | 无 | `src/audio/meetingPipelineService.ts`, `src/App.tsx`, `src/components/InMeetingWorkbench.tsx` |
| T04 | 编写自适应声学约束与防系统音频衰减（Ducking Mitigation）测试用例（TDD 先红灯） | 串行 | - | T03 | 已完成 | 主执行者 | 2026-11-03 20:20 | 2026-11-03 20:45 | 无 | `src/audio/__tests__/realAudioCaptureDucking.test.ts` (3/3 passed) |
| T05 | 重构 `realAudioCapture.ts` 声学约束策略与设置项支持，杜绝 macOS Voice Ducking 衰减 | 串行 | - | T04 | 已完成 | 主执行者 | 2026-11-03 20:45 | 2026-11-03 21:15 | 无 | `src/audio/realAudioCapture.ts`, `src/components/views/SettingsView.tsx` |
| T06 | 编写端到端视图切换与悬浮胶囊录音持续性集成测试 | 串行 | - | T05 | 已完成 | 主执行者 | 2026-11-03 21:15 | 2026-11-03 21:45 | 无 | `src/components/__tests__/AppLayoutPersistence.test.tsx` (2/2 passed) |
| T07 | 运行全套 Harness 5 大工程门禁（`bash scripts/verify-gates.sh`） | 串行 | - | T06 | 已完成 | 主执行者 | 2026-11-03 21:45 | 2026-11-03 21:55 | 无 | 5 大门禁全绿通过 |

**状态定义：** 待开始 / 进行中 / 阻塞 / 已完成 / 已取消  
**更新规则：** 任务状态每次变化都必须同步更新本表和“执行记录”。

### 0.3 执行记录

| 时间 | 任务ID | 变更 | 操作人 | 备注 |
|---|---|---|---|---|
| 2026-11-03 17:45 | INIT | 初始化计划 | 主执行者 | 深入完成两处缺陷的根本原因溯源，建立架构设计与实施任务编排 |
| 2026-11-03 19:15 | T02 | TDD 测试红绿流转 | 主执行者 | 编写 `meetingPipelineService.test.ts` 4 个测试用例 |
| 2026-11-03 20:20 | T03 | 管道服务与视图解耦 | 主执行者 | 落地 `MeetingPipelineService`，重构 `InMeetingWorkbench.tsx`，回归测试 20/20 通过 |
| 2026-11-03 20:45 | T04 | 声学约束防衰减 TDD | 主执行者 | 编写 `realAudioCaptureDucking.test.ts` 3 个测试用例 |
| 2026-11-03 21:15 | T05 | 消除 macOS Ducking 与设置页 | 主执行者 | 默认禁用 echoCancellation/autoGainControl，新增拾音偏好切换支持 |
| 2026-11-03 21:45 | T06 | 跨路由与胶囊端到端集成测试 | 主执行者 | 新增 `AppLayoutPersistence.test.tsx` 2 个端到端用例，全部通过 |
| 2026-11-03 21:55 | T07 | Harness 全门禁验证 | 主执行者 | 运行 `bash scripts/verify-gates.sh`，5 道门禁全绿通过 |

---

## 1. 需求分析与根因诊断

### 1.1 需求摘要

**业务背景：**  
用户在日常开会时，高频存在两项核心使用场景：
1. **多任务并行处理**：开会过程中切换至侧边栏查看之前的“任务待办”、“历史会议记录”或“系统设置”；或者将听序窗口缩到桌面置顶微型悬浮胶囊（`FloatingPill`），以便把屏幕空间让给第三方会议软件（如腾讯会议、Teams、Zoom）或文档编辑器；
2. **声音保真要求**：用户开会时电脑正在播放会议远端发言人声音或系统声音，开启录制不应劣化或降低系统的音量听感。

**当前缺陷表象：**
1. 用户在会议进行中切换路由（如点击历史、任务）或缩至胶囊界面，录音采集、ASR 实时转写与大模型洞察分析立即中断停止；再切回工作台时状态脱节；
2. 开始录音后，感觉电脑系统声音“变小了一点点”，音质听感发生改变。

**核心目标：**
- **目标 1：录音与分析全局常驻**。只要会议处于 `RECORDING` 状态，无论前端路由如何跳转、窗口形态如何形变（胶囊或展开），音频捕获、ASR 通信、本地落盘、说话人聚类与大模型分析全程在后台持续无缝运行；
- **目标 2：彻底消除系统声音变小现象**。通过自适应声学配置与非侵入式 Web Audio 管道，避免触发 macOS CoreAudio 的 VoiceProcessingIO Ducking（系统音频闪避与扬声器硬件衰减）和过度 AGC，保障原始音量和音质平稳。

**范围内（In Scope）：**
- [ ] 架构解耦：将录音/ASR/洞察管道从 `InMeetingWorkbench.tsx` 中抽离为全局单例或常驻根组件 Runner（`MeetingPipelineRunner`）；
- [ ] 状态响应：`InMeetingWorkbench` 与 `FloatingPill` 改造为纯视图呈现，与常驻 Pipeline 状态无缝对齐；
- [ ] 声学策略升级：优化 `RealAudioCapture` 的 `MediaTrackConstraints`，避免开启侵入式 `echoCancellation` 导致 macOS Voice Ducking；
- [ ] 用户设置项拓展：在设置页提供“音频拾音模式（高保真防闪避/强力消回声）”开关，允许用户根据外放或耳机场景灵活选择；
- [ ] 完整的 TDD 自动化测试与质量门禁覆盖。

**范围外（Out of Scope）：**
- [ ] 不修改后端 AI 网关流式 ASR 的协议结构；
- [ ] 不变更本地 SQLite 数据库或本地录音落盘目录结构。

---

### 1.2 根因深度溯源

#### 根本原因 1：组件生命周期倒置导致录制分析随视图卸载而中断
- **代码位置：** `src/components/InMeetingWorkbench.tsx:849-1118`
- **机制机制分析：**
  - 当前代码将 `RealAudioCapture`、`RealStreamingAsrClient`、`SlidingWindowAccumulator`、`LocalSpeakerEmbeddingEngine` 等核心引擎实例均以 `useRef` 保存在 `InMeetingWorkbench` 内部，并在该组件挂载时的 `useEffect` 中启动。
  - **页面切换：** `AppLayout.tsx` 的 `renderActiveView()` 依据 `currentRoute` 进行条件渲染。当用户点击侧边栏的“任务”、“搜索”、“设置”或“首页”时，`InMeetingWorkbench` 被直接卸载（Unmount）；
  - **胶囊化：** `App.tsx` 中若 `activeWindow === 'floating-pill'`，直接返回 `<FloatingPill />`，整个 `<AppLayout />` 被彻底卸载；
  - **后果：** 组件卸载立即触发 `useEffect` 的清理函数（Cleanup），执行了 `stopCapture()`、`asrClient.disconnect()`、`sentenceBufferRef.current.clear()`，导致录音与转写分析瞬间被物理掐断！用户切回时又重新初始化，造成音频分片断裂与上下文丢失。

#### 根本原因 2：macOS CoreAudio 通信模式 Voice Ducking 与硬件 AGC
- **代码位置：** `src/components/InMeetingWorkbench.tsx:991-993`、`src/audio/realAudioCapture.ts:305-322`
- **机制机制分析：**
  - 代码中硬编码传入了 `echoCancellation: true, noiseSuppression: true, autoGainControl: true`；
  - 在 macOS（WKWebView）中，一旦传入 `echoCancellation: true`，WebKit 底层会将 CoreAudio 音频单元切换为 **VoiceProcessingIO（通信模式）**；
  - **macOS 通信模式的固有行为：**
    1. **Voice Ducking（系统音频闪避）**：macOS 认为用户处于“通话场景”，会自动将电脑上所有其他应用的声音输出下压衰减约 3~6dB，以保证麦克风优先；
    2. **扬声器硬件衰减**：为防止扬声器声音被麦克风二次录入形成啸叫，CoreAudio 会自动调低扬声器输出增益并改变频响曲线（削弱低频）；
    3. **AGC 动态压制**：开启 `autoGainControl: true` 后，当环境出现较响声音或刚开麦说话时，系统会自动把麦克风输入灵敏度往下压。
  - **听序的核心优势与优化依据：**
    - 听序已经在桌面端实现了 **macOS ScreenCaptureKit 原生免驱数字内录**（从操作系统内核数字总线直接抓取对方纯净音频）；
    - 在戴耳机或已有数字内录的情况下，**根本不需要依赖 WebKit 物理回声消除**。盲目开启只会白白触发 macOS 的 Voice Ducking，导致系统声音变小！

---

### 1.3 用户路径与核心交互

| 步骤 | 角色 | 操作 | 系统响应 | 验证点 |
|---|---|---|---|---|
| 1 | 用户 | 在工作台点击“开始会议” | 启动常驻 Pipeline，麦克风与数字内录开始工作，状态为 `RECORDING` | 秒表走动，波形活跃，系统音量保持原始大小 |
| 2 | 用户 | 点击侧边栏切换至“任务”或“设置”页 | 页面平滑切换至设置或任务，主视图渲染新页面 | 后台录音不间断，ASR 持续接收转写，滑动窗口持续提取洞察 |
| 3 | 用户 | 在工作台或悬浮球点击“缩至胶囊” | 窗口缩小至桌面微型透明药丸（`FloatingPill`）并置顶 | 录音与计时持续进行，胶囊显示最新转写或洞察卡片 |
| 4 | 用户 | 点击胶囊上的“展开”按钮 | 窗口恢复工作台，渲染完整逐字稿与洞察看板 | 逐字稿与洞察包含切走期间的所有内容，无缝衔接无丢失 |
| 5 | 用户 | 电脑播放音频或对方说话 | 听序录制中 | 电脑输出音量不被下压（无 Voice Ducking），声音不发闷不变小 |

---

### 1.4 验收标准（AC）

| AC-ID | 可测试条目 | 验证方式 | 对应测试 | 状态 |
|---|---|---|---|---|
| AC-01 | 会议进行中切换 `currentRoute`（如切至 settings/tasks），`RealAudioCapture` 与 ASR WebSocket 连接不被销毁 | 自动 | `src/audio/__tests__/meetingPipelineService.test.ts` | 待验证 |
| AC-02 | 会议进行中切换 `activeWindow` 至 `floating-pill`，音频帧持续推送至 ASR 与本地落盘，洞察正常触发 | 自动 | `src/audio/__tests__/meetingPipelineService.test.ts` | 待验证 |
| AC-03 | 从胶囊或设置页切回工作台时，页面能完整展示后台期间累积的转写段落与洞察卡片，不发生重复初始化 | 自动 | `src/components/__tests__/AppLayoutPersistence.test.tsx` | 待验证 |
| AC-04 | 戴耳机或开启系统数字内录时，麦克风约束默认使用 `echoCancellation: false` 与优化增益，避免触发 macOS Voice Ducking | 自动 | `src/audio/__tests__/realAudioCaptureDucking.test.ts` | 待验证 |
| AC-05 | 设置页中提供声学模式可选项（高保真防闪避模式 vs 扬声器强力消回声模式），配置即时生效 | 自动 | `src/components/__tests__/SettingsView.test.tsx` | 待验证 |
| AC-06 | 运行 `bash scripts/verify-gates.sh`，5 大工程门禁 100% 通过，无类型与测试回归 | 自动 | 门禁脚本 | 待验证 |

---

### 1.5 Code Review Graph 影响分析

**仓库与图谱状态：**

| 项目 | 结果 | 证据/命令 |
|---|---|---|
| 仓库根目录 | `/Users/zhuchunlei/work/02_mycode/tingxu` | `git rev-parse --show-toplevel` |
| CLI 状态 | 编译依赖由于 macOS SDK 架构兼容异常暂不可用 | `uvx code-review-graph repos` (watchdog 依赖构建报错) |
| 降级说明 | 按规范记录限制，全面降级为 `rg` 调用点、TypeScript 类型系统与测试交叉验证 | 严格执行源码与测试验证 |

**影响矩阵：**

| 影响类型 | 模块/契约 | 影响说明 | 证据来源 | 风险等级 |
|---|---|---|---|---|
| 受影响模块 | `src/components/InMeetingWorkbench.tsx` | 移除内部音频与 ASR 绑定生命周期，转为纯渲染层 | 源码 849-1118 行 | 中 |
| 受影响模块 | `src/App.tsx` & `src/components/AppLayout.tsx` | 挂载常驻 `MeetingPipelineRunner`，维持全局录音存活 | `App.tsx` | 中 |
| 受影响模块 | `src/audio/realAudioCapture.ts` | 优化声学约束自适应逻辑，关闭不必要的 Voice Ducking 触发源 | `realAudioCapture.ts` | 低 |
| 受影响模块 | `src/components/views/SettingsView.tsx` | 新增音频消回声与增益模式设置选项 | `SettingsView.tsx` | 低 |
| 公共契约 | `MeetingStoreState` | 增补管道状态字段（若需），保持向后兼容 | `useMeetingStore.ts` | 低 |

---

### 1.6 方案对比与选型结论

**方案 A（推荐：常驻 Headless 会议管道服务 MeetingPipelineRunner）：**
- **做法：** 在 `App.tsx` 根节点常驻一个无头组件 `<MeetingPipelineRunner />`（或在 `store` 挂载单例 Controller）。其生命周期严格由 `status === 'RECORDING'` 驱动。UI 组件（工作台、胶囊）仅负责订阅和交互；
- **优点：** 彻底实现职责解耦，UI 的任何销毁、隐藏、形变均 100% 不影响录音流与分析；符合 React 单向数据流与 Clean Architecture 架构；
- **缺点：** 需要将 `InMeetingWorkbench.tsx` 中约 300 行底层事件处理逻辑安全重构抽离。

**方案 B（保留工作台 DOM，仅用 CSS `display: none` 隐藏）：**
- **做法：** 在 `AppLayout` 中保持 `InMeetingWorkbench` 始终挂载，通过 CSS 控制显隐；
- **优点：** 改造改动代码行数少；
- **缺点：** 无法解决切换到 `FloatingPill` 的问题（`activeWindow === 'floating-pill'` 时整个应用窗口尺寸被收缩为 320x48，若保留整个工作台 DOM 会导致样式计算错乱与性能浪费）；且组件耦合依然严重，违反清晰架构原则。

**选型结论：** 采用 **方案 A**。

---

## 2. 实施计划与任务编排

### 2.1 任务拆解与详细步骤

#### T01 编写与对齐 Plan 020 实施计划文档（已完成）
- 确立需求边界、AC 标准与任务编排。

#### T02 编写 Headless 会议管道跨页面与胶囊持久运行单元测试（TDD 先红灯）
- **涉及文件：** 创建 `src/audio/__tests__/meetingPipelineService.test.ts`
- **任务目标：** 
  - 模拟会议启动后切换路由与窗口模式；
  - 验证组件卸载时音频采集与 WebSocket 不被释放；
  - 验证音频帧与洞察能持续写入 Store。
- **RED 验证：** 运行 `pnpm test meetingPipelineService`，断言测试红灯失败。

#### T03 抽离实现常驻 Headless 会议管道服务，解耦 `InMeetingWorkbench` 视图生命周期
- **涉及文件：** 
  - 创建 `src/audio/meetingPipelineService.ts`（或 `src/components/MeetingPipelineRunner.tsx`）
  - 修改 `src/App.tsx`（挂载常驻 Runner）
  - 修改 `src/components/InMeetingWorkbench.tsx`（移除内部采集/ASR 生命周期，转为订阅 Store）
- **GREEN 验证：** 运行 `pnpm test meetingPipelineService` 与 `InMeetingWorkbench` 测试，确保用例全绿通过。

#### T04 编写自适应声学约束与防系统音频衰减（Ducking Mitigation）测试用例（TDD 先红灯）
- **涉及文件：** 创建 `src/audio/__tests__/realAudioCaptureDucking.test.ts`
- **任务目标：**
  - 验证在默认模式（耳机/数字内录）下，`getUserMedia` 传参中 `echoCancellation: false, autoGainControl: false`，杜绝激活系统 Voice Ducking；
  - 验证在外放开会模式或用户开启回声消除时，按需传递对应约束；
  - 验证软限幅防削波在双轨混缩中的平稳性。
- **RED 验证：** 运行测试，断言红灯。

#### T05 重构 `realAudioCapture.ts` 声学约束策略与设置项支持
- **涉及文件：**
  - 修改 `src/audio/realAudioCapture.ts`
  - 修改 `src/components/views/SettingsView.tsx`（增加拾音音质模式与消回声选项）
  - 修改 `src/types/meeting.ts`（补充用户偏好字段）
- **GREEN 验证：** 运行 `pnpm test realAudioCapture`，测试绿灯。

#### T06 编写端到端视图切换与悬浮胶囊录音持续性集成测试
- **涉及文件：** 修改或新建 `src/components/__tests__/AppLayoutPersistence.test.tsx`
- **任务目标：** 模拟用户在录音中点击 Sidebar 切换至任务页、设置页、再缩至 `FloatingPill`，最后还原回工作台，验证逐字稿与洞察无损保留且持续更新。

#### T07 运行全套 Harness 5 大工程门禁
- **命令：** `bash scripts/verify-gates.sh`
- **目标：** Secrets、Docs、Typecheck（`tsc --noEmit` & `cargo check`）、Tests（全套单元测试通过）、QA data-testid 门禁 100% 通过。

---

## 3. 门禁与交付规范

实施阶段必须严格遵循 `AGENTS.md`：
1. **Local-First 数据主权**：所有测试与持久化仅保留在本地沙箱；
2. **严禁硬编码 Secret**；
3. **前端可见交互元素 100% 具备层级唯一的 `data-testid`**；
4. **必须通过 `bash scripts/verify-gates.sh` 全套 5 大门禁**。
