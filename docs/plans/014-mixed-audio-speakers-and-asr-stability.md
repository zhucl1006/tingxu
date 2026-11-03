# 混音说话人识别与流式 ASR 稳定性分析与实施计划

> **给执行者：** 本计划待确认。确认后使用 `project-workflow` 执行；不得把本次“产出计划”视为开发授权。优先交付 M1，再通过独立门禁推进 M2、M3。所有核心逻辑严格执行 RED → GREEN → REFACTOR。

**Plan ID：** `014-mixed-audio-speakers-and-asr-stability`  
**创建时间：** 2026-11-02  
**最后更新：** 2026-11-02  
**当前状态：** 进行中（M1核心确定性实现完成；真实质量验收、G2双轨/G3模型准入阻塞）  
**负责人：** 主执行者（待用户批准后指定）；产品与验收决策：项目负责人  
**目标：** 减少字幕跳变、空档与尾句丢失；保留本地/远端来源；改善多人轮流发言归属，对重叠与低质量语音明确表达不确定性。  
**架构摘要：** 先以可关联、可修订、可排空的 ASR 事件与会话生命周期修复正文时序，再将 MIC/SYSTEM 分轨并映射到统一会议时间轴；最后接入真实本地声纹模型、说话人分段与重叠检测。正文先提交、身份后补齐，声纹与音频留在本机。  
**技术栈：** React/TypeScript/Zustand、Tauri/Rust、ScreenCaptureKit、现有 Gateway WebSocket / Paraformer realtime、Vitest/Cargo；ONNX 运行时与具体声纹/分段模型待探针确定。

## 0. 状态管理

### 0.1 整体进度

- [x] 调研与静态影响分析已整理。
- [x] 实施计划草案已生成。
- [x] G0：用户明确要求实施 014，确认既定范围、AC 草案与最小设计约束。
- [ ] M1：字幕修订、最终文字显示及优雅结束的确定性实现完成；T12/T13真实质量与UI验收待完成。
- [ ] M2：独立音轨与会议时间轴。
- [ ] M3：真实声纹、分段与重叠保护。
- [ ] M4：真实会议验收、门禁与文档同步。

**实施完成度：** 10/30 个任务已完成；M1核心确定性实现及回归通过，真实质量验收和M2/M3/M4未完成。各任务状态以总览为准。

### 0.2 任务状态总览

| 任务ID | 任务名称 | 执行模式 | 并行组 | 依赖任务 | 状态 | 负责人 | 开始时间 | 完成时间 | 阻塞原因 | 验证证据 |
|---|---|---|---|---|---|---|---|---|---|---|
| T01 | 建立基线清单与工作树保护 | 串行 | - | 无 | 已完成 | 主执行者 | 2026-11-02 | 2026-11-02 | 无 | 基线及用户改动保护；见014实施记录 |
| T02 | 冻结本地评测与资源测量协议 | 串行 | - | T01 | 进行中 | 主执行者 | 2026-11-02 | - | 见证据 | 纯指标函数/合成夹具通过；真实数据/资源协议未冻结 |
| T03 | 确认字幕与身份状态设计 | 串行 | - | T01 | 已完成 | 主执行者 | 2026-11-02 | 2026-11-02 | 无 | 用户批准既定UI约束；文案/token/testid记录完成 |
| T04 | 验证上游句子关联及停止协议 | 串行 | - | T01 | 已完成 | 主执行者 | 2026-11-02 | 2026-11-02 | 无 | 本机上游7项事件探针通过；真实供应商字段限制已记录 |
| T05 | 实现Gateway关联事件与字段校验 | 串行 | - | T04 | 已完成 | 主执行者 | 2026-11-02 | 2026-11-02 | 无 | 句关联/修订/去重/word校验及时间缺失变化回归通过 |
| T06 | 实现Gateway显式排空与结束确认 | 串行 | - | T05 | 已完成 | 主执行者 | 2026-11-02 | 2026-11-02 | 无 | 握手PCM队列排空、尾句确认、5秒timeout均通过 |
| T07 | 客户端事件解析与优雅停止 | 串行 | - | T05、T06 | 已完成 | 主执行者 | 2026-11-02 | 2026-11-02 | 无 | 客户端6项通过：finish/超时/旧socket/脱敏/意外FINISHED |
| T08 | 按句提交正文并移除声纹等待 | 串行 | - | T03、T07 | 已完成 | 主执行者 | 2026-11-02 | 2026-11-02 | 无 | 正文即时提交，慢声纹不阻塞，旧会话回调隔离通过 |
| T09 | 串行身份状态更新与会话隔离 | 串行 | - | T08 | 已完成 | 主执行者 | 2026-11-02 | 2026-11-02 | 无 | 重复final/手工命名保护；超时熔断及身份顺序队列通过 |
| T10 | 排空先于暂停结束与历史快照 | 串行 | - | T07、T09 | 已完成 | 主执行者 | 2026-11-02 | 2026-11-02 | 无 | 尾句先于快照/计时冻结；原生停止确认和手动start竞争回归通过 |
| T11 | 用量与尾句端到端回归 | 串行 | - | T10 | 已完成 | 主执行者 | 2026-11-02 | 2026-11-02 | 无 | 生命周期回归与server33项通过；计费实现未改 |
| T12 | 实现可修订的稳定前缀与可变尾部 | 串行 | - | T08、T02 | 进行中 | 主执行者 | 2026-11-02 | - | 见证据 | 前缀展示+120ms合并/final即时回归通过；AC06真实量化待验 |
| T13 | 字幕里程碑验收与断句对照 | 合并门禁 | - | T11、T12 | 阻塞 | 主执行者 | 2026-11-02 | - | 见证据 | M1代码已验＋当前源码真实单任务ASR完成；缺断句对照、产品登录后UI/真实多人QA |
| T14 | 核对双任务授权并发与成本 | 串行 | - | T13 | 阻塞 | 主执行者 | 2026-11-02 | - | 见证据 | G2：既有ASR入口缺主体/会议租约/并发授权，成本上限待决策 |
| T15 | 验证双轨不改变用户用量 | 串行 | - | T14 | 待开始 | 主执行者 | - | - | 待对应门禁/依赖 | - |
| T16 | 验证PCM格式、时钟与外放策略 | 串行 | - | T14 | 阻塞 | 主执行者 | 2026-11-02 | - | 见证据 | G2：已取得本机SCK32-bit/PTS元数据；Rust事件仍未透传，耳机/外放与完整产品路径待验证 |
| T17 | 采集层输出独立来源帧 | 串行 | - | T15、T16（G2通过） | 待开始 | 主执行者 | - | - | 待对应门禁/依赖 | - |
| T18 | 按来源管理ASR任务与失败降级 | 串行 | - | T17、T07 | 待开始 | 主执行者 | - | - | 待对应门禁/依赖 | - |
| T19 | 统一会议时间与每轨缓冲边界 | 串行 | - | T17 | 待开始 | 主执行者 | - | - | 待对应门禁/依赖 | - |
| T20 | 双轨文字合并与晚到证据保护 | 串行 | - | T18、T19、T09 | 待开始 | 主执行者 | - | - | 待对应门禁/依赖 | - |
| T21 | 分轨里程碑真机与降级验收 | 合并门禁 | - | T20 | 待开始 | 主执行者 | - | - | 待对应门禁/依赖 | - |
| T22 | 真实模型与运行时可行性探针 | 串行 | - | T21 | 待开始 | 主执行者 | - | - | 待对应门禁/依赖 | - |
| T23 | 分段与重叠检测模型探针 | 串行 | - | T22 | 待开始 | 主执行者 | - | - | 待对应门禁/依赖 | - |
| T24 | 真实存储路径与版本隔离设计 | 串行 | - | T22 | 待开始 | 主执行者 | - | - | 待对应门禁/依赖 | - |
| T25 | 接入真实本地embedding与质量约束 | 串行 | - | T22、T23、T24（G3通过） | 待开始 | 主执行者 | - | - | 待对应门禁/依赖 | - |
| T26 | 质量门槛与档案版本隔离实现 | 串行 | - | T24、T25 | 待开始 | 主执行者 | - | - | 待对应门禁/依赖 | - |
| T27 | 分段与重叠保护及字时间对齐 | 串行 | - | T23、T26 | 待开始 | 主执行者 | - | - | 待对应门禁/依赖 | - |
| T28 | 身份补全状态与旧档案UI适配 | 串行 | - | T27、T03 | 待开始 | 主执行者 | - | - | 待对应门禁/依赖 | - |
| T29 | 真实holdout及资源隐私总验收 | 合并门禁 | - | T28、T02（G4通过） | 阻塞 | 主执行者 | 2026-11-02 | - | 见证据 | G3/G4及真实holdout未满足，不把合成测试算效果验收 |
| T30 | 完整门禁与文档交付 | 合并门禁 | - | T29 | 进行中 | 主执行者 | 2026-11-02 | - | 见证据 | 受影响文档已同步；5门禁215项通过，Rust21项通过；独立clippy6项既有错误 |

