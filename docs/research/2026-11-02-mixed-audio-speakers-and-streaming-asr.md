# 混音说话人识别与流式 ASR 稳定性调研

日期：2026-11-02。范围：当前工作树源码静态核对、一手资料调研、优化建议；不属于已批准的实施计划，不改变业务代码。

## 1. 结论

1. 同一音轨的多人**轮流说话**可以做说话人分段与聚类；**同时说话**需要重叠检测，若要恢复各自文字还需要语音分离或支持重叠语音的识别系统。声纹匹配本身不能拆开混音，也不能恢复已被会议软件抑制的声音。
2. 优先保留麦克风与系统音频的独立性，避免听序再次把本地与远端合成一轨；这解决本地/远端互相覆盖，不等于解决远端内部抢话。
3. 当前声纹实现不是计划中描述的 CAM++ 模型推理。应先补齐真实模型、干净样本筛选与时间轴，再评估阈值。
4. ASR 中间结果是可变假设，与最终结果不同是流式识别的正常行为。需要分别优化最终准确率、临时文字稳定度和最终结果呈现延迟，不能以冻结错误文字换取表面稳定。
5. 建议先解决链路与展示问题，再做本地分段/重叠检测，最后根据真实会议评测决定是否引入分离模型或第二遍识别。

## 2. 当前实现与直接影响

以下为本地工作树事实，核对基线 HEAD `c6c08cb`，包含用户尚未提交的 ScreenCaptureKit 等修改；不据此推断已发布二进制行为。

| 实现事实 | 位置 | 影响 |
|---|---|---|
| 麦克风与系统声音逐样点相加，超范围截断；最终只输出一条 PCM | `src/audio/realAudioCapture.ts` 的 `DualTrackAudioMixer.mixWithMic` 与 `onAudioChunk` | 原本可区分的两路来源丢失；同时发声可能削波，不是通过增加单声道声纹阈值就能解决 |
| 系统捕获按显示器过滤，排除窗口列表为空，输出单声道 | `src-tauri/src/media/system_audio.rs:116` | 当前不保证仅含 Teams；其他应用声音也可能进入识别，需实测并评估应用过滤 |
| Rust 提取器拼接频谱均值、频谱差分、自相关，共 192 维，没有加载神经网络权重；Cargo 无 ONNX 推理依赖 | `src-tauri/src/speaker/mod.rs:116`、`src-tauri/Cargo.toml` | 不能当成预训练 CAM++ 的能力；“维度相同”不代表特征空间相同 |
| TS 调 Rust 时只传前 32000 个样本 | `src/audio/speakerEmbeddingEngine.ts:230` | 16kHz 下只用前 2 秒，可能错过后续发言人切换，且完整句长仍可能参与权重计算 |
| ASR 最终句整体计算一个声纹并归给一个人 | `src/components/InMeetingWorkbench.tsx:853` | 一句跨两位说话人或包含抢话时无法表达真实归属 |
| 短句/无特征时可能继承上一位，部分新聚类置信度为固定值 | `src/engine/speakerClusterer.ts:150`、`:187`、`:212` | “对”“不是”等插话容易误归；输出 confidence 不能解释为经过校准的正确概率 |
| 时间戳切片不足时回退到最新尾部音频 | `src/components/InMeetingWorkbench.tsx:865` | FINAL 有网络/断句延迟，并不保证音频就在缓冲尾部；可能取到下一人的声音 |
| Gateway 固定 `paraformer-realtime-v2`，开启语义断句 | `gateway/src/asr/streamingAsrServer.ts:72` | 句子边界是语义边界，不能当作换人边界 |
| INTERIM 仅透传 text；FINAL 透传句起止时间但未透传字时间戳与任务标识 | 同文件 `result-generated` 分支 | 缺少关联、增量修订、字级归属与重连隔离所需信息 |
| 收到 FINAL 先清临时文字，再异步计算声纹，最后添加正文 | `src/components/InMeetingWorkbench.tsx:853`、`:886`、`:923` | 存在显示空档；多句异步推理没有显式排序，存在完成顺序影响显示顺序的风险，尚未运行复现 |
| 结束时客户端直接关 WebSocket，Gateway 随后才向上游发 finish-task | `src/audio/realStreamingAsrClient.ts`、`gateway/src/asr/streamingAsrServer.ts` | 上游补发尾句时下游已关闭，应补充优雅结束协议并验证尾句；不能将最后临时结果直接强制当 final |

