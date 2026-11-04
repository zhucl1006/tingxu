# 听序（Tingxu）架构领域与接缝词汇表 (CONTEXT.md)

本文档定义听序全局架构词汇（Design Vocabulary）与限界上下文接缝（Seams）。所有重构与架构深化演进必须严格遵循本词汇表，严禁混淆概念。

---

## 1. 核心架构设计词汇 (Architecture Vocabulary)

- **模块 (Module)**：包含公开接口与隐藏实现的代码独立单元。
- **接口 (Interface)**：模块对外暴露的正式契约与类型签名。接口应当尽可能窄小克制。
- **实现 (Implementation)**：隐藏于接口之后、不被外部感知的具体逻辑代码。
- **深度 (Depth)**：实现价值与接口宽度的比值。
  - **深度模块 (Deep Module)**：接口极窄、背后封装丰富复杂细节与不变量的模块（极高性价比）。
  - **浅模块 (Shallow Module)**：接口几乎与实现等宽、或是纯粹直通传话的模块，应通过吸收或坍缩予以消除。
- **接缝 (Seam)**：模块间清晰的替换与切分界面。在接缝处，依赖项可以被无缝替换（如切换真实硬件与测试桩、切换桌面端与网页端）。
  - **准则**：*一个适配器为假想接缝，两个适配器方为真实接缝（One adapter = hypothetical seam, two = real）。*
- **适配器 (Adapter)**：在接缝处负责将特定外部系统、硬件驱动或第三方协议转换为内部统一模块接口的转换器。
- **杠杆比 (Leverage)**：一个窄接口为调用端提供的能力放大倍数（一次简单调用触发模块内部深度编排）。
- **局部性 (Locality)**：强内聚原则。相关的状态、算法与错误处理必须就地收敛在同一模块内；修改不引起无关联文件的涟漪式改动，Bug 集中于单一模块。
- **删除测试 (Deletion Test)**：检验模块是否浅薄的标准。若删除某模块仅使复杂度平移甚至散落各处，则为浅模块；若删除后复杂度在调用端集中爆发，则证明该模块具备沉淀价值。

---

## 2. 领域限界与接缝命名规范 (Domain Seams)

### 2.1 AI 网关与模型调度 (AI Gateway & Model Engine)
- **`OpenAiProtocolAdapter`**：深度协议适配模块。封装 OpenAI 兼容协议（包含 DeepSeek、Qwen 百炼）的 HTTP 请求构造、SSE 流式打字机分块解析、JSON 提取、容错降级与 Mock 行为。
- **`ResilientModelEngine` (原 ModelRouter 演进)**：深度容灾执行模块。统摄主备协议适配器，提供基于滑动窗口熔断器（Circuit Breaker）的统一故障转移与零感知热切备。

### 2.2 客户端通信层 (Client Network Adapter)
- **`TingxuClient`**：深度客户端网络通信契约模块。隐藏控制面与 AI Gateway 的主机地址、手机号验证码、Token 物理注入、HTTP 状态码映射与网络重试。拥有 `FetchHttpAdapter`（生产）与 `InMemoryMockAdapter`（单元测试）双适配器。

### 2.3 存储与数据主权仓储 (Persistence & Storage Repository)
- **`MeetingRepository`**：数据主权核心存储契约模块。遵循 Zero-Content 政策，严格保障本地优先。拥有 `TauriSqliteAdapter`（桌面端基于 Rusqlite 与 FTS5 全文索引、带声纹对称加密）与 `WebStorageAdapter`（测试与无 Rust 纯 Web 降级）双适配器。

### 2.4 声纹档案与聚类注册中心 (Speaker Registry)
- **`SpeakerRegistry`**：端侧声纹档案管理深度模块。封装 192/512 维向量 L2 归一化、余弦相似度阈值判定、声纹向量渐进加权融合、显式授权合规门禁与声纹更新事件派发。

### 2.5 音频捕获与流式分发会话 (Audio Capture Session)
- **`AudioCaptureSession`**：深度媒体输入捕获会话模块。整合主麦克风物理采集、系统内部音频免驱内录（ScreenCaptureKit / WASAPI）、连续抗混叠重采样、原子化分块落盘与 ASR WebSocket 流式推送，对外仅暴露极简会话控制。

### 2.6 会话状态与视图门面 (Meeting Session Facade)
- **`MeetingSession`**：为上层 React UI 视图提供的收敛会话状态契约。接口从上帝 Store 坍缩至仅保留高层生命周期控制（如 `start`, `pause`, `stop`, `updateDraft`），所有繁琐业务交由上述深度领域模块协同完成。
