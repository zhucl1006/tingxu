# 014 实施基线与决策记录

日期：2026-11-02。用户已明确要求实施014；G0及计划中既定字幕状态设计据此进入实施。G2/G3的供方成本、外放策略和真实模型资源证据仍须独立满足。

## T01 基线与样本

- 仓库根目录已核实为 `/Users/zhuchunlei/work/02_mycode/tingxu`，HEAD `c6c08cb`。实施前关键源码副本留在 `/tmp/tingxu014-baseline/`，用于分辨本轮修改与用户既有修改。
- 既有未提交内容：图标、原生ScreenCaptureKit、Tauri配置/依赖、音频采集、工作台及相关测试。保留，不重置、不提交。
- 实际链路：单一混合PCM、Gateway Paraformer、临时字符串、final先清草稿再异步声纹插入；真实声纹模型尚未运行。
- 没有用户授权的真实会议音频/说话人标注清单；不能执行真实CER/DER/资源验收或向云供应商上传本地内容。合成事件只验证确定性行为。
- 图谱工具：`uvx code-review-graph repos` 因watchdog链接macOS SDK失败（tapi unknown architecture），注册/新鲜度未知；使用rg、真实diff、源码、测试降级，不改系统SDK。

## T03 最小设计约束

按已批准计划复用双栏、token、字号和深浅色。草稿标“正在转写”，稳定前缀仅为显示启发式，尾部可变；final立即原位呈现。身份另有“识别中/未确定”，不会遮挡或撤回文字；取消整块脉冲动画，新增可见元素唯一testid。上滚不抢位置。

结束：先冻结计时和新音频，保留连接等待final，再生成纪要/历史；超时显示“部分内容未定稿”，草稿不进正式记录。暂停也排空，恢复新会话。字正文仅final路径触发一次洞察，标签变化不重触发。采用5秒网关排空、6秒客户端兜底；这是内部有界等待参数，不是上游SLA。

## T04 协议设计与探针限制

保留原INTERIM.text / FINAL.sentence，增量附加protocolVersion=2、taskId、utteranceId、revision、source、begin/end、words；任务ID为网关每连接随机生成。单轨阶段source固定mic（当前混合来源不冒充已分轨）。同任务的非负begin_time生成稳定句ID；缺begin_time时只按同连接活动句关联且不伪造时间；已定稿句拒绝后续修订。无可可靠关联的晚到无时间结果只能保守处理，不能据文本猜身份。

客户端新事件回调严格校验；旧回调保留便于旧服务端兼容与现有测试，但工作台使用v2事件，旧协议明确报不兼容。FINISH为客户端显式结束，Gateway等待task-started排队音频排空后finish-task；task-finished确认，超时标timeout，客户端不再从onclose推定成功。

测试仅使用本机fake upstream与官方字段形状，未调用真实供应商；不能声称生产字段或断句质量已实测。

## 验证记录

### 已执行与TDD证据

- Gateway事件契约：先复现重复final/心跳误转写、未处理FINISH、原始供应商错误外泄3项失败；修复后全部通过。补充begin_time出现/消失的2项失败再修复；增加握手队列先PCM后finish以及5秒排空超时，共7项通过。
- ASR客户端：新增finish/重复finish/超时/旧socket隔离/格式校验/错误脱敏/非主动FINISHED。先复现finish不存在、错误原文透传和假连接，再最小实现；6项通过（包含原有用例）。
- 句子状态、较稳定前缀与CER/回改计数：7项从行为断言失败到通过；final完全纠正、不冻结前缀、Unicode和空参考边界覆盖。评测工具目前提供纯指标函数与合成夹具，没有真实manifest或基准结论。
- 工作台慢声纹：先复现final不可见，再同步正文/异步标签；旧会话回调不污染新会话。推理2秒超时原实现会发起3个卡住任务，修复后同会话熔断、只发起1个。120ms合并刷新先复现立即改写再修复，final取消timer不复活草稿。
- 生命周期：先复现尾句漏入快照/等待仍可恢复/重复final与命名覆盖，再修复。设备stop延迟、原生invoke停止延迟、手动start迟到分别有RED→GREEN；停止Promise等真实原生确认，所有开启入口纳入等待。旧设备未释放时禁止恢复/新建会议，reset不能清除这个释放门禁。
- 独立审查共5轮反馈：修复句ID、意外FINISHED、推理堆积、JS设备停止、原生停止确认及手动启动竞争；最终只读复核“无新增重大问题”。新增可见UI的testid未发现遗漏/重复。

### 最终命令结果