**状态定义：** 待开始 / 进行中 / 阻塞 / 已完成 / 已取消。状态变化同步本表、任务详情与执行记录。未记录失败测试及通过证据，不得宣称业务任务完成。探针与文档任务使用可重现检查闭环，不制造无意义业务测试。

### 0.3 执行记录

**当前交付说明：** 未开启双真实上游、未接入新模型、未改原生PCM格式。缺真实样本和租约授权等证据时遵循G2/G3/G4，不伪造精度/成本/资源结果。用户原有未提交修改保持；未提交或部署。

| 日期 | 任务ID | 变更 | 操作人 | 证据与限制 |
|---|---|---|---|---|
| 2026-11-02 | UI-VERIFY | 本机缺陷修复最终门禁39套件219项通过，debug包重新构建；resume超时清理RED→GREEN | Codex | 真实多人/独立双轨/模型/长时间仍未验证；临时接收服务已关闭 |
| 2026-11-02 | UI-LOGIN | 登录后本机UI暂停尾句通过；修复网关配置未生效及suspended AudioContext，第二轮收到376块/1026480字节PCM | Codex | 本地仅丢弃音频；第二轮未正常FINISH，不能视为完整采集验收；真实多人仍待验证 |
| 2026-11-02 | MACHINE | 用户授权本机测试与合成ASR预算≤5元；完成debug打包/UI启动、3秒SCK元数据及2次单任务真实ASR探针 | Codex | 当前源码v2结束确认通过，既有Docker3201为旧协议；账号登录/真机多人/性能长期验收待完成 |
| 2026-11-02 | VERIFY | 最终五门禁通过，39套件215项＋Rust21项；Web/Gateway/server构建通过；独立clippy因6项现存Rust问题失败 | Codex | 完整证据见research/014-asr-baseline-and-decisions.md；图谱故障降级diff/源码审查 |
| 2026-11-02 | REVIEW | 独立审查问题逐项RED→GREEN，最后只读复核无新增重大问题 | Codex | 包括句时间缺失、意外FINISHED、推理堆积、原生停止与手动启动竞态 |
| 2026-11-02 | T01–T12 | 已完成基线和协议探针，按TDD推进M1；任务证据见总览及研究记录 | Codex | 业务变更以独立审查和回归完成为准 |
| 2026-11-02 | T14/T16 | 前置只读调查发现双轨准入条件缺失 | Codex | 不开启真实双任务、不改采集格式、不改计费；M1继续验证 |
| 2026-11-02 | START | 用户指定 project-workflow 实施014，授权G0及既定UI状态；保存源码基线到本机临时目录 | Codex | 不覆盖用户未提交修改；图谱CLI watchdog/SDK链接失败，降级源码分析 |
| 2026-11-02 | INIT | 根据 research 生成待评审计划 | Codex | 仅新增本文件；未实现、未跑模型基准、未通过业务验收 |

## 1. 需求分析

### 1.1 来源、事实与范围

依据：[本轮调研](../research/2026-11-02-mixed-audio-speakers-and-streaming-asr.md)、[PRD](../specs/PRD.md)、[SAD](../specs/SAD.md)、[音频模块](../modules/audio-capture.md)、[ASR 模块](../modules/asr-streaming.md)、[UI 规范](../specs/UIUX-DESIGN-SPEC.md)、[计划 012](012-speaker-diarization-and-voiceprint.md)。外部一手依据及能力边界见 research，不重复联网调研。

现状核对基线为 `c6c08cb` 及当前未提交工作树：两路音频在 `DualTrackAudioMixer` 相加为 mono；前端先清草稿后等待声纹才添加 final；Gateway interim 只有 text；Rust 声纹为手工特征而非 CAM++ 模型；现有三人“端到端”用合成谐波。当前工作树含用户音频、工作台、Tauri 和图标修改，执行前必须记录差异，保留这些内容。

**范围内：**

- M1：字幕事件关联、显示稳定化、final 原位提交、异步标签补全、排序/幂等/旧会话隔离、暂停结束排空；语义/VAD 断句对照。
- M2：MIC/SYSTEM 独立来源、缓冲及 ASR 任务，统一时间轴、单轨失败降级、成本与用量回归；先验证 macOS 耳机使用，再验证外放。
- M3：真实本地 embedding、模型版本兼容、干净样本筛选、分段/字时间对齐、重叠检测与“不确定”表达，保护既有命名与用户已确认洞察。
- M4：真实中文会议的效果、性能、隐私及回归证据；同步受影响文档。

**范围外：** Teams bot/参会者 SDK 集成、自动识别真实身份而无档案授权、从任意抢话恢复全部文字的承诺、云端声纹/录音存储、生产部署、支付或权益算法重构、Windows 原生采集新增实现、新设置面板或大规模 UI 改版。语音分离与双遍 ASR 仅列后续准入条件，不编排产品实现。

**平台边界：** 本轮新增能力在 macOS 真机验收；现有 Web/mic-only 路径保持可用。Intel Mac/Windows 若无法测试，明确标未验证，不宣称跨平台交付。

### 1.2 用户路径与 UI 设计约束

| 场景 | 预期行为 | 验证点 |
|---|---|---|
| 开始发言 | 可变草稿与较稳定前缀有轻量区分 | 不显示假 final，不整块闪动，不强抢滚动位置 |
| 上游返回 final | 同一句立即呈现最终文字，标签可显示“识别中” | 不依赖声纹完成，不出现先清空后补文 |
| 标签晚到/推理失败 | 原位补标签或标“未确定” | 正文、顺序和证据 ID 不变 |
| 两路同时发言 | 显示各自来源并保留时间 | 不把 MIC 无条件等同唯一“我” |
| 远端抢话/短插话 | 显示“多人重叠”或“未确定” | 不强行继承上一人、不写入个人档案 |
| 暂停/结束 | 冻结新输入、排空在途文本后再固化快照 | 尾句被纳入纪要/历史；超时草稿明确未定稿 |
| 恢复/新会议 | 新 epoch 与时间映射 | 旧异步结果不得进入新会议 |

复用 C-04 双栏 54%/46%、现有行组件与语义 token、深浅色、数字等宽、人工保护标识；不增加页面。新增可见文字/徽章/容器均有唯一 `data-testid`，动态项带业务 ID。尊重 reduced-motion；保留用户向上阅读位置。T03 输出状态/文案表并在 G1 确认后才实施 UI，避免跳过设计约束。

### 1.3 验收标准草案

以下确定性 AC 为必须满足的正确性要求；模型效果数值为**建议验收线，待 G0/G4 冻结**，不是已测结果。不能靠全部输出“未确定”满足精度要求。

