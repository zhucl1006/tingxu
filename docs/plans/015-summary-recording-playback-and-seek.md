# 汇总页真实录音回放与逐字稿定位分析及实施计划

**Plan ID：** `015-summary-recording-playback-and-seek`  
**创建时间：** 2026-11-02  
**当前状态：** 进行中（2026-11-02 用户已批准本地录音保存与回放）  
**负责人：** 主执行者；范围/隐私与验收决策由项目负责人确认。  
**目标：** 汇总总结约占2/3，录音与逐字稿约占1/3；对真正保存在本机的录音提供播放、进度拖动、倍速、逐字稿与证据跳播，旧会议无音频明确提示。

> 确认本计划后使用 `project-workflow` 执行。此计划不将历史文档“已完成”视为运行功能已接通，不在本轮调查中开始保存用户声音。

## 0. 状态管理

- [x] 已完成源码调查及2/3＋1/3独立布局修正（Level 1）。
- [x] G0：用户明确回复“确认，实施本地录音保存与回放计划015”。
- [x] M1：音频留存/账号与会议绑定/统一时间轴。
- [x] M2：真实播放器与定位联动。
- [ ] M3：真机及隐私/恢复/资源验证。

**实施任务完成度：** 核心链路已实现，正在审查与真机验收（未宣告G3）。

| ID | 任务 | 模式 | 依赖 | 状态 | 负责人 | 开始时间 | 完成时间 | 阻塞原因 | 完成证据 |
|---|---|---|---|---|---|---|---|---|---|
| T01 | 冻结录音与播放契约、历史差异及存储探针 | 串行 | 无 | 已完成实现 | 主执行者 | 2026-11-02 | - | - | G0已批准 |
| T02 | 本地会话音频写入与有界后台队列 | 串行 | T01 | 已完成实现 | 主执行者 | 2026-11-02 | 2026-11-02 | 待T01/G1 | - |
| T03 | 原子分片清单、WAV索引及恢复 | 串行 | T02 | 已完成实现 | 主执行者 | 2026-11-02 | 2026-11-02 | 待依赖 | - |
| T04 | 录制入口接入与暂停/结束排空 | 串行 | T03 | 已完成实现 | 主执行者 | 2026-11-02 | 2026-11-02 | 待依赖 | - |
| T05 | 历史音频关联及受限本地媒体读取 | 串行 | T04 | 已完成实现 | 主执行者 | 2026-11-02 | 2026-11-02 | 待G2 | - |
| T06 | 真实媒体播放控制及缺失/错误态 | 串行 | T05 | 已完成实现 | 主执行者 | 2026-11-02 | 2026-11-02 | 待依赖 | - |
| T07 | 逐字稿、证据、导图与进度定位 | 串行 | T06 | 已完成实现 | 主执行者 | 2026-11-02 | 2026-11-02 | 待依赖 | - |
| T08 | 播放高亮、滚动与跨会议资源清理 | 串行 | T07 | 已完成实现 | 主执行者 | 2026-11-02 | 2026-11-02 | 待依赖 | - |
| T09 | 真机录制回放及安全/长录音验收 | 合并门禁 | T08 | 部分完成 | 主执行者 | - | - | 待依赖 | - |
| T10 | 文档、全部门禁与交付 | 合并门禁 | T09 | 部分完成 | 主执行者 | - | - | 待依赖 | - |

| 日期 | 任务 | 记录 | 证据 |
|---|---|---|---|
| 2026-11-02 | INIT | 用户要求汇总页缩窄右栏并修复播放/定位；发现完整媒体链路未接通，生成本计划 | 仅布局改动通过定向测试；真实播放未实施 |

## 1. 需求、现状与边界

### 1.1 已确认事实

- `MeetingSummaryView.tsx`的播放按钮只执行`setIsPlaying`，进度条为普通div，倍速只改state；无`audio`元素、媒体源、play/timeupdate/seek事件。不能通过切换图标证明播放。
- `HistoryMeeting`无audio引用，store结束快照只保存总结/逐字稿；当前真实Web Audio采集将PCM交给ASR/60秒环形缓冲，没有接入历史录音保存。环形缓冲不是全场录音，不能会后恢复被覆盖的音频。
- `handleSeekSegment`从`evidenceQuote`剥数字猜时间，但实际该字段可能是“本地逐字稿不上传云端”等引用原文；可靠依据应为`evidenceSegmentId`对应逐字稿的统一时间。
- 设计`SCHEMA.md`预留audio_path/audio_segments；Rust `AudioSliceWriter`有原子PCM写入，`calculate_audio_playback_sync`仅按固定2秒计算索引。它们未被桌面主链路调用，且恢复扫描会重建默认index/track，不能不经验证直接复用为正确录音索引。
- 计划004/007与实际产品存在相关差异。本计划建议以源码现状补齐；批准时需接受此差异处理，保留旧计划历史并追加澄清，不追认原验收。