| 命令 | 结果 |
|---|---|
| `rtk proxy bash "scripts/verify-gates.sh"` | exit 0；5道门禁通过；根Vitest 39套件/215项，Rust共21项通过 |
| `rtk npm run build` | exit 0；TypeScript及Vite生产构建通过 |
| `rtk npm --prefix "gateway" test` | 初轮20项通过；新增至7项事件契约后被最终根测试完整收集通过 |
| `rtk npm --prefix "server" test` | 4套件/33项通过；未修改商业算法 |
| Gateway / server `run build` | 各exit 0 |
| `rtk cargo check --manifest-path "src-tauri/Cargo.toml"` | exit 0 |
| `rtk cargo clippy --manifest-path "src-tauri/Cargo.toml" --all-targets -- -D warnings` | exit 101；6项现存错误，位于本轮未修改的Rust文件：system_audio.rs的取模/chunks/clamp，speaker/mod.rs索引循环，store/db.rs的chunks/参数数量；未顺手修复 |
| `rtk git diff --check` | exit 0；修改文档相对链接/代码围栏检查通过 |

最终本机摘要：`/tmp/tingxu014-gates-verified.log`、`/tmp/tingxu014-build-verified.log`。曾将根测试与server子包并行导致固定3456端口冲突，串开后通过；不修改无关测试、不杀其他进程。既有React测试仍有act警告，未将其隐藏或宣称不存在。

### 未验证与准入阻塞

- T02/T12/T13：没有授权真实中文会议/说话人标注与独立holdout；CER/DER、稳定化回改降低30%、实际DOM P95、深浅色/字号/上滚真机QA和模型资源预算未验证。不能用215项确定性测试代替这些AC。
- T14（G2）：`gateway/src/asr/streamingAsrServer.ts:16–20`直接handleUpgrade并启动供应商任务，没有认证主体、会议租约或并发封顶绑定；本地fake upstream无凭据握手可重现这一既有边界。用户计费仍在会话结束按elapsedSeconds走既有路径；不能认为这就是双任务授权。需要独立评审补齐授权/并发/租约，并明确每会议分钟的供方预算。计划明确禁止本轮顺手重构商业控制面，因此不开启两个真实上游任务。
- T16（G2）：当前Rust事件只发base64 PCM，无源PTS/格式元数据，转换函数按值域猜Float32；没有耳机/外放真机对照。本轮只修改TS停止确认，未改变用户的混音或原生格式实现。
- G3/G4：真实模型/运行时/制品hash/许可、账号隔离落地路径、旧档案兼容和NFR预算未验证；不下载未知模型冒充验收、不写入新声纹档案、不宣称抢话恢复。
- 本轮完成M1核心确定性实现，M1真实质量验收及M2/M3/M4仍未完成；014保持进行中。

### Fortify Change Review

Code Changes Reviewed: 本轮ASR事件解析、FINISH/FINISHED、字幕与生命周期状态、原生停止确认；未对仓库做全量扫描。

Security Checks:
- Access Control: Missing Authorization Check
- Dynamic Code Evaluation: Unsafe Deserialization
- Privacy Violation / System Information Leak: External

| Category | Status | Location | Attack Path | Recommendation |
|---|---|---|---|---|
| System Information Leak: External | Fixed | `gateway/src/asr/streamingAsrServer.ts:172`、`src/audio/realStreamingAsrClient.ts:88` | 上游可变error_message经Gateway及客户端直接到UI，可能携带内部或会议信息 | 已改固定错误文案、不记录原始响应，并用PRIVATE_TRANSCRIPT负向断言验证 |
| Access Control: Missing Authorization Check | Flagged（既有准入缺口） | `gateway/src/asr/streamingAsrServer.ts:16–20` | 可连接网关的未认证调用者经WebSocket upgrade进入供应商任务，使用服务端凭据且无会议租约/并发绑定 | 独立评审并在upgrade前验证主体/有效会议租约及并发上限；未补齐不放行双轨 |

Fixes Applied: 错误响应脱敏、结构化字段校验、旧连接隔离；FINISH仅作用于当前连接，不接受用户指定任务ID或越权修改其他连接。

Residual Risk: 既有网关授权缺口已作为G2阻塞；无真实供应商/生产部署验证。当前检查不是Fortify扫描引擎结果；后续CI需执行正式SAST/SCA/DAST。

## 本机与真实ASR补充证据（2026-11-02，用户授权后）

用户随后授权在本机运行，并明确允许**仅合成测试语音**经本机Gateway发送至阿里云Paraformer，测试费用上限5元。此授权不含真实麦克风/会议音频云转写，不构成双轨商业授权门禁通过。下列记录更新上文“尚未调用真实供应商”的历史状态。

### 环境与桌面启动