`docs/plans/012-speaker-diarization-and-voiceprint.md` 将 CAM++ 与真机验收标记为完成，但当前源码与此不一致；`test/e2e/speaker-diarization.test.ts` 使用合成谐波，不构成真实 Teams 混音精度证据。本轮记录差异，不重写既有计划；进入实现前需明确以何种模型与真实验收标准交付。

## 3. 系统混音如何优化

### 3.1 先区分三种任务

- 说话人分段/聚类：确定哪些时间由同一个人说话，得到匿名 speaker ID。
- 身份识别：将合格的单人样本与经授权的本地档案匹配，才可能得到姓名。
- 语音分离：从重叠音频估计多路波形，再分别转写。分离输出编号不是稳定身份，也不是 Teams 参与者 ID。

ScreenCaptureKit 的采集对象是应用/系统媒体输出，不提供 Teams 内部参会人身份协议。应用级过滤只能隔离其他应用，不能让已经混合的 Teams 声音恢复成每人独立音轨。[Apple WWDC22：Meet ScreenCaptureKit](https://developer.apple.com/videos/play/wwdc2022/10156/)

Teams 官方媒体 SDK 的 `ReceiveUnmixedMeetingAudio` 可以接收最多四个活跃发言者的 unmixed buffers，但属于 application-hosted media bot 路径，需要 .NET 媒体库及 Azure Windows Server 等部署条件，不是 macOS ScreenCaptureKit 的开关；同一账号/设备旁的多人仍然混在该轨中。这与当前无需机器人入会的定位有明显差异，应作为独立集成评估。若未来考虑持久化/转写，还须核对具体 API 的录制状态通知、权限与适用条款，不能仅凭能取到音频便认定可直接接入。[SDK 字段](https://microsoftgraph.github.io/microsoft-graph-comms-samples/docs/bot_media/Microsoft.Skype.Bots.Media.AudioSocketSettings.html)、[托管要求](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/calls-and-meetings/requirements-considerations-application-hosted-media-bots)、[媒体处理约束](https://learn.microsoft.com/en-us/graph/cloud-communications-media)

### 3.2 推荐主线：保留两轨，再处理远端内部多人

建议数据流：

```text
MIC    → 独立采样时间轴/缓冲 → ASR → 本地来源 + 可选说话人识别
SYSTEM → 独立采样时间轴/缓冲 → ASR → 分段/重叠检测 → 本地声纹聚类
                         两路结果按会议单调时间轴合并
```

“MIC”也可能是会议室多人，不能无条件标成唯一的“我”。两路应明确 source ID，不以左右声道猜测身份。若云端 ASR 不支持当前协议的多轨，可评估两个独立任务，但须同时测量供应商计费、并发、时长预占/扣减，不能悄悄把双连接算成双倍会议用量。

必须处理：设备重采样与漂移、丢帧/队列积压、ASR task 起点与会议时间轴映射、重连 epoch、暂停恢复；按音频 PTS/样本序号建立映射，不能按 FINAL 到达时刻猜音频位置。扬声器外放时 MIC 会再次收到远端声音，需要参考系统轨的回声消除/相关性检测，否则分轨会产生重复转写。耳机模式可作为先行评测场景。

### 3.3 远端轮流讲话

1. 使用真正的预训练 speaker embedding。可先评估 3D-Speaker CAM++ 与 ERes2Net 的 ONNX 推理；特征预处理必须与模型训练约定一致。官方仓库提供相关模型与分段流水线。[3D-Speaker](https://github.com/modelscope/3D-Speaker)
2. 增加 VAD 与说话人变化检测，用滑动窗口而非整句单特征；从非重叠、有足够语音时长的片段抽取多个 embedding，挑选或聚合高质量样本。
3. diarization 时间段与 ASR 字时间戳对齐；句内换人时拆分展示。只用句起止时间无法可靠确定每个字归谁。[Paraformer 服务端字段](https://help.aliyun.com/zh/model-studio/paraformer-server-events)
4. 不确定时允许“未确定/远端发言”，避免强制继承上一位；只用高质量非重叠样本更新聚类质心和声纹档案。阈值通过真实语料校准，按模型版本隔离旧档案，不能直接沿用旧 192 维向量。
5. 将“文字已定稿”和“说话人待确认”分开。文字可先落入稳定位置，再补充标签，避免阻塞正文。

### 3.4 远端同时讲话

近期建议首先实现 overlapped speech detection：识别抢话区间，显示“多人重叠/归属待确认”，不把混合声纹写进某个人的长期档案。这改善归属可靠性，不会自动恢复漏掉的另一人文字。

进阶可评估重叠感知 diarization，输出多个同时活动的 speaker；pyannote 的普通 diarization 与 exclusive diarization 需区分，后者每时刻只保留一个说话人的视图，便于对齐文字，但不能证明重叠内容被完整恢复。[pyannote 官方说明](https://www.pyannote.ai/blog/overlapping-speech-and-speaker-separation-the-hardest-problem-in-diarization)

如果业务要求“两人抢话都转出来”，再做局部语音分离 Spike：只对重叠片段及前后上下文运行本地分离，各输出分别 ASR，再用干净声纹锚点恢复身份和去重。连续语音分离是独立研究任务，输出通道需要跨窗口追踪；可能出现串音、分离伪影、漏字与身份交换。[Microsoft Research CSS](https://www.microsoft.com/en-us/research/publication/low-latency-speaker-independent-continuous-speech-separation/)

不承诺从任意单声道混音稳定恢复所有人。三人以上重叠、同音色、压缩、会议软件降噪已经抑制弱声时尤其困难。先验证真实 Teams 音频的文字与归属改善，避免仅凭分离后的试听效果上线。

实现选型上，sherpa-onnx 提供分段+embedding+聚类的**离线** diarization API，可用于本地会后或滑动窗口原型，不应直接宣称它是现成的稳定实时流水线。[官方 API](https://k2-fsa.github.io/sherpa/onnx/c-api/html/speaker_diarization.html)

## 4. 临时文字与最终文字差异如何优化

### 4.1 哪些差异正常，哪些需要排查

中间假设只见到前缀音频；后续上下文、断句、标点、专有名词与数字规范化可能改变结果。final 表示供应商本轮句子结束，不等于文字绝对正确。

用同一段已授权的本地测试音频、相同 ASR task 的事件序列区分：上游已改写、Gateway 转换错误、前端关联/排序错误。测试文本与音频保存在本地；生产遥测只统计延迟、字符数、修订次数与错误类型，不记录正文、音频或声纹。

### 4.2 展示稳定化：保留修订能力

建议逻辑：`可变草稿 → 较稳定前缀 + 可变尾部 → 供应商最终文本`。

参考机制：AWS 提供 partial-result stabilization 与逐项 `Stable`；Google 提供 `stability` 与 `isFinal`，其中稳定度不等于识别正确率。它们说明显示稳定化有成熟协议设计可借鉴，但这些字段不能直接套到当前 Paraformer 接口，也不构成更换供应商的建议。[AWS partial results](https://docs.aws.amazon.com/transcribe/latest/dg/streaming-partial-results.html)、[Google StreamingRecognitionResult](https://docs.cloud.google.com/speech-to-text/docs/reference/rest/v2/StreamingRecognitionResult)

- 有供应商稳定标记时优先利用；没有时，可对连续若干次假设做最长公共前缀比较，结合时间窗口判断“较稳定”。这是客户端启发式，不能作为最终正确的证明。
- 从连续 2–3 次一致、约 300–600ms 未变开始实验；刷新间隔可从 100–200ms 开始。这些均为待测参数，不是厂商 SLA 或确定最优值。
- 最新尾部采用较弱视觉强调，仅更新实际变化的范围，避免整段闪动、整块呼吸动画与连续拉动滚动位置。
- final 若推翻较稳定前缀，仍必须接受正确修订；不能静默保留旧错字，也不能把“较稳定”当成用户确认。
- 草稿不进正式逐字稿、导出、搜索或洞察；当前洞察从 FINAL 路径触发，这一隔离应保留。人工确认/编辑的洞察后续只能生成待复核修订。

### 4.3 关联与异步时序

统一事件至少应能表达：task/epoch、source、utterance ID、修订序号、音频起止时间、text、final 状态，以及可选的字时间戳/厂商稳定字段。供应商缺失的字段由适配层明确生成或标缺失，不伪造置信度。

按句子更新：FINAL 只能替换同一句草稿；已经 final 的句子不能被迟到的 interim 回退；重复 final 幂等；重连后旧 epoch 的事件不得影响新会话。WebSocket 单连接保序，但异步 embedding、重连与多轨合并仍需防护。

FINAL 到达时立即在原位置显示最终文字并标“说话人识别中”，声纹异步结果再按稳定 segment ID 补齐；对聚类的状态更新保持音频顺序。ID 不再依赖推理结束时的 `Date.now()`；生命周期切换后丢弃旧会话推理结果。

结束流程：先停止新音频、排空队列、通知上游结束、等待剩余 FINAL 与结束确认（有界超时）、再关连接。超时保留明确的未定稿状态，不强制把草稿升格。

### 4.4 提高最终准确率与控制断句

先用相同测试集对照当前语义断句与 VAD 断句。Paraformer 官方说明：`semantic_punctuation_enabled=true` 使用语义断句；关闭后才使用 VAD，此时 `max_sentence_silence` 等参数才生效。不要在当前配置下仅调静音阈值。[客户端事件](https://help.aliyun.com/zh/model-studio/paraformer-client-events)

可评估词表热词、明确中英文等 language hints、正确 PCM 格式和采样率、丢帧与削波治理；热词只解决术语偏置，不能恢复重叠中已缺失的声音，也可能引入过度偏置。会议专有词表不应未经授权进入供应商长期词库。

最终仍不够准确时再比较：其他实时模型，或“低延迟第一遍 + 句后高精度第二遍”。第二遍应可追溯、版本化、只复核低置信/重叠/术语片段，并处理重复计费、额外延迟、端侧算力与瞬态云处理约束；不引入云端录音存储、可公开下载音频链接或会议正文日志。不要让 LLM 根据语义猜测原话。

FunASR 开源 runtime 提供 online/offline/2pass 模式，可用作双遍原型参考；它不是当前 DashScope 接口已开放同名参数的证明。第二遍纠错可能让临时结果与最终结果差别更大，因此必须先建立可修订展示。[FunASR 官方 runtime 教程](https://github.com/modelscope/FunASR/blob/main/runtime/docs/SDK_tutorial_online_zh.md)

## 5. 建议顺序与验收

| 阶段 | 优先工作 | 衡量结果 |
|---|---|---|
| P0 基线 | 获取授权的中文真实会议，建立本地事件回放；确认文档与模型实现差异 | 具备标注的干净、压缩、短应答、抢话、延迟 FINAL 测试集 |
| P1 链路与体验 | 保留来源与时间轴、解决 FINAL 展示等待、句子关联、排序、优雅结束；对照断句模式 | 无正文空档/错序/重复/尾句丢失回归；临时修订次数与延迟可量化 |
| P2 识别基础 | 真实 embedding、单人样本质量门槛、分段/字时间对齐、不确定回退、重叠检测 | 非重叠归属提升，错误实名率下降，档案不受重叠样本污染 |
| P3 增强评估 | 局部分离、会后本地复核或第二遍识别 | 重叠片段文字与归属均有净收益，实时率/CPU/内存/成本可接受 |

P1/P2 可以按依赖拆分推进；表格是优先级建议，不是已批准任务或工期承诺。

验收分别统计：中文 CER（统一标点/数字规范后比较）、DER（明确是否计重叠与边界容忍）、按说话人归属的字错率、错误实名率与未确定比例、重叠检测召回/误报、临时文本修订字符数与已展示前缀回改率、首字/最终结果/标签延迟的 P50/P95、实时因子/CPU/内存/ASR 实际费用。必须把“减少强行归属”和“确实提高识别”分开统计，避免用大量未确定标签掩盖精度问题。

测试矩阵至少包含：2–5 人轮流发言；2 人重叠与极短应答；中文/中英术语；耳机/外放回声；远端共用一个麦克风；其他应用通知音；网络延迟/重连/重复结果；停止时仍有草稿；长句内部换人；人工编辑与已确认洞察保护。合成音频用于确定性回归，真实会议用于模型能力判断。

本轮未跑识别精度、性能或线上复现，未将任何真实会议内容上传第三方，未改业务源码。后续属于跨采集/协议/模型/UI 的 Level 2/3 开发，应先形成并确认 `docs/plans/*.md`，核心逻辑按 TDD 实施。