| AC | 可测试要求 | 测试/任务 |
|---|---|---|
| AC-01 | 同一句 interim 修订可缩短/改前缀；final 无条件替换自动草稿，迟到 interim 不回退 final，重复 final 不重复落稿 | T04–T08；ASR 客户端/状态测试 |
| AC-02 | final 到达后正文先于受控延迟 2 秒的声纹任务出现；建议本机接收到事件→DOM 的 P95 ≤100ms，固定测试机测量 | T08–T10；工作台测试及真机 |
| AC-03 | 推理逆序完成、旧 epoch 返回、相同起始时间的双轨、暂停恢复均不导致跨会话污染、ID 碰撞或正文丢失；双轨按音频时间排序，稳定 ID 不变 | T05、T09、T19–T21 |
| AC-04 | 停止新音频后尾句仍可到达；只有完成排空才生成纪要/历史快照；超时草稿不作为 final/洞察，计时不含排空等待 | T06、T07、T10、T11 |
| AC-05 | 草稿不进入正式搜索/导出/洞察；标签更新不重复提取洞察；已确认/人工编辑的卡片不被覆盖 | T09–T11；已有 insight/store 回归 |
| AC-06 | 固定事件回放上，开启稳定化相对直接整段替换，已展示前缀回改字符数建议降低 ≥30%，首字延迟增量 ≤300ms；final 内容必须逐字相同 | T12、T13；baseline/holdout 指标 |
| AC-07 | MIC/SYSTEM PCM 不再提前相加；每轨 sample index/epoch 与会议时间映射可追溯；片段不足或过期不以尾部猜身份；模拟 30 分钟双时钟漂移后误差 ≤1 个约定帧长（≤100ms） | T17–T21 |
| AC-08 | 同一会议双上游任务不使用户会议用量翻倍；供方成本、并发及静音计费单列；任一轨失败保留另一轨且提示 | T14、T15、T18、T21 |
| AC-09 | 在固定单一设备/声学条件的真实 2–5 人非重叠 holdout 上，建议 DER 相对基线下降 ≥20%；可确定归属覆盖率 ≥70%；CER 不恶化超过 1 个百分点 | T22、T25、T29；须给分组样本量 |
| AC-10 | 已标注重叠集建议重叠检测召回 ≥80%、误报 ≤10%；重叠/低质/不足样本不更新个人质心及档案；建议错误实名率 ≤1%，同时报告样本数与候选覆盖率 | T23–T29 |
| AC-11 | 新旧模型即使同维度也不得互比；旧档案保留且可改名/删除，重新授权采样后才升级；模型缺失/损坏/推理失败降级未确定 | T22–T27 |
| AC-12 | 真实声纹与分段在本地工作线程；音频回调无新增阻塞 I/O/大分配；无内容/声纹外传或日志；数据按账号隔离 | T16、T22–T29；安全审查 |
| AC-13 | 保持 PRD NFR-002：后台内存 <50MB、会中 CPU <5%；分别测桌面进程树含 WebView/推理内存与 CPU、模型实时因子、30 分钟队列上界，资源测试定义在 T02 冻结 | T02、T22、T29；超标不得自行放宽 |
| AC-14 | 浅/深色、放大字号、上滚阅读、错误状态、data-testid 唯一性及旧 mic-only 流程通过 | T03、T08、T13、T21、T28–T30 |

指标约定：CER 统一标点/数字归一化；DER 报告含/不含重叠及 collar；错误实名率按所有自动实名片段计算，另报错误数与实名覆盖率；重叠误报按非重叠语音时长计算。校准集与 holdout 按会议/说话人隔离，不能在同一测试集上调阈值后报告泛化效果。

### 1.4 影响分析

**仓库：** `/Users/zhuchunlei/work/02_mycode/tingxu`（`git rev-parse --show-toplevel` 已核实）。

**图谱状态：** `uvx code-review-graph repos` 启动失败；依赖 watchdog 在本机 SDK 链接阶段报 tapi / unknown architecture，未获得注册或新鲜度结果。MCP impact/flow 工具未暴露；不据此判断仓库未注册，不静默注册、不修改系统 SDK。降级使用 `rg`、源码、类型、测试、package scripts 和 harness。本轮未对源码做修改，因此无修改后图谱检查；正式实施前重查可用性，仍失败则记录一次并继续源码分析。

| 影响模块/契约 | 当前证据与拟变更 | 风险 |
|---|---|---|
| `src/audio/realStreamingAsrClient.ts`、Gateway ASR server | text-only interim → 带任务/句子/版本/来源的事件；新增结束确认 | 高：协议配套与旧客户端 |
| `src/audio/realAudioCapture.ts`、Rust `media/system_audio.rs`、`main.rs` | 混合 PCM → 来源与采样时间独立；采集格式、PTS 和队列边界 | 高：错速、丢帧、回声、设备切换 |
| `sentenceAudioBuffer.ts` | 相对样本时间 → 每轨 epoch 映射及完整区间检查 | 高：错切他人声音 |
| `src/components/InMeetingWorkbench.tsx`、store/types | 单字符串草稿和异步插入 → 按句更新、生命周期排空、标签补全 | 高：历史/纪要快照时机与证据稳定性 |
| Rust/TS speaker、`speakerClusterer.ts` | 手工特征 → 真实本地模型、质量门槛、未知/重叠、版本隔离 | 高：精度、账号隐私、资源、模型依赖 |
| 本地 store/db、历史序列化 | 新字段兼容缺省；已有 modelId/modelVersion 利用；保存实际使用的声纹模型版本 | 中高：不得混用旧档案；不得删除历史 |
| `server/src/billing/billing.engine.ts` 等 | 只读核对＋现有测试回归，不扩大支付/账本实现 | 高：双连接不等于双用量；发现缺口单独评审 |
| 模型脚本、Tauri packaging/config | 固定版本/校验和/本地资源、运行时、离线可用 | 高：制品来源与安装体积 |

受影响流程：采集→缓冲→Gateway→草稿/final→store→洞察→结束快照→用量结算；声纹提取→聚类→授权档案→跨会议匹配。不得只修改字幕组件而遗漏结束快照、设备恢复与暂停的时序。

**配置与持久化决定：** M1 不新增 DB schema；事件仅内存态，final 走既有本地路径。M2 以独立任务区分来源，不新建云端内容存储。M3 优先复用已有模型版本字段；如 T24 证明必须迁移 SQLite，则仅做本地幂等增量迁移，事务测试及备份恢复验证必需，路径限定 `src-tauri/src/store/db.rs`、`docs/database/SCHEMA.md`、`MIGRATIONS.md`。不改生产 DB。当前前端档案存在 localStorage 路径，不能把 Rust 存储能力当成前端已接通；新增模型档案必须核对实际本地账号隔离与既有授权存储路径，未满足先阻断，不顺手重构整个存储子系统。

### 1.5 风险、探针与决策门禁

| 风险 | 前置处理 | 放行条件 / 不通过处理 |
|---|---|---|
| 当前实现与计划 012 已完成描述冲突 | G0、T01 | 批准本计划即确认以源码现状为基线补齐真实模型，不追认历史精度；未确认不实施 M3 |
| 供应商 interim 没有稳定句子 ID/字时间戳可能缺失 | T04 | 证明以 task/epoch+句起点生成稳定关联；缺字段明确降级，不能按文本猜；不可可靠关联则停止对应协议实现并修订方案 |
| 结束状态先切 ENDED 导致尾句漏入历史 | T06–T11 | 结束协调先于快照，暂停同样排空；有界超时可测 |
| 双上游成本及租约并发限制 | T14–T15、G2 | 明确两个任务成本上界与现有计量不翻倍；商业预算尚无用户数值，须负责人确认；未放行不接真实双任务 |
| 外放回声、重采样漂移及录入格式 | T16、G2 | 耳机/外放分组证据；外放不合格则该模式保留经确认的现有路径与明确能力提示，不静默改成混音冒充分轨成功 |
| 模型许可证/制品真实性、运行时或硬件预算不满足 | T22–T23、G3 | 锁定模型/版本/hash、依赖许可、特征规范、基准及错误降级；不合格停 M3，保留 M1/M2 成果 |
| 无真实会议样本或样本只用于调参 | T01–T02、G4 | 授权来源与独立 holdout；无样本可完成确定性开发但不得标模型验收或全计划完成 |
| 新算法低覆盖率伪造高准确率 | T25、T29 | 同时报 DER、实名错误率、未确定比例、覆盖率与各组数量 |
| UI 设计约束与旧稿“MIC=我”差异 | T03、G1 | 使用“麦克风/系统音频”表示来源，身份另列；本计划建议需确认，不悄悄重写设计规格 |