- 设备：Mac mini / Apple M4 Pro / 48GB；macOS 27.0.1 / arm64。
- CoreAudio检测到外置麦克风、外置耳机、Mac mini扬声器、Microsoft Teams Audio虚拟设备；测试时默认输入外置麦克风、默认输出Mac mini扬声器，尚未切换用户默认设备。
- Swift辅助进程权限预检：麦克风authorization raw=3（authorized）、ScreenCaptureKit preflight=true；不能由此推定Tauri进程权限已实测。
- `rtk npm run tauri -- build --debug --bundles app` exit 0，生成`src-tauri/target/debug/bundle/macos/tingxu.app`，约30.84MiB；已通过原生UI工具打开并观察到登录窗口与空历史界面。未代登录、未发送短信、未绕过认证、未点击真实麦克风云转写。
- Debug包登录页空闲主进程5次抽样：RSS 101.8–102.1MiB，CPU最大观测0.0%。这是主进程短时诊断，不含WebView进程树、不代表release或30分钟录音性能；不能据此通过NFR-002。

### ScreenCaptureKit本机探针

独立Swift探针采用与现有采集相同的16kHz单声道请求，仅注册音频输出，运行约3秒：收到158个buffer、202240字节；真实ASBD为sampleRate=16000、channels=1、bits=32、formatID=lpcm、flags=41、bytesPerFrame=4；首末PTS跨度约3.14秒。

探针只统计元数据，不保留音频、不调用网络。它证明本机ScreenCaptureKit能输出带时间戳的32-bit音频，不能代替Rust/Tauri完整采集链路验证，也不代表声音非静音或多人识别精度。原生事件仍缺PTS/格式透传，T16保持部分证据已取得、未完成。

### 单任务真实云转写

使用macOS本地Tingting语音生成固定中文测试稿：8.9749375秒PCM16/16kHz/mono，加2秒静音。仅这段合成音频出设备，未采集或上传环境/会议声音。

| 端点 | 结果 | 判断 |
|---|---|---|
| 既有Docker 3201网关 | READY；19个interim；1个final；无protocolVersion；FINISH等待6.5秒无确认；最终只有首句 | 运行版本不含014 v2协议，不能用于新代码结束验收；保留服务，未重启或替换 |
| 当前源码隔离网关 | 只绑定127.0.0.1随机端口，使用现有本地ASR配置；READY；19个interim；2个final；protocolVersion=2；FINISHED outcome=complete；总耗时约11.48秒 | 新结束协议在真实供应商链路工作，结尾文本返回；非产品UI端到端与质量全量验收 |

当前源码final音频时间区间为0–2475ms、2475–9000ms，taskId存在。原稿40个字符（去Unicode标点/空白），编辑距离3，CER=7.5%；例如“听序→听旭”“最后一句→最后依据”。这只是**一个合成样本**，不能推断真实会议CER、DER或稳定化下降30%；模型错误与尾句排空问题分开记录。

共2个单上游任务，发送音频合计约21.95秒，没有双并发或自动重试；费用账单尚未核对，未声称实际扣费金额。临时隔离网关测试后已停止；原Docker服务保持原状。配置密钥只由本机进程读取并用于既有供应商鉴权，不输出、不另存到测试报告。

测试制品仅本机：`/tmp/tingxu014-machine-test/`（合成音频、fixture、两次事件结果、指标、debug主进程采样）；`/tmp/tingxu014-sck-probe.swift`为元数据探针。未提交生成音频或真实内容。首次未打包开发进程已停止，打包后的桌面登录窗口保留供用户操作。

### 下一步所需配合

1. 用户在已打开的听序测试窗口完成既有账号登录，不需要向助手发送手机号、验证码或密码。
2. 完整产品路径须对齐桌面端和新版网关；当前3201仍是旧服务。先准备隔离测试地址/配置方案，再验证实际应用，不能用改运行Docker替代本机测试授权。
3. 耳机与外放硬件路径各一次；真实说话人/抢话需2–3位参与者按固定稿轮流/重叠发言，或使用许可明确的真实中文多人测试语料。真实音频若需云识别，应另外明确授权对象/范围；当前5元授权只包含合成语音。
4. 会议租约/并发绑定、双任务成本上限和真实模型制品/资源预算仍属工程/产品准入问题，助手应继续准备方案与探针，不要求用户通过“多录一段音频”来解决这些问题。

## 登录后桌面采集验证与修复（2026-11-02）

用户确认“已登录”后，原生UI确认听序已登录。只读查看系统设置，`tingxu`麦克风权限开关已开启；未修改系统权限、音频默认设备或Docker服务。

### 网关隔离配置修复