### 1.2 范围与建议

**建议：从新会议开始保留本机录音**，使用现有16kHz PCM来源，按账号/会议隔离后台落盘，建立可seek的本地WAV/分片清单。云端处理边界保持现有授权；录音不额外上传云存储。界面明确说明本地保存，不再沿用“纯内存、不占磁盘”的旧文案。

本期只接当前实际采集轨，不能把混合音频冒称独立MIC/SYSTEM；不以此暗中实施014双真实上游或模型功能。长会议不得把全场PCM/base64载入前端内存；使用支持Range读取的受限本地媒体资源或经过验证的按片播放策略，T01确定唯一实现。

**旧会议**：若已有音频分片则校验、按真实manifest恢复关联；若从未保存音频，明确“本场会议未保存录音”，禁用真实播放控件，仍可定位并阅读逐字稿。不得生成伪录音、用TTS冒充现场声音或声称可恢复已丢失声音。本期不新增录音导入/导出功能。

范围外：云录音托管、第三方播放器服务、支付与配额重构、声纹算法、整页视觉重做、系统权限自动扩张。正式生产部署/Git提交另行授权。

### 1.3 用户路径与设计

桌面总结2/3＋右侧1/3，长标题/时间/控件可换行且不挤破；窄屏继续上下布局。保留卡片/大纲、思维导图与全稿tab。

- 有录音：播放按钮真实控制audio，倍速作用于媒体，进度为可键盘操作的range；显示真实currentTime/duration与播放状态。
- 点击引用或逐字稿时间：优先由segmentId查找其音频时间，跳到对应位置；若已播放则继续播放，暂停时保持暂停，避免无意发声。
- 点击导图时间：严格解析mm:ss/hh:mm:ss并查最近片段；切回可见的总结/逐字稿栏，再滚动高亮；不对普通引用文本提取数字猜时间。
- 进度拖动/±15s限制到有效媒体区间；metadata尚未加载时保存一次pending seek，loadedmetadata后应用。
- 播放进度驱动当前句高亮；用户向上阅读时不反复强制滚动，手动证据跳转才居中。切会议、退出页面、资源错误时停止旧播放并释放资源。
- 无录音：禁用播放/拖动/倍速，显示原因；证据仍定位文字，不虚报音频已跳转。加载中、文件缺失、损坏、无访问权限均有明确中文状态。

沿用语义token、浅深色和tabular-nums；新增可见元素/交互全覆盖唯一data-testid；动态ID带会议/片段标识。T01将状态文案/截图方向记录在本计划，G1确认后才实施播放器UI。

### 1.4 AC与验证矩阵

| AC | 验收要求 | 验证 |
|---|---|---|
| AC-01 | 总结2/3、右栏1/3；桌面900/1200px不横向溢出，窄屏堆叠 | 已有布局回归＋真机截图 |
| AC-02 | 新录制音频重启后可回放；暂停/恢复、尾句排空时间一致；采集不因写盘阻塞 | Rust写入/恢复＋端到端 |
| AC-03 | Play/Pause、currentTime/duration、ended/error、倍速由真实媒体事件驱动，不是假状态 | audio mock边界＋真机试听 |
| AC-04 | 点击15秒的依据跳到对应媒体时间且文字高亮；引用正文含数字不被当时间 | summary＋mindmap/store联动测试 |
| AC-05 | 主动拖动/±15s/metadata前seek边界正确；播放中/暂停中seek语义一致 | unit/integration＋真机 |
| AC-06 | 会中ASR任务重连及暂停后的时间映射正确；不以FINAL到达时间代替句起点 | 受控时间轴测试＋带标记音频 |
| AC-07 | 旧无录音、损坏/缺片、磁盘满/写失败可降级；不影响已有逐字稿/纪要 | 故障注入/兼容测试 |
| AC-08 | 切会议/退出/卸载释放资源；账号B不能读账号A媒体；路径遍历/伪造meetingId被拒绝 | Rust路径/所有权负向测试 |
| AC-09 | 原始音频不入日志/云数据库/遥测；不新增客户端密钥；不无限积压PCM | 数据流审查＋队列测试 |
| AC-10 | 真机录制/结束/重启/定位播放通过；30分钟录音播放资源有上界，不能全量加载内存 | 标记声音、内存采样；未经真实验证不标达标 |