### 1.6 隐含需求与非功能约束

权限拒绝/撤销仅降级相应轨；没有系统音频时不空开云任务。推理队列有界，模型故障不阻断文字；所有帧具备实际格式与源采样信息，不能靠数值猜 Float32。云端只保留非内容计量，调试回放/真实音频留本机且不提交 Git。模型变更不撤销旧档案授权、不把旧同维度向量误认为兼容、不自动删除档案。旧历史缺新字段仍可读/导出，免费/套餐状态不锁本地资产。测试和基准都不使用生产写 API。

### 1.7 方案与建议决策（均待确认）

推荐“先 M1、后 M2、再 M3”的本地优先方案：便于独立验收，代价是模型和多轨协议需要新增边界。仅调阈值/隐藏 interim 工作量小，但不解决错归属与尾句问题；直接换供应商或引入 Teams bot 则改变接入/商业边界，本期不选。

批准前应确认的决策：

1. 接受重叠/短句先显示未确定，本期不保证抢话双方文字完整恢复。
2. 批准 M1→M2→M3 的分阶段范围及模型制品依赖；M1 通过后可独立交付。
3. 接受以真实样本而非合成谐波作为模型验收依据；AC 数值可在 G0 调整，但实施后不得按结果倒推放宽。
4. 双任务成本上限、最终模型与目标硬件在探针报告中明确后，由负责人通过 G2/G3；模型若违反 PRD 资源线，需单独确认规格变更，不能自行修改 NFR。

## 2. 实施计划

### 2.1 执行编排与阶段门禁

**Subagent 适用性：不建议默认使用。** 本任务的工作台、store、类型及 ASR 协议共享写入较多，采用主执行者串行集成，所有任务并行组为“-”，无并行合并点。模型独立验证将来可以委派 research/worker，但本计划不要求启动代理；需重新明确独立写入边界后再调整编排。主执行者负责全部集成、验收与状态同步。

| Gate | 依赖与进入条件 | 通过条件 | 未通过处理 |
|---|---|---|---|
| G0 计划确认 | 本文与 research 可评审 | 用户确认范围、AC 草案和 012 差异处理 | 保持待评审，不开发 |
| G1 UI/协议设计 | T01–T04 | 状态文案、关联策略、停止超时、兼容策略经确认 | 修订对应设计，不写 UI/协议实现 |
| G2 双轨准入 | M1 验收，T14–T16 | 成本/用量、PCM/PTS、外放处理策略明确且获批准 | 停 M2；M1 可独立交付 |
| G3 模型准入 | M2 验收，T22–T24 | 本地运行、性能预算、制品校验、持久化隔离方案通过 | 不接入 M3 产品推理 |
| G4 效果冻结 | T01–T02 与 T25 校准 | 冻结数据集/阈值/模型版本/AC，holdout 未参与调参 | 无真实证据不宣称效果达标 |
| G5 交付 | T29–T30 | AC 逐项证据＋五大门禁＋额外子包/Rust检查＋人工 UI 验证 | 失败定位到任务；不自动提交或部署 |

| 里程碑 | 任务 | 可独立交付内容 |
|---|---|---|
| M0 准备 | T01–T04 | 本机基准、UI 状态及事件关联设计 |
| M1 字幕 | T05–T13 | 无声纹等待空档、可靠排空、较稳定草稿；定稿内容不被冻结策略损坏 |
| M2 分轨 | T14–T21 | 来源、时间轴、双任务与降级；通过成本/回声门禁 |
| M3 识别 | T22–T28 | 真模型、版本隔离、分段与重叠保护 |
| M4 验收 | T29–T30 | 真实会议、完整回归、文档及交付记录 |

### 2.2 任务公共契约

每项预计主动操作 2–5 分钟的单一验证增量；模型构建、录制和基准运行的外部等待不计入该估算。若实际边界超出，先拆分后续任务并更新依赖，不为凑时长跳过测试。此估算不构成整项功能工期承诺。

下列任务均为：状态“待开始”；负责人“主执行者”；执行模式“串行”（T13/T21/T29/T30 为“合并门禁”）；并行组“-”；无 subagent；开始/完成时间“-”；阻塞原因“等待对应 Gate/依赖完成”；完成证据“-”。总览为权威状态表。

每项“修改/新增”即唯一允许写入边界，列出的测试也可写入；参考文件只读。**禁止修改：**所有未列文件、生产环境、系统设置、其他计划实质内容、支付/账本实现和用户无关改动。确需越界先更新计划并确认。M3 的 Cargo/Tauri 资源变更仅限选定运行时及模型资产，不升级无关依赖。

TDD 公共完成定义：RED 保存新测试失败的行为/原因（不得只用导入缺失作业务证据）；GREEN 同命令最小通过；REFACTOR 仅必要整理并跑同模块回归；记录版本、命令、退出码及摘要，不存正文。探针/设计/文档任务的 RED 为先列出可证伪的假设和检查，GREEN 收集真实结果，REFACTOR 复核可重现性与结论；它们不冒充核心业务 TDD。

命令代号（均在仓库根目录执行；F/G/R/S 的文件参数只能使用该任务已有或新增的文件）：

```bash
# F：前端单模块
rtk npm test -- "src/audio/__tests__/realStreamingAsrClient.test.ts"
# G：Gateway 集成；用任务指定测试路径替换最后一项
rtk npm --prefix "gateway" test -- "test/gateway-real-pipeline.test.ts"
# R：Rust 指定集成测试 target
rtk cargo test --manifest-path "src-tauri/Cargo.toml" --test speaker_embedding_test
# S：既有商业计费回归，仅验证、不顺手修改
rtk npm --prefix "server" test -- "test/control-plane.test.ts"
# D：文档/基准报告人工复核；确认路径存在且读取内容，不能用存在性证明性能达标
rtk proxy cat "docs/research/014-asr-baseline-and-decisions.md"
```

### 2.3 逐任务实施步骤

### T01 建立基线清单与工作树保护

**依赖任务：** 无。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-09、11、12。

- 创建文件：docs/research/014-asr-baseline-and-decisions.md。
- 修改文件：无。
- 测试文件：无。
- 只读参考：research、计划012、git diff。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 先列出源码/计划差异、未提交文件和样本授权缺口；不能把旧测试通过当真机精度。

**GREEN：** 记录当前基线、受影响文件、授权采样方式及每项未知；已有音频修改不被覆盖。

**REFACTOR/回归：** 复查无秘密或正文入报告；样本缺失保留阻塞项。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk git diff --stat
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T02 冻结本地评测与资源测量协议

**依赖任务：** T01。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-06、09、10、13。

- 创建文件：scripts/evaluate-asr-quality.ts、test/fixtures/asr-replay/synthetic.json。
- 修改文件：无。
- 测试文件：src/audio/__tests__/asrQualityMetrics.test.ts。
- 只读参考：PRD NFR-002、research。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 为CER/时间排序/修订计数及空分母写失败断言；真实语料只引用本机私有清单。

**GREEN：** 实现指标计算与脱敏汇总，定义进程树CPU口径、后台内存及30分钟负载；建议至少3场共60分钟、3组不同说话人，含至少20处抢话，负责人确认样本充足性。

**REFACTOR/回归：** 固定校准/holdout划分与硬件信息；指标脚本不得输出正文，全部重新计算一致。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm test -- "src/audio/__tests__/asrQualityMetrics.test.ts"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T03 确认字幕与身份状态设计

**依赖任务：** T01。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-02、04、14。

- 创建文件：无。
- 修改文件：docs/research/014-asr-baseline-and-decisions.md。
- 测试文件：无。
- 只读参考：UIUX-DESIGN-SPEC、InMeetingWorkbench。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 列出草稿、较稳定、final、身份识别中、未知、重叠、结束排空与超时所有状态，检查现有设计缺口。