发现三个实际运行地址未使用配置：工作台ASR、live-insights、meeting-chat写死localhost:3201，设置页网关输入仅为自身局部state。按RED→GREEN补充URL转换/HTTPS→WSS/非法协议拒绝、设置读写共享state、问答端点跟随配置测试；改为统一使用现有store.gatewayUrl。设置输入先保留草稿，失焦校验后应用，避免逐字符修改触发健康检查卸载页面。未新增配置项。

该单点修复为本计划T07/T08/T13隔离测试所需，增补写入边界：`src/components/views/SettingsView.tsx`及其既有测试（计划原列SettingsView路径按实际views目录纠正）。配置只在现有内存store生效，重启恢复原默认地址；测试结束未遗留指向临时服务的持久化配置。

### 本机UI与PCM证据

本机127.0.0.1:3214临时服务明确标`LOCAL_ONLY_REPLAY`，丢弃所有收到的二进制PCM，不保存内容、不连接云端；回放上一轮合成TTS真实ASR的事件，并在FINISH后延迟600ms追加“本地排空尾句测试。”及FINISHED complete。**这是产品UI/协议/设备采集验证，不是新的真实转写效果测试，不将回放字幕冒充麦克风识别。**

- 首轮桌面显示两段回放final；暂停后显示“正在完成最后一句”，随后第三段尾句出现，继续按钮解锁。接收端记录FINISH、3个final、连接关闭；该轮PCM=0，故未判采集通过。
- 首轮发现洞察仍走旧3201，至少一次合成文本洞察请求意外进入原LLM链路；未包含真实音频/会议正文。立即暂停，按上节统一地址；没有新增ASR付费任务。先前“本地回放服务不联网”描述仅适用于服务本身，不能据此声称旧客户端的所有下游均已隔离。
- AudioContext启动代码没有resume suspended状态。补充suspended音频上下文的失败断言，修复后采集11项测试通过。第二次debug包真实采集连接累计收到376个PCM块、1026480字节（16k/PCM16折合约32.08秒）；首轮0帧，修复后能出帧，与此修复一致，但未在WebView内直接采样state，不能把相关性写成所有零帧问题的唯一根因。
- 第二轮连接最终关闭、2段回放final，未收到FINISH；因此不算该轮“正常结束”验收。另有两次0帧短连接关闭。需继续检查页面健康探测/卸载与设备生命周期是否导致中断，不能用第一轮暂停成功掩盖这一限制。
- 临时接收端在测试后已停止；桌面最终观察到已登录首页、无归档测试记录。未点击结束归档，所以未发起本轮会议结算；UI倒计时期间余额曾暂减，重启从服务端刷新回原值。未改账本、未提交生产写操作。

本轮原生桌面AX界面和`/tmp/tingxu014-machine-test/ui-replay-report.json`共同构成证据；无原始麦克风音频保存。debug包已重新构建。真实多人/抢话、耳机/外放、独立双轨、真实神经声纹、30分钟资源和稳定化量化AC仍未完成。

最终补充：独立审查发现新增resume等待需有界，已补“resume永不完成→3.1秒后失败并释放track/context”的RED→GREEN，恢复超时设为3秒，清理定时器及失败图节点。最终`verify-gates.sh` exit 0，39套件/219项及Rust门禁通过；debug app重新打包成功，`git diff --check`通过。未重新宣称该最新超时分支已真机触发；WebView内无界恢复使用确定性测试验证，真实376块属于此前已成功恢复的分支。

同轮最后审查进一步补齐恢复失败时辅助Teams轨、设备监听、静音节点清理；使用两个独立主/辅助track复现辅助轨未停止的RED，再修复为两轨同步stop。最终39套件/219项与5门禁重新通过、debug包重新构建成功。该清理仅针对本轮新增超时失败路径，不改变原生混音或引入新模型。

### 本轮 Fortify Change Review 补充

Code Changes Reviewed: 配置统一到ASR/洞察/问答端点、URL协议转换、设置提交及AudioContext启动失败清理。

Security Checks:
- Dynamic Code Evaluation: Unsafe Deserialization
- Privacy Violation / System Information Leak: External

已检查：URL只接受HTTP/HTTPS并映射WS/WSS；无新增eval、动态shell或客户端密钥；未新增内容日志。配置变更通过现有设置入口，临时接收端仅绑定loopback。独立审查未发现配置转换的新增重大问题；其报告的恢复挂起已修复。真实采集音频仅发本机接收端并立即丢弃，没有新增云ASR任务。

Residual Risk: 首轮合成文本洞察因旧硬编码地址走原LLM链路，已统一地址并增加问答路由回归；没有真实内容泄漏证据。旧网关授权缺口、模型与长期资源门禁仍按上文阻塞，正式SAST/SCA/DAST未执行。