## 2. 影响分析与门禁

准确仓库：`/Users/zhuchunlei/work/02_mycode/tingxu`。图谱CLI前轮因watchdog/macOS SDK失败，MCP未暴露；本轮使用定向rg、源码、schema与测试降级，不复用陈旧图谱结论，实施前按project-workflow再核对。

| 模块 | 变更/风险 |
|---|---|
| Web Audio采集/工作台 | PCM入后台本地writer，暂停结束双重排空；有界队列，不阻塞高频回调（高） |
| Rust media/main/Tauri config | 增加受限录制/读媒体命令、背景写入、Range媒体访问；不得允许任意绝对路径或根目录资产访问（高） |
| store/types/本地DB | 历史关联录音句柄、时长/采样率/时间映射；旧记录缺省兼容；本地迁移幂等（高） |
| 汇总页/Modal/导图 | 真实audio源及事件、定位/可见tab/高亮（中） |
| 文档/隐私文案 | 从实时内存处理变为实际本地留存，账号隔离/删除与失败文案同步（高） |

**门禁：** G0用户确认本计划和本地录音留存；G1 T01确认源数据/时钟映射/真实manifest、唯一播放方案与UI状态；G2媒体访问只允许当前账号会议资源、存储与重启路径测试通过；G3全部AC与真实试听通过后交付。录音不存在的历史数据不设“必须恢复”假验收。

隐含风险：现有跨账号前端历史存储与Rust隔离未必已接通，T01需核对，不以账号参数可传就当授权；切账户立即使媒体句柄失效。现有PCM恢复和固定2秒假设必须修复后再复用。若必须采用不同持久化或广泛权限扩张，暂停并更新方案，不自动开`$HOME/**`。

不建议subagent并行实现：共享工作台/store/types/native生命周期，主执行者串行；独立review按project-workflow在实现后执行。无并行组，所有未列业务代码、生产数据库/API和无关用户改动禁止修改。

## 3. 任务执行细则

每任务均按RED新行为失败→GREEN最小实现→REFACTOR相关回归；预计每个小增量2–5分钟，真实构建/录制等待另计，超粒度先拆分后续任务。探针/文档任务先列可证伪假设，再记录结果；不伪造失败业务测试。每项状态以0节为准，完成必须记录命令、退出码、测试计数和本地证据，不记录内容或秘密。

### T01 契约与前置探针

- 创建：无；修改：本计划；测试：现有媒体/存储测试只读；参考：PRD/SAD/SCHEMA、014、实际工作树；禁止改业务实现。
- RED：列出无法播放、假跳转、无媒体字段、writer未接通及固定分片索引缺陷。
- GREEN：确认实际可恢复文件、当前账号可信绑定、PCM时钟/暂停映射、WAV/Range最小原型和播放状态文案；媒体数据量按32000字节/秒估算约115.2MB/小时（未含封装），无须上传。
- REFACTOR：确认唯一方案并通过G1；不通过则记录阻塞。
- 命令：`rtk cargo test --manifest-path "src-tauri/Cargo.toml" --test audio_capture_test`；`rtk proxy cat "docs/plans/015-summary-recording-playback-and-seek.md"`。
- 证据：探针报告及G1决策；命令通过不等于真实留存通过。

### T02 本地写入会话

- 创建：`src-tauri/src/media/recording.rs`、`src-tauri/tests/recording_test.rs`；修改：`media/mod.rs`、`main.rs`；参考：atomic_disk/error/device；测试：recording_test；禁止改计费/Gateway。
- RED：同会议写入有序、跨账号/无效句柄拒绝、队列满不无限积压、close后写入失败。
- GREEN：后台线程持有writer，受限会话句柄、顺序样本索引与有界队列；回调只投递。
- REFACTOR：取消/失败资源释放；命令：`rtk cargo test --manifest-path "src-tauri/Cargo.toml" --test recording_test`，预期新增断言由失败转通过。