**GREEN：** 记录状态文案、同句原位更新、来源与身份分离、滚动和testid约束；请求负责人在G1确认。

**REFACTOR/回归：** 逐项核对已有双栏/token/浅深色/人工保护，未确认不进入T08。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk proxy cat "docs/research/014-asr-baseline-and-decisions.md"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T04 验证上游句子关联及停止协议

**依赖任务：** T01。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-01、03、04。

- 创建文件：gateway/test/asr-event-contract.test.ts。
- 修改文件：docs/research/014-asr-baseline-and-decisions.md。
- 测试文件：gateway/test/asr-event-contract.test.ts。
- 只读参考：Gateway streamingAsrServer、阿里官方事件。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 列出 begin_time 不变/缺失、文本变短、final带空时间、重复结果、心跳和finish回包等探针；先声明每种可关联假设。

**GREEN：** 用官方样例及本机授权事件核对task/epoch/句起点策略；最终确认客户端生成utteranceId、revision规则、缺字段降级及两端兼容策略（新客户端不猜旧协议）。

**REFACTOR/回归：** 探针结果与真实字段区分；无实测事件只批准确定性协议部分，不宣称供应商字段已证实；G1确认有界排空超时与协议版本。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm --prefix "gateway" test -- "test/asr-event-contract.test.ts"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T05 实现Gateway关联事件与字段校验

**依赖任务：** T04。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-01、03、12。

- 创建文件：无。
- 修改文件：gateway/src/asr/streamingAsrServer.ts。
- 测试文件：gateway/test/asr-event-contract.test.ts。
- 只读参考：asr事件契约报告。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** fake upstream按同句发多次改写/重复final/心跳/畸形时间，断言归属、revision、丢弃和字时间透传失败。

**GREEN：** 增加经过校验的task/epoch/source/utterance/revision及words，缺省显式未知；保留既有FINAL/INTERIM字段以支持旧客户端，无法确定关联时不伪造精确时间。

**REFACTOR/回归：** 回归gateway-real-pipeline；客户端输入只接受许可来源/任务，不透传任意供应商对象和错误正文。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm --prefix "gateway" test -- "test/asr-event-contract.test.ts"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T06 实现Gateway显式排空与结束确认

**依赖任务：** T05。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-04、12。

- 创建文件：无。
- 修改文件：gateway/src/asr/streamingAsrServer.ts。
- 测试文件：gateway/test/asr-event-contract.test.ts。
- 只读参考：Paraformer finish-task、当前连接关闭逻辑。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 在客户端尚连通时发送结束，fake upstream延迟返回最后FINAL再task-finished；断言立即close导致失败，并覆盖超时/重复结束。

**GREEN：** 实现显式finish请求、停止接收新帧、排空已收队列、发送finish-task、转发剩余FINAL及完成/超时确认；连接断开独立清理。

**REFACTOR/回归：** 定时器全部释放；未完成时不可发送成功结束；异常路径不输出内容。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm --prefix "gateway" test -- "test/asr-event-contract.test.ts"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T07 客户端事件解析与优雅停止

**真机补充：** 统一工作台ASR/洞察/问答使用现有gatewayUrl；设置页实际路径`src/components/views/SettingsView.tsx`及测试纳入本任务隔离地址修复边界，无新配置项。

**依赖任务：** T05、T06。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-01、03、04。

- 创建文件：无。
- 修改文件：src/audio/realStreamingAsrClient.ts。
- 测试文件：src/audio/__tests__/realStreamingAsrClient.test.ts。
- 只读参考：新事件/结束契约。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 断言finish等待最终句和确认、重复stop幂等、超时不造final；检查无效事件及旧连接回调隔离失败。

**GREEN：** 实现强类型事件验证和有界finish Promise，区分停止与强制释放；暴露排空完成状态，旧不兼容服务器明确提示并安全结束。

**REFACTOR/回归：** 回归connect/send/disconnect失败清理，无未决Promise、定时器或旧socket回调污染。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm test -- "src/audio/__tests__/realStreamingAsrClient.test.ts"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T08 按句提交正文并移除声纹等待

**依赖任务：** T03、T07。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-01、02、05、14。

- 创建文件：src/audio/transcriptEventState.ts。
- 修改文件：src/components/InMeetingWorkbench.tsx、src/store/useMeetingStore.ts、src/types/meeting.ts。
- 测试文件：src/audio/__tests__/transcriptEventState.test.ts、src/components/__tests__/InMeetingWorkbench.test.tsx。
- 只读参考：现有工作台与store tests。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 用2秒受控推理Promise证明final不能立即显示；同句草稿移交final时不得出现空白，重复final不得增行。

**GREEN：** 以稳定segmentId同步提交文字再按ID补身份；文字已定稿、身份待定分开；更新既有本地final保存路径而非新建第二份存储。

**REFACTOR/回归：** 保持历史/证据ID、React memo、来源徽章及唯一testid；推理失败不撤回文字。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm test -- "src/audio/__tests__/transcriptEventState.test.ts" "src/components/__tests__/InMeetingWorkbench.test.tsx"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T09 串行身份状态更新与会话隔离

**依赖任务：** T08。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-03、05、12。

- 创建文件：无。
- 修改文件：src/audio/transcriptEventState.ts、src/components/InMeetingWorkbench.tsx、src/store/useMeetingStore.ts、src/types/meeting.ts。
- 测试文件：src/audio/__tests__/transcriptEventState.test.ts、src/store/__tests__/useMeetingStore.test.ts。
- 只读参考：OnlineSpeakerClusterer、slidingWindow。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 模拟两句推理逆序、跨会话晚回、用户手动命名后补标签；断言错序/覆盖/重复洞察失败。

**GREEN：** 采用有界按音频顺序的聚类状态队列；结果检查meeting/epoch/segment；只补算法字段，不覆盖命名，标签更新不重新触发文字提取。

**REFACTOR/回归：** 取消/重试/新会议释放队列，保持已确认洞察和证据稳定；回归insightEngine及slidingWindow。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm test -- "src/audio/__tests__/transcriptEventState.test.ts" "src/store/__tests__/useMeetingStore.test.ts"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T10 排空先于暂停结束与历史快照

**实施边界补充（2026-11-02）：** 独立审查证明原生stop为fire-and-forget会造成旧清理关闭新采集；将`src/audio/realAudioCapture.ts`与其既有测试纳入本任务最小必要写入，返回/等待真实原生停止Promise并幂等，保留用户采集实现；不改变混音/格式算法。

**依赖任务：** T07、T09。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-03、04、05。

- 创建文件：无。
- 修改文件：src/components/InMeetingWorkbench.tsx、src/store/useMeetingStore.ts、src/types/meeting.ts。
- 测试文件：src/components/__tests__/InMeetingWorkbench.test.tsx、src/store/__tests__/useMeetingStore.test.ts。
- 只读参考：endMeeting、pauseMeeting、计时/纪要流程。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 结束/暂停后延迟尾句仍应进入正确会议；纪要请求和历史快照必须在排空完成后；等待不增加会议时长。

**GREEN：** 以最小结束协调入口先冻结新采集与计时、等待finish再调用现有纪要/历史流程；恢复建立新epoch；超时保留未定稿提示但不进正式正文。

**REFACTOR/回归：** 正常/超时/重复点击/组件卸载均清理一次；清缓冲不得早于在途结果取片。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm test -- "src/components/__tests__/InMeetingWorkbench.test.tsx" "src/store/__tests__/useMeetingStore.test.ts"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T11 用量与尾句端到端回归

**依赖任务：** T10。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-04、05、08。

- 创建文件：test/e2e/asr-session-lifecycle.test.ts。
- 修改文件：无。
- 测试文件：test/e2e/asr-session-lifecycle.test.ts。
- 只读参考：store endMeeting、server control-plane tests。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 构造一场会议多次暂停/恢复、结束等待、断网，断言只结算一次会议有效秒数、final纳入历史与纪要、草稿不进入。

**GREEN：** 以fake ASR及网络mock整合真实客户端/store，固定时钟核对结果；不更改商业算法。

**REFACTOR/回归：** 运行S；若发现现有扣减/授权缺陷与本变更无关，记录并单列计划，不扩大账本修改。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm test -- "test/e2e/asr-session-lifecycle.test.ts"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T12 实现可修订的稳定前缀与可变尾部

**依赖任务：** T08、T02。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-01、06、14。

- 创建文件：src/audio/interimTextStabilizer.ts。
- 修改文件：src/components/InMeetingWorkbench.tsx。
- 测试文件：src/audio/__tests__/interimTextStabilizer.test.ts、src/components/__tests__/InMeetingWorkbench.test.tsx。
- 只读参考：AWS/Google机制、research。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 覆盖中文同音回改、前缀推翻、短缩、标点、Unicode、任务重置和final完全替换；冻结错误前缀应失败。

**GREEN：** 用连续公共前缀及时间窗口生成仅展示用较稳定区域；可变尾部低强调，更新节流与final即时提交分离，参数用内部常量先不加设置页。

**REFACTOR/回归：** fake timers确保final不等节流；上滚位置与reduced-motion回归，无动态字段遗漏testid。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm test -- "src/audio/__tests__/interimTextStabilizer.test.ts" "src/components/__tests__/InMeetingWorkbench.test.tsx"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T13 字幕里程碑验收与断句对照

**真机补充：** 采集启动恢复suspended AudioContext作为最小采集修复，允许`realAudioCapture.ts`与既有测试；先RED后GREEN，本机后续收到376块PCM。不据此通过完整麦克风/结束、30分钟、真实多人验收。

**依赖任务：** T11、T12。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-01–06、14。

- 创建文件：无。
- 修改文件：docs/research/014-asr-baseline-and-decisions.md。
- 测试文件：无（复用M1 suites）。
- 只读参考：T02评测脚本、ASR当前语义断句配置。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 先固定基线和AC-01–06，不以人工主观感觉替代回改和延迟。

**GREEN：** 跑相同本地事件回放；授权成本范围内对照语义/VAD模式，记录CER、首字/final延迟和回改；未授权云实验则标待验证而非代填。

**REFACTOR/回归：** M1证据完整才准入M2；断句参数只提出报告结论，若要改变生产默认值须确认。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm test -- "src/audio/__tests__/realStreamingAsrClient.test.ts" "src/audio/__tests__/interimTextStabilizer.test.ts" "test/e2e/asr-session-lifecycle.test.ts"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T14 核对双任务授权并发与成本

**依赖任务：** T13。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-08、12。

- 创建文件：无。
- 修改文件：docs/research/014-asr-baseline-and-decisions.md。
- 测试文件：无。
- 只读参考：Gateway握手、server计费、PRD BR-002。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 先列两个ASR任务是否允许、认证/租约如何绑定会议、静音和并发是否收费等未知，不认为旧测试等于双轨支持。

**GREEN：** 静态核查并在获准成本范围内验证两个受控任务；报告每会议分钟上游成本上限、并发和配额语义，交负责人确认G2。

**REFACTOR/回归：** 双任务不能扩大现有权限或免费绕过额度；若现有鉴权不足，阻断双任务上线并另立安全修复范围。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm --prefix "server" test -- "test/control-plane.test.ts"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T15 验证双轨不改变用户用量

**依赖任务：** T14。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-08。

- 创建文件：test/e2e/asr-dual-track-usage.test.ts。
- 修改文件：无。
- 测试文件：test/e2e/asr-dual-track-usage.test.ts。
- 只读参考：store时间扣减、server billing engine只读。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 为单会议两任务、系统静音/任务失败、暂停重连写一次结算和单一会议时钟断言，先暴露测试缺口。

**GREEN：** 整合stub上游与现有计量入口，证明任务数只影响供应商成本不改变用户秒数；不伪造现有未接通租约能力。

**REFACTOR/回归：** 回归S；商业链路不支持时G2不得通过，不自行新增计费配置。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm test -- "test/e2e/asr-dual-track-usage.test.ts"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T16 验证PCM格式、时钟与外放策略

**依赖任务：** T14。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-07、12、13。

- 创建文件：无。
- 修改文件：docs/research/014-asr-baseline-and-decisions.md。
- 测试文件：无（使用既有audio_capture_test）。
- 只读参考：system_audio.rs、realAudioCapture、音频模块。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 探针确认当前CMSampleBuffer真实格式、PTS与WebAudio采样时钟；分别列耳机/外放回声与权限撤销预期。

**GREEN：** 本机授权采集检查格式而非猜样值；记录设备/采样率/声道/漂移与回声，选择现有AEC是否足够；应用过滤若SDK支持记录结果但不加选择面板。

**REFACTOR/回归：** G2明确外放通过或经确认的回退；需新AEC依赖或新UI则更新范围，不直接实现大子系统。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk cargo test --manifest-path "src-tauri/Cargo.toml" --test audio_capture_test
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T17 采集层输出独立来源帧

**依赖任务：** T15、T16（G2通过）。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-07、12、14。

- 创建文件：无。
- 修改文件：src/audio/realAudioCapture.ts、src-tauri/src/media/system_audio.rs、src-tauri/src/main.rs。
- 测试文件：src/audio/__tests__/realAudioCapture.test.ts、src-tauri/tests/audio_capture_test.rs。
- 只读参考：现有未提交采集改动、T16格式报告。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 输入独立标记脉冲断言源不相加、停一轨不改变另一轨采样速度、系统独立出帧不依赖麦克风；格式异常拒绝而非误解码。

**GREEN：** 保留原有入口的必要适配，输出source/epoch/sampleIndex/真实格式；原生PTS与格式元数据只传必要项，移除该路径混音。

**REFACTOR/回归：** R audio_capture_test；确保高频回调不新增大分配/阻塞，权限/设备切换与现有Web路径回归。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm test -- "src/audio/__tests__/realAudioCapture.test.ts"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T18 按来源管理ASR任务与失败降级

**依赖任务：** T17、T07。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-03、04、08。

- 创建文件：src/audio/dualTrackAsrSession.ts。
- 修改文件：src/components/InMeetingWorkbench.tsx、src/audio/realStreamingAsrClient.ts、gateway/src/asr/streamingAsrServer.ts。
- 测试文件：src/audio/__tests__/dualTrackAsrSession.test.ts、gateway/test/asr-event-contract.test.ts。
- 只读参考：G2成本与授权决策。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 双任务绑定同会议但source独立、系统无权限不空开、单轨断线不关闭另一轨、重复start/stop不泄漏。

**GREEN：** 以固定MIC/SYSTEM两个任务管理生命周期，检查source协议许可；只给实际采集成功的轨开任务，不增加无限重试。

**REFACTOR/回归：** G事件契约回归；两路独立finish且等待都完成/超时，用户用量仍走一个计时源。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm test -- "src/audio/__tests__/dualTrackAsrSession.test.ts"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T19 统一会议时间与每轨缓冲边界

**依赖任务：** T17。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-07。

- 创建文件：src/audio/audioTimeline.ts。
- 修改文件：src/audio/sentenceAudioBuffer.ts。
- 测试文件：src/audio/__tests__/audioTimeline.test.ts、src/audio/__tests__/sentenceAudioBuffer.test.ts。
- 只读参考：PTS样本映射探针、现有buffer。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 测试不同起点/漂移/暂停/断流重连、环形缓冲被覆盖、时间缺失及部分区间；不足区间不能静默当精确切片。

**GREEN：** 以每轨epoch起点和实际样本数转换供应商时间到会议时间，返回切片完整性/覆盖率；缺失显式未知，不回退最新尾部猜身份。

**REFACTOR/回归：** 30分钟虚拟时钟误差≤约定帧；重采样保留分数余量，模拟掉帧有显式缺口。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm test -- "src/audio/__tests__/audioTimeline.test.ts" "src/audio/__tests__/sentenceAudioBuffer.test.ts"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T20 双轨文字合并与晚到证据保护

**依赖任务：** T18、T19、T09。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-03、05、07。