### T03 分片与恢复

- 创建：无；修改：`media/recording.rs`、`media/atomic_disk.rs`；测试：recording_test/audio_capture_test；参考：schema；禁止无关文件删除。
- RED：不整2秒/暂停间隙/残余尾片/乱序manifest/损坏/磁盘满测试。
- GREEN：原子PCM清单保留真实track/index/startSample；输出可seek WAV及真实长度，恢复按manifest校验；绝不默认所有index=1。
- REFACTOR：句柄只读冻结，缺片显式失败或空洞映射；命令：同T02及audio_capture_test，预期无回归。

### T04 采集与时间轴接入

- 创建：`src/audio/localRecording.ts`及测试；修改：`InMeetingWorkbench.tsx`、`realAudioCapture.ts`、`useMeetingStore.ts`、`types/meeting.ts`；参考：014会话协调；禁止改双上游/模型。
- RED：开始/暂停/恢复/结束、迟到PCM、写入错误、ASR握手/重连时间映射、排空顺序。
- GREEN：在现有真实PCM入口投递本地writer，记录会议录音样本时间→ASR任务相对时间的明确映射；录音关闭完成后再做媒体快照；无录音降级仍保留文字。
- REFACTOR：既有停止竞态回归；命令：`rtk npm test -- "src/audio/__tests__/localRecording.test.ts" "test/e2e/asr-session-lifecycle.test.ts" "src/components/__tests__/InMeetingWorkbench.test.tsx"`。

### T05 历史关联与安全媒体资源

- 创建：`src-tauri/src/media/playback.rs`及对应测试；修改：`main.rs`、`types/meeting.ts`、`useMeetingStore.ts`及测试、必要本地db/schema/migration；Tauri配置仅限批准的app data媒体边界。
- RED：旧字段缺省、重启恢复、换账号/伪造路径/不存在音频、Range合法/非法/文件尾边界失败。
- GREEN：账号/会议关联不透明媒体句柄，提供受限且支持seek的媒体响应；前端不传任意绝对路径、不把原始音频写localStorage，不加载整场base64。
- REFACTOR：退出账号失效、历史删除只删除对应受限媒体；真实删除另按用户危险操作规则确认。
- 命令：`rtk cargo test --manifest-path "src-tauri/Cargo.toml" --test playback_test`；`rtk npm test -- "src/store/__tests__/useMeetingStore.test.ts"`；通过后G2放行。

### T06 真实播放器

- 创建：`src/components/MeetingAudioPlayer.tsx`及测试；修改：`MeetingSummaryView.tsx`；参考：UI规范；禁止伪造媒体。
- RED：play reject不显示播放中、timeupdate/ended/error、metadata/seek/rate和无音频禁用行为。
- GREEN：audio真实媒体状态，range进度、±15s、倍速、加载与缺失状态；不靠定时器模拟currentTime。
- REFACTOR：唯一testid和浅深色；命令：`rtk npm test -- "src/components/__tests__/MeetingAudioPlayer.test.tsx" "src/components/__tests__/MeetingSummaryView.test.tsx"`。

### T07 定位与证据

- 创建：`src/utils/transcriptTime.ts`及测试；修改：`MeetingSummaryView.tsx`、`MeetingSummaryModal.tsx`、`MeetingMindmap.tsx`必要回调；参考：真实segmentId/时间字段。
- RED：普通引用含数字不解析、缺segment/缺时间、时间越界、metadata前seek、mindmap不可见tab、两种时码格式。
- GREEN：segmentId优先、可靠统一毫秒时间次之、严格时码兜底；原位播放/暂停状态保持，显示可见逐字稿并居中。
- REFACTOR：保留导图拖动/折叠；命令：`rtk npm test -- "src/utils/__tests__/transcriptTime.test.ts" "src/components/__tests__/MeetingSummaryView.test.tsx" "src/components/__tests__/MeetingMindmap.test.tsx"`。

### T08 高亮与资源生命周期