- 创建文件：无。
- 修改文件：src/audio/transcriptEventState.ts、src/components/InMeetingWorkbench.tsx、src/store/useMeetingStore.ts、src/types/meeting.ts。
- 测试文件：src/audio/__tests__/transcriptEventState.test.ts、src/store/__tests__/useMeetingStore.test.ts。
- 只读参考：insight/slidingWindow证据ID。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 相同时间两轨、延迟final插入历史位置、不同时长句子、旧sourceID冲突；证据ID与已确认卡片不变。

**GREEN：** 按会议音频时间＋确定性tie-break排序；稳定ID包含会话/source/utterance；晚到final仍只触发一次增量洞察，不改旧卡片。

**REFACTOR/回归：** 验证顺序变化不触发已存在正文重复提取，不以接收时间计算发言时间。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm test -- "src/audio/__tests__/transcriptEventState.test.ts" "src/store/__tests__/useMeetingStore.test.ts"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T21 分轨里程碑真机与降级验收

**依赖任务：** T20。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-03、04、07、08、14。

- 创建文件：无。
- 修改文件：docs/research/014-asr-baseline-and-decisions.md。
- 测试文件：src/components/__tests__/InMeetingWorkbench.test.tsx。
- 只读参考：G2策略、T15用量suite。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 固定耳机/外放、权限拒绝/撤销、系统静音、设备切换、网络恢复和结束动作的通过线。

**GREEN：** 按G2模式真机测试、核实来源与实际音轨一致和费用；单轨失败有状态提示，回声不达标不得宣称外放分轨通过。

**REFACTOR/回归：** 复核CPU/内存趋势、30分钟队列与资源释放；M2证据完整再进入模型产品集成。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm test -- "src/audio/__tests__/dualTrackAsrSession.test.ts" "src/audio/__tests__/audioTimeline.test.ts" "test/e2e/asr-dual-track-usage.test.ts"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T22 真实模型与运行时可行性探针

**依赖任务：** T21。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-09、11、12、13。

- 创建文件：无。
- 修改文件：docs/research/014-asr-baseline-and-decisions.md。
- 测试文件：无。
- 只读参考：3D-Speaker/sherpa官方模型、Cargo、NFR-002。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 先定义CAM++/ERes2Net候选、预处理契约、模型hash/许可、运行时和离线/硬件预算检查，不凭192维宣称兼容。

**GREEN：** 在仓库外本机临时目录验证真实模型，记录制品来源、大小、P95推理/实时因子、进程树资源；选一个方案，未经授权不全局安装依赖。

**REFACTOR/回归：** 同一输入可复现向量，噪声/纯静音拒绝；不满足PRD不自行放宽，停止G3。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk proxy cat "docs/research/014-asr-baseline-and-decisions.md"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T23 分段与重叠检测模型探针

**依赖任务：** T22。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-09、10、13。

- 创建文件：无。
- 修改文件：docs/research/014-asr-baseline-and-decisions.md。
- 测试文件：无。
- 只读参考：官方diarization构件、授权校准集。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 明确VAD不等于重叠检测、ASR句子不等于换人；给轮流/抢话/短应答预期标注。

**GREEN：** 评估本地分段/重叠候选和窗口延迟，记录字时间对齐精度、模型许可/hash、CPU/内存及未知回退；离线API不冒充流式。

**REFACTOR/回归：** 固定窗口/缓存策略，输出可实现接口和质量阈值；性能或许可失败阻断产品实现。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk proxy cat "docs/research/014-asr-baseline-and-decisions.md"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T24 真实存储路径与版本隔离设计

**依赖任务：** T22。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-11、12。

- 创建文件：无。
- 修改文件：docs/research/014-asr-baseline-and-decisions.md。
- 测试文件：无。
- 只读参考：store localStorage、Rust db、speaker profile字段。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 核实前端真实使用哪个档案存储；检查账号切换、旧档案modelId与真实特征不符的情况。

**GREEN：** 确定旧档案只作历史管理、新档案按实际engine版本区分、重新授权注册路径；优先复用字段且新向量不再写到未经隔离的全局localStorage。

**REFACTOR/回归：** G3审查存储安全边界；需要超出本地适配的存储系统重构时停下更新计划；无凭据/声纹进报告。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk proxy cat "docs/research/014-asr-baseline-and-decisions.md"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T25 接入真实本地embedding与质量约束

**依赖任务：** T22、T23、T24（G3通过）。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-09、11、12、13。

- 创建文件：src-tauri/src/speaker/model.rs、src-tauri/resources/models/manifest.json；模型二进制仅作为经校验的本机构建资产，不提交Git。
- 修改文件：src-tauri/src/speaker/mod.rs、src-tauri/src/main.rs、src-tauri/Cargo.toml、src-tauri/Cargo.lock、scripts/fetch-speaker-model.sh、src-tauri/tauri.conf.json、src/audio/speakerEmbeddingEngine.ts。
- 测试文件：src-tauri/tests/speaker_embedding_test.rs、src/audio/__tests__/speakerEmbeddingEngine.test.ts。
- 只读参考：选定模型规范、授权校准集。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 用可信本地模型夹具测试确实执行权重、预处理一致、低质拒绝、模型缺失/损坏降级；同维手工向量不能当有效模型结果。

**GREEN：** 后台工作线程加载固定模型一次；固定hash与预处理版本，实际有效语音时长参与聚合，移除隐式前2秒截断与手工特征冒充fallback。

**REFACTOR/回归：** F embedding测试、真实校准集性能回归；模型不可用返回明确未确定，G4前冻结阈值后才触碰holdout。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk cargo test --manifest-path "src-tauri/Cargo.toml" --test speaker_embedding_test
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T26 质量门槛与档案版本隔离实现

**依赖任务：** T24、T25。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-10、11、12。

- 创建文件：无。
- 修改文件：src/engine/speakerClusterer.ts、src/store/useMeetingStore.ts、src/types/meeting.ts、src-tauri/src/store/db.rs、docs/database/SCHEMA.md、docs/database/MIGRATIONS.md。
- 测试文件：src/engine/__tests__/speakerClusterer.test.ts、src/store/__tests__/useMeetingStore.test.ts、src-tauri/tests/local_store_test.rs。
- 只读参考：已有授权/账号隔离路径、G3存储决定。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 同维不同版本/账号不能匹配、旧伪CAM标签不能误当新模型、短/低质不强制继承且不更新质心，旧档案不可被自动覆盖。

**GREEN：** 按引擎/模型/预处理版本与账号筛选；确定性未知状态与授权重注册；只在T24确认必要时添加幂等本地schema迁移。

**REFACTOR/回归：** R local_store_test；不自动删除旧向量、不伪造confidence为概率、既有命名/删除/导出回归。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm test -- "src/engine/__tests__/speakerClusterer.test.ts" "src/store/__tests__/useMeetingStore.test.ts"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T27 分段与重叠保护及字时间对齐

**依赖任务：** T23、T26。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-03、05、09、10、12。

- 创建文件：src/audio/speakerSegmentation.ts、src-tauri/src/speaker/segmentation.rs、src-tauri/tests/speaker_segmentation_test.rs。
- 修改文件：src/engine/speakerClusterer.ts、src/components/InMeetingWorkbench.tsx、src/audio/speakerEmbeddingEngine.ts、src/types/meeting.ts、src-tauri/src/speaker/mod.rs、src-tauri/src/main.rs、src-tauri/resources/models/manifest.json、scripts/fetch-speaker-model.sh。
- 测试文件：src/audio/__tests__/speakerSegmentation.test.ts、src/engine/__tests__/speakerClusterer.test.ts、src-tauri/tests/speaker_segmentation_test.rs。
- 只读参考：T23接口、ASR字时间。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 一句换人、两人重叠、极短应答、缺字时间、部分切片不得强行全句归一人；抢话不更新任何个人档案。

**GREEN：** 连接G3已选定、共用T25运行时的本地分段/重叠模型适配，在Rust工作线程推理并通过Tauri返回时间区间；以字时间映射说话人区间，缺信息则保守未知；分段子ID可追溯原final父ID，不重写被引用的证据。若需要第二套运行时或额外本地服务，先修订G3方案和写入边界，不隐式引入。

**REFACTOR/回归：** 同一段正文不复制成双方各说一次；分离不在此实现；有界队列和取消机制回归；另运行 `rtk cargo test --manifest-path "src-tauri/Cargo.toml" --test speaker_segmentation_test` 验证原生适配，不用JS mock替代实际模型执行证据。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm test -- "src/audio/__tests__/speakerSegmentation.test.ts" "src/engine/__tests__/speakerClusterer.test.ts"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T28 身份补全状态与旧档案UI适配

**依赖任务：** T27、T03。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-02、10、11、14。

- 创建文件：无。
- 修改文件：src/components/InMeetingWorkbench.tsx、src/components/SettingsView.tsx。
- 测试文件：src/components/__tests__/InMeetingWorkbench.test.tsx、src/components/__tests__/SettingsView.test.tsx。
- 只读参考：T03文案、既有授权弹窗。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 为未知/重叠/识别中/模型不可用/旧档案需重新采样写显示断言；没有授权不得出现自动重新注册。

**GREEN：** 复用徽章、现有档案管理与授权入口，展示不兼容说明；不增加新设置面板/模型选择器，不覆盖人工命名。

**REFACTOR/回归：** 全新增可见元素testid、深浅色/字号/滚动/键盘与reduced-motion人工核对，界面不暴露内部推理细节。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm test -- "src/components/__tests__/InMeetingWorkbench.test.tsx" "src/components/__tests__/SettingsView.test.tsx"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T29 真实holdout及资源隐私总验收

**依赖任务：** T28、T02（G4通过）。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-01–14。

- 创建文件：无。
- 修改文件：docs/research/014-asr-baseline-and-decisions.md。
- 测试文件：无（运行全部相关suites与本地holdout）。
- 只读参考：冻结模型与数据集manifest、全部AC。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 先冻结指标与分组；逐项列未验证内容，缺真实语料不以合成套件替代。

**GREEN：** 运行同一holdout基线/改造对照，报告CER/DER/归属覆盖率/错误实名/重叠召回/延迟/30分钟CPU内存及队列；仅保存匿名汇总和版本hash。

**REFACTOR/回归：** 审查网络/日志/制品和账号切换；不满足AC记录阻塞与建议，不倒推调低门槛，不宣称完整恢复抢话。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk npm test
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

### T30 完整门禁与文档交付

**依赖任务：** T29。**状态/负责人/时间/模式：** 见总览及2.2公共字段；初始完成证据为“-”。**对应验收：** AC-01–14。

- 创建文件：无。
- 修改文件：docs/modules/asr-streaming.md、docs/modules/audio-capture.md、docs/modules/local-store.md、docs/api/api-spec.md、docs/guides/TESTING-GUIDE.md、docs/README.md、docs/plans/012-speaker-diarization-and-voiceprint.md、docs/plans/014-mixed-audio-speakers-and-asr-stability.md。
- 测试文件：无（复用全部真实测试）。
- 只读参考：实际实现与T29证据。
- 禁止修改：2.2公共禁止范围及本任务未列文件；允许写入仅为上述创建/修改/测试项。

**RED：** 先按变更逐项核对规格/协议/测试与实际差异，列出缺失说明；012只允许追加差异澄清。

**GREEN：** 执行第3节全部验证命令，更新真实契约、限制、模型制品/离线说明和验收状态；保留用户改动及历史记录。

**REFACTOR/回归：** 计划状态与证据一致，未验证项目不标通过；只有全部范围达标才标完成；不提交、不部署。

**执行命令（RED/GREEN同命令，探针按公共契约解释）：**

```bash
rtk proxy bash "scripts/verify-gates.sh"
```

**预期与完成证据：** 业务任务先出现上述行为断言失败，再全部通过（exit 0）；探针输出完整的可复现报告及明确go/no-go。保存命令摘要、测试条目/结果或报告位置，满足对应AC后同步总览和执行记录；命令仅退出0不足以证明真机/性能/效果达标。

## 3. 验证与交付

### 3.1 执行验证矩阵

| 风险 | 验证动作 | 通过证据 |
|---|---|---|
| 草稿误改/空档/旧事件/异步错序 | F：client、transcriptEventState、workbench/store；G：fake upstream | AC-01–05，慢推理与 final 排空明确断言 |
| 双轨重采样/漂移/重连/缓冲过期 | F：audioCapture/timeline/buffer；R：audio_capture_test | AC-07，已知时间偏移可复现，缺样本不猜身份 |
| 双倍用户用量/并发与成本 | S＋本机双任务成本实验 | 用户一次会议一次计时；供方费用单列，G2 负责人决定 |
| 模型/版本/分段/重叠 | R＋speakerClusterer/store＋本地真实 holdout | AC-09–13，非合成精度证据，覆盖率与资源同时报告 |
| UI 与人工保护 | React 测试＋真机浅深色/字号/上滚/reduced-motion | AC-14，所有新增可见元素 testid 唯一，卡片保护回归 |
| 隐私/模型制品 | 日志断言、文件/网络流向审查、hash/离线装包检查 | 无新内容日志、声纹不出本机、无客户端密钥、授权和账号隔离有效 |

```bash
# 开发阶段按任务指定测试文件运行；最后执行实际仓库门禁。
rtk npm test
rtk npm --prefix "gateway" test
rtk npm --prefix "server" test
rtk npm run build
rtk npm --prefix "gateway" run build
rtk npm --prefix "server" run build
rtk cargo check --manifest-path "src-tauri/Cargo.toml"
rtk cargo test --manifest-path "src-tauri/Cargo.toml"
rtk cargo clippy --manifest-path "src-tauri/Cargo.toml" --all-targets -- -D warnings
rtk proxy bash "scripts/verify-gates.sh"
```

现有 `verify-gates.sh` 不替代 Gateway/server 子包检查、完整 data-testid 覆盖审查、真机模型精度或性能。Rust 若遇本机 SDK 故障，记录原始错误与受阻检查，不修改系统配置，不把前端通过当成 Rust 已验证。

### 3.2 交付要求与回退

- 每个里程碑固定代码版本/工作树差异、模型 hash、配置、数据集 manifest 版本和验证结果；真实媒体/正文/声纹不进入仓库、云日志或公开制品。
- M1 保持既有单音轨业务可用；M2 失败明确显示单轨状态，不能静默把两个来源再次混合；外放回退必须经 G2 确认且记录模式。
- M3 模型缺失或故障退化为未知标签，正文继续；模型版本不兼容保留历史与旧档案，不自动删除或互比。
- M1/M2 已通过可独立交付；M3 阻塞时计划不能整体标“已完成”，明确延期范围和原因。
- `docs/modules/asr-streaming.md`、`audio-capture.md`、`local-store.md`、`docs/api/api-spec.md`、`TESTING-GUIDE.md` 及必要数据库说明同步；按实际结果给计划 012 追加差异澄清，不覆盖历史执行记录。
- 不执行 git commit/push、分支操作或生产部署。

## 4. 决策与后续边界

| 日期 | 决策状态 | 内容 |
|---|---|---|
| 2026-11-02 | 建议，待确认 | 分阶段交付，先保证字幕正确性与稳定呈现，再增加模型复杂度 |
| 2026-11-02 | 建议，待确认 | 本期重叠检测与不确定回退，不承诺全量分离转写；不采用 Teams bot |
| 2026-11-02 | 待 G2/G3 | 双任务成本上限、外放策略、模型/运行时/资源是否满足既有规格 |

后续仅在 M4 证明重叠漏字仍为主要瓶颈时，另立计划评估局部语音分离；若非重叠 CER 为瓶颈，再评估双遍或替换实时模型。两者均需独立成本/资源/隐私验证，不能以本计划批准推定为已授权开发。

**复盘记录：** M1优先隔离文字与身份降低了耦合；审查证明仅等WebSocket或JS stop不足以保证原生释放，已将真实停止确认和所有系统启动入口纳入同一门禁。缺少真实holdout和既有租约授权时，测试通过不能用作M2/M3准入事实。