- 创建：无；修改：播放器/summary及测试；只读：store历史/退出流程；禁止重构整站路由。
- RED：播放跨句、用户上滚、切会议/卸载/标签切换、旧媒体事件不得修改新会议。
- GREEN：音频时间驱动高亮；用户阅读不强抢位置，主动定位有明确焦点；切换stop/revoke受限资源。
- REFACTOR：键盘可操作、不自动有声播放；命令：T06/T07相关组件测试通过。

### T09 真机与安全验收

- 创建/修改：本计划执行记录；业务代码只读；使用合成标记音本机录制/播放，不涉及真实会议云上传。
- RED：事先列出失败判据，不能用audio mock证明真实播放。
- GREEN：录制→暂停恢复→结束→重启→15秒标记跳播，听到对应声音且进度一致；2/3布局900/1200px/深浅色；缺录音/损坏/账号隔离；30分钟资源观察。
- REFACTOR：独立审查/修复再回归；命令：相关测试＋`rtk npm run tauri -- build --debug --bundles app`；证据为本机匿名摘要及画面，无私密音频入Git。

### T10 文档与交付

- 创建：无；修改：本计划、local-store/audio-capture模块、schema/migrations/API/UI相应说明，旧计划004/007仅追加差异澄清；测试只复用。
- RED：按实际代码找文档与能力差异；GREEN：记录真实行为/未验证/隐私留存与旧数据限制；REFACTOR：核对所有AC状态。
- 命令：`rtk npm test`、`rtk npm run build`、Rust recording/playback/local_store tests、`rtk cargo check --manifest-path "src-tauri/Cargo.toml"`、`rtk proxy bash "scripts/verify-gates.sh"`。
- 完成条件：G3、所有AC证据、无重大审查问题；不自动commit/push/deploy。

## 4. 待确认决策

推荐批准“新会议录音仅保存在本机账号沙箱＋真实回放/定位”的完整范围，并接受旧会议从未留存的声音无法补回。确认前仅交付布局调整，不创建音频留存或扩张媒体读取权限。

## 5. 实施决策（2026-11-02）

G1：采用 16kHz/mono/PCM16 当前混合入口；每 2 秒原子 PCM+SHA256 清单，后台线程顺序写入 WAV，最后原子发布。暂停不插入静音，所有新句使用录音采样时钟偏移；旧句仅文字定位。播放采用仅注册的不透明临时句柄的 Tauri 自定义协议，单次 Range 最多 256KiB，不开放 asset 路径。

账号绑定：原生端向固定控制面只读 `/v1/auth/session` 校验 Bearer（仅凭据，无会议内容），服务端从已验证 JWT 导出 userId/exp；首次验证成功后本机保存 token 哈希/身份/过期时间，支持有效会话离线重启。新增此只读接口属于 T01/T05 账号绑定的直接依赖，不改变计费接口。切换/退出撤销所有媒体租约；前端不能以传入 accountId 选择目录。无凭据/验证失败时录音降级并明确提示。

UI 状态沿用原页控件：本场会议未保存录音 / 正在加载本机录音 / 本机录音不可用 / 播放失败，请重试；有媒体才启用播放、±15 秒、倍速与滑块。主动跳转保留暂停状态；播放高亮不自动拉动阅读位置。

图谱沿用本轮已确认的 CLI SDK 链接失败证据，直接降级定向源码与测试。015 基线保存于 `/tmp/tingxu015-baseline`，不改动既有未提交成果。

### 首轮执行记录

- RED：recording/playback Rust 新测试缺模块编译失败；localRecording/transcriptTime/MeetingAudioPlayer 缺模块失败；只读 session endpoint 404→401 断言失败，均实际执行后实现。
- GREEN：Rust 6项（含30分钟合成PCM、57,600,044字节WAV、分段Range）通过；前端播放器3、定位2、录音3、工作台20、Summary11、导图9、Modal7、store12相关测试通过；Web/控制面构建通过。
- 首轮独立审查6项：退出身份复活、握手错位、小数时码、导图证据ID、删除录音、恢复/排空资源边界。已逐项修复，正在复审及原生验证。
- 技术补充：native端身份请求使用 generation 撤销门禁，同 token 复用有效身份；前端待启动可取消；READY前音频仍本地留存但不投ASR，从READY后首个发送样本建立偏移。录音写失败保留文字并不提供不完整媒体。
- 原生自定义协议未开放文件路径；每次读取<=256KiB；manifest恢复先核对分片长度；播放前流式校验WAV分片哈希。录音删除只限当前已验证账号的UUID目录，并接既有用户确认。
- 30分钟测试为加速生成PCM压力测试，尚不等于30分钟真机实时录制/播放资源验收。

### 原生与最终验证记录（2026-11-02）

- 使用隔离 `com.tingxu.validation015` 应用＋临时只读身份服务3215，无真实麦克风/会议内容，无云调用。真实原生writer与同一SummaryView/播放器录制合成标记音145.2秒（2,323,200 samples），包含暂停/恢复、结束、应用退出重启、持久化读取、自定义协议加载、15秒seek、play/timeupdate、1.5倍速和ended回到播放按钮。
- 15秒后1秒PCM的正过零频率880Hz，与预期标记吻合。此为文件/媒体解码证据，未声称人工听觉验收；本轮合成注入在PCM入口，未把它冒称真实麦克风/ScreenCaptureKit完整链路验证。
- 截图 `/tmp/tingxu015-machine/native-seek.png`；临时验收夹具及凭据只在tmp，未入Git。主进程RSS单次约98MiB，仅debug主进程，不等于整棵进程树指标。
- 五门禁全通过：43套件235项前端/服务测试，Rust各套件合计29项（包含新recording6/playback1/身份世代1），详见 `/tmp/tingxu015-gates-final.log`。Web/控制面构建通过，最终正常桌面bundle构建通过（36.83MiB；未使用隔离验收配置）；`git diff --check`通过。
- 代码审查三轮完成，原阻塞与重要项均关闭；审查代理未独立运行测试。Fortify静态变更审查覆盖Access Control、Path Manipulation、Sensitive Logging；身份竞态/路径和有界读取均已修正，未做正式Fortify扫描。

### 当前交付边界与未完成验收

G1/G2实现与自动验证通过，G3尚未关闭。T01–T08核心实现完成；T09/T10未宣告完全完成。

1. 当前运行的旧控制面3200不含auth/session，首次身份绑定会404并明确降级，需更新本机后端服务后才能在正常桌面保存新录音。本轮未替换既有Docker服务，也未生产部署。
2. 30分钟仅加速PCM写入/Range压力通过，未进行30分钟实时真机录制/整进程树资源观察。未做真实麦克风/SCK→录制→结束→重启的全链路人工试听；既有014设备测试不补记为015验收。
3. 崩溃录音分片可校验恢复，但尚无自动发现孤立录音并关联历史的界面；未保存声音的旧历史不可补回。磁盘满以写入错误路径降级测试代替真实耗尽用户磁盘。
4. 文件缓存与沙箱属于同一OS账户信任边界；不抵御本机管理员/已控制文件系统攻击者。输出PCM+WAV约220MiB/小时，文案已同步。

AC-01比例已有回归及1200px真机合成画面，900px/深色本轮未重新实测；AC02/03/04/05/06/07/08/09有相关自动/部分原生证据，AC10部分完成。以上限制保留为待验收，不以mock/加速测试虚报全通过。

### Fortify Change Review

Code Changes Reviewed: 015本地媒体写入/恢复、身份绑定与租约、Range读取、历史删除及前端播放调用链。

Security Checks:
- Access Control: Missing Authorization Check / Access Control
- Directory Traversal / Dangerous File Inclusion
- System Information Leak / Sensitive Data in Logs

Findings:
| Category | Status | Location | Attack Path | Recommendation |
|---|---|---|---|---|
| Access Control | Fixed | src-tauri/src/media/recording_commands.rs | 延迟身份响应/旧启动命令在退出或换账号后复活旧身份并访问媒体 | 原生generation撤销与后续命令匹配，提交租约前再次校验 |
| Dangerous File Inclusion | Fixed | src-tauri/src/media/recording.rs | 损坏分片长度未经检查先整块读入内存造成无界资源消耗 | metadata长度先校验，WAV恢复/校验流式读取，Range限制256KiB |

Fixes Applied: 身份世代与取消门禁、原生UUID/账号哈希目录及canonical parent校验、临时媒体租约、受限删除、有界队列和读取；错误日志不包含音频或会议正文。

Residual Risk: 静态变更审查并非正式Fortify SAST/SCA/DAST；依赖现有本机OS账户文件边界；未进行30分钟实时资源验收。建议在DevOps流水线补充正式Fortify SAST/SCA/DAST。
