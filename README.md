<div align="center">

# 🎙️ 听序 (Tingxu)

**极简、无感、隐私至上的开源个人 AI 会议助手**  
*Local-First, Dual-Track Capture, Bring Your Own Key (BYOK)*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-lightgrey.svg)]()
[![Tauri](https://img.shields.io/badge/Tauri-v2.0-orange.svg)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-Edition%202021-red.svg)](https://www.rust-lang.org/)

[功能特性](#-核心特性) • [架构设计](#-双模架构设计) • [快速开始](#-快速上手byok-单机模式) • [配置指南](#-模型与-asr-配置指南) • [开发构建](#-本地开发与构建) • [路线图](#-开发路线图)

</div>

---

## 💡 为什么做「听序」？

市面上的会议记录工具（如飞书妙记、腾讯会议 AI、各家录音笔软件）往往存在三大痛点：
1. **必须拉入会议机器人**：在跨公司商务沟通、高管闭门会、面试或保密技术评审中，向会议室注入“第三方录音机器人”非常尴尬，甚至直接违反企业合规规定；
2. **隐私与数据主权问题**：会议录音和全量逐字稿必须上传至第三方厂商云端服务器，商业机密与个人隐私存在泄漏风险；
3. **会后才出结果，无法会中协助**：传统工具通常是“会后漫长转写”，无法在激烈的多方讨论中动态提醒“遗漏待办”、“未确认结论”与“关键数字承诺”。

**听序（Tingxu）** 专为个人办公打造：
- **不入会、不打扰**：纯本地物理免驱捕获麦克风与系统声音，无需邀请机器人；
- **单机可用（BYOK）**：填入自己的 API Key（如阿里云百炼、DeepSeek 等），无需部署复杂的后端服务器，开箱即用；
- **绝对数据主权（Local-First）**：录音切片、逐字稿正文、会议卡片和手记**100% 存放在本机 SQLite**，零内容强制上云；
- **边开会边整理**：提供“实时洞察看板 + 本场问答 + 双轨逐字稿”双栏工作台，会中动态对齐结论与行动项。

---

## ✨ 核心特性

- 🎧 **双轨免驱原生内录（No Bot, No Driver）**
  - **macOS**：原生基于 Apple `ScreenCaptureKit`，绕过 BlackHole 等虚拟声卡驱动，直接内录会议软件扬声器；
  - **Windows**：基于原生 `WASAPI Loopback`，底层直接捕获系统渲染流；
  - **物理双轨打标**：麦克风（“我”）与扬声器（“对方”）在硬件层物理区隔，从源头杜绝角色混淆。
- ⚡ **单机免部署开箱即用（BYOK & DeepSeek 全家桶 One-Key）**
  - **One-Key 全家桶一钥驱动**：默认支持仅填入 **1 个 DeepSeek API Key**，即可同步驱动 `deepseek-flash`（1M 上下文多模态）/ `deepseek-v4-pro` 快慢分级 `thinking` 推理、双轨独立 VAD 云端语音识别（`/v1/tools/asr`，限时 0.39 元/小时）、会前/会中无状态文档与截图 OCR（`/v1/tools/ocr`）、受控联网查证（`deepseek_web_search` / `deepseek_read_url`）以及会后纪要 TTS 语音播报（`/v1/tools/tts`），并内置北京时间峰谷/缓存精准人民币账单统计；
  - **语音识别多轨自由**：除 DeepSeek 云端 ASR 外，既支持阿里云百炼（DashScope ASR），也支持直连本地 Faster-Whisper / Sherpa-ONNX 端点或内嵌轻量 SenseVoice 离线模型，实现 100% 断网可用；
  - **大模型多端适配**：支持 DeepSeek 全家桶、通义千问，以及标准 OpenAI 兼容协议（支持接入 Ollama 本地离线大模型、Kimi、智谱 GLM、硅基流动等）；
  - 零外部数据库或后端服务依赖，无需注册登录，个人下载即用。
- 🛡️ **Zero-Content 本地隐私保障**
  - 会议标题、音视频切片、逐字稿与纪要全部存放在本地嵌入式 SQLite（支持全文检索 FTS5）；
  - 你的私有 API Key 安全保存在本地沙箱，绝不上报或外泄。
- 📊 **会中双栏工作台（In-Meeting Workbench）**
  - **左侧看板（54%）**：AI 实时增量提取“待办行动项（Action Items）”、“达成的关键结论（Decisions）”与“待澄清议题”；
  - **实时洞察降费控频**：支持「⚡ 手动按需提炼」、「⏱ 定时自动」与「⏸ 完全关闭」三种模式，避免长时间开会持续消耗 Token 算力；
  - **右侧逐字稿（46%）**：双轨实时滚动字幕，一键点击依据瞬间居中高亮溯源，绝无大模型幻觉；
  - **人工保护机制（Human Protection）**：已确认或手动修改的结论受强保护，后续讨论即便产生事实冲突，也只生成“待复核修订”卡片，绝不暴力算法覆盖。
- 💊 **42px 极简微型悬浮胶囊（Floating Pill）**
  - 会议进行中可随时收缩为 42px 贴边迷你胶囊悬浮条；
  - 实时显示录音跳动与呼吸灯，一键切换回主看板，绝不遮挡 Zoom / Teams / 腾讯会议共享屏幕。
- 📝 **会后高精纪要与协同问答**
  - 会后自动生成全局纪要、议题脉络与责任人矩阵；
  - 内置 Copilot：针对本场会议任意提问（“刚才张总说的 Q4 交付时间是几号？”），秒级精准定位原文。

---

## 🏛️ 极简单机闭环架构 (Local-First Architecture)

听序专注于为个人办公提供极简、纯净、无任何外部服务端依赖的单机工具体验：

```
┌────────────────────────────────────────────────────────────────────────┐
│                        听序桌面客户端 (Tauri 2.0 / Rust)                │
│                                                                        │
│   ┌─────────────────────┐                 ┌────────────────────────┐   │
│   │   React 18 前端     │                 │   Rust 原生媒体与模型  │   │
│   │ ┌─────────────────┐ │                 │ ┌────────────────────┐ │   │
│   │ │ 会中双栏工作台  │ │                 │ │ ScreenCaptureKit   │ │   │
│   │ ├─────────────────┤ │                 │ │ WASAPI Loopback    │ │   │
│   │ │ 洞察降费控频条  │ │                 │ ├────────────────────┤ │   │
│   │ ├─────────────────┤ │                 │ │ 双轨环形缓冲 16kHz │ │   │
│   │ │ 微型悬浮胶囊条  │ │                 │ ├────────────────────┤ │   │
│   │ ├─────────────────┤ │                 │ │ SenseVoice 本地模型│ │   │
│   │ │ 本地设置 (BYOK) │ │                 │ │ (~/.tingxu/models) │ │   │
│   │ └─────────────────┘ │                 │ └────────────────────┘ │   │
│   └──────────┬──────────┘                 └──────────┬─────────────┘   │
│              │                                       │                 │
│              ▼                                       ▼                 │
│      ┌───────────────┐                       ┌───────────────┐         │
│      │ 本地 SQLite   │                       │ 本地音频切片  │         │
│      │ (FTS5 全文检) │                       │ (原子化落盘)  │         │
│      └───────────────┘                       └───────────────┘         │
└──────────────┬───────────────────────────────────────┬─────────────────┘
               │                                       │
      ┌────────┴──────────────┐               ┌────────┴────────────────┐
      ▼                       ▼               ▼                         ▼
【本地离线 ASR（0 费用）】 【云端 ASR（BYOK）】 【本地离线 LLM（0 费用）】 【云端 LLM（BYOK）】
• Faster-Whisper (HTTP)  • 阿里云百炼 DashScope • 本地 Ollama (qwen2.5)   • DeepSeek-V3
• Sherpa-ONNX (WS)       • 实时语音转写 WebSocket                           • 通义千问 Qwen
• 100% 离网断网可用      • 用户自备私钥直连      • 100% 离网数据不出机     • 用户自备私钥直连
```

---

## 🚀 快速上手（BYOK 单机模式）

### 1. 下载安装应用
前往 [Releases 页面](https://github.com/zhucl1006/tingxu/releases) 下载适用于你系统的安装包（macOS `.dmg` / Windows `.exe` / `.msi`），安装后即可直接运行。

> **macOS 开源版首次启动与权限提示**
> - 开源免费分发包默认使用免费 **Ad-Hoc 完整封签**（未购买 Apple 付费商业公证）。若下载后首次打开提示“无法验证开发者”或“已损坏”，在终端执行一次即可正常启动：
>   ```bash
>   xattr -cr /Applications/tingxu.app
>   ```
> - 覆盖升级新版本后，如果「系统设置 → 隐私与安全性 → 屏幕与系统音频录制」中听序开关已开但仍提示未生效，请先选中 `tingxu` 点击左下角 **`-` 移除旧记录**，再点击 **`+` 重新添加 `/Applications/tingxu.app`**，完全退出（`Cmd+Q`）后重新打开即可。

### 2. 配置语音识别与大模型
首次启动后，点击左侧导航栏的 **「设置（Settings）」**：

1. **方式一（推荐：DeepSeek 全家桶 One-Key 一键配置）**：
   - 在「模型与语音设置」点击 **「预设: DeepSeek 全家桶 (一钥通)」**；
   - 仅需填入 **1 个 DeepSeek API Key**（`<YOUR_DEEPSEEK_API_KEY>`），即可自动共享驱动 `deepseek-flash` 快慢分级推理、`/v1/tools/asr` 双轨云端语音识别（0.39 元/时）、`/v1/tools/ocr` 资料解析与 `/v1/tools/tts` 纪要朗读；
2. **方式二（灵活组合本地离线或第三方 ASR/LLM）**：
   - **本地离线 ASR（0 费用）**：选择「本地独立端点 (Faster-Whisper / Sherpa)」或内嵌轻量 `SenseVoice` 离线模型，100% 断网可用；
   - **阿里云百炼 ASR**：服务商选择 `阿里云百炼 (DashScope)` 并填入 DashScope Key；
   - **多端大模型（LLM）**：支持 `deepseek-flash` / `deepseek-v4-pro`、通义千问 `qwen-plus` 或本地 Ollama (`http://localhost:11434/v1`, `qwen2.5:7b`)；
3. 点击 **「测试连接」**，指示灯变绿即配置完成！

### 3. 开始你的第一场会议
1. 点击左上角 **「开始新会议」**（会前或会中可按需点击「📄 资料 OCR」无状态导入议程 PDF/截图注入上下文）；
2. 授予麦克风与系统音频捕获权限；
3. 会议中你可以看到左右双栏实时滚动的逐字稿与智能提取的决策待办（Copilot 支持按需点亮「🌐 联网查证」）；
4. 会中洞察栏支持随时切换模式（⚡ 手动按需提炼 / ⏱ 定时自动 / ⏸ 关闭）以控制 API 费用；
5. 点击右上角悬浮窗按钮，可将听序缩小为 42px 迷你胶囊贴在屏幕边角；会后纪要支持「🔊 朗读纪要」与精确人民币峰谷账单查看。

---

## 🔑 模型与 ASR 配置指南

| 服务类型 | 服务提供商 / 引擎 | 部署方式 | 官网 / 开源项目 | 推荐端点与模型 | 费用与网络 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **云端全家桶** | **DeepSeek 全家桶 (推荐)** | 云端 SaaS | [platform.deepseek.com](https://platform.deepseek.com) | `deepseek-flash` / `deepseek-v4-pro` + `/v1/tools/asr` + `ocr` + `tts` | **单 Key 复用**（ASR 0.39 元/时 + 峰谷/缓存计费） |
| **本地 ASR** | **Faster-Whisper** | 本地 Python / Docker | [faster-whisper-server](https://github.com/fedirz/faster-whisper-server) | `http://127.0.0.1:8000/v1/audio/transcriptions` | **免费 / 100% 离线** |
| **本地 ASR** | **Sherpa-ONNX** | 本地可执行文件 | [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | `ws://127.0.0.1:6006` | **免费 / 100% 离线** |
| **云端 ASR** | **阿里云百炼** | 云端 SaaS | [aliyun.com/product/bailian](https://www.aliyun.com/product/bailian) | 实时语音转写 (DashScope) | 赠送额度 / 按量计费 |
| **本地 LLM** | **Ollama** | 本地运行 | [ollama.ai](https://ollama.ai) | `qwen2.5:7b` (`http://localhost:11434/v1`) | **免费 / 100% 离线** |
| **云端 LLM** | **通义千问 Qwen** | 云端 SaaS | [dashscope.aliyun.com](https://dashscope.aliyun.com) | `qwen-plus` / `qwen-2.5-72b` | 用户自备 Key 直连 |

### 🌟 DeepSeek 全家桶（One-Key 一钥通）能力详解

听序深度适配了 DeepSeek 官方发布的「全家桶应用 API」，只需在 **「系统设置 → 快速填充：DeepSeek 全家桶」** 中填入 **1 个 DeepSeek API Key**，即可解锁全链路多模态会议辅助：

1. **快慢双模分级推理（Flash + Thinking / V4-Pro）**
   - **会中极速响应**：实时同音字纠偏与增量洞察固定采用非思考模式的 `deepseek-flash`（1M 超长上下文），结合固定前缀吃满 Prompt Cache 缓存命中折扣（空闲时段低至 `0.02 元/百万 Tokens`）；
   - **会后深度纪要**：结束会议生成全局总结时，默认自动开启 `thinking: { type: "enabled" }` 深度思考推理（或一键切换 `deepseek-v4-pro`），一次性通读数小时完整逐字稿提炼高精决策与待办。
2. **物理双轨独立 VAD 云端语音转写（`/v1/tools/asr`）**
   - 麦克风（`我`）与系统内录（`远端参会者`）分别拥有独立的智能 VAD 自然断句缓冲，双人同时发言不串轨；
   - 经 Tauri Rust 原生 HTTPS (`native-tls`) 免 CORS 通道直连，限时优惠 `0.39 元/小时`（滤除静音后 1 小时会议实付仅约 **0.25 元**）。
3. **会前/会中无状态资料与截图 OCR（`/v1/tools/ocr`）**
   - 在会中工作台点击 **「📄 资料 OCR」** 即可导入议程 PDF、PPT 或投屏截图；文件采用无状态接口解析后仅保存在本机内存/SQLite 作为背景锚点，**不在云端留存文件**，大幅提升专有名词与架构术语识别准确度。
4. **受控外部联网查证（Opt-in Web Search & Read URL）**
   - 严格恪守 `Zero-Content` 隐私红线，联网搜索**默认关闭**；仅当你在会中或会后 Copilot 主动点亮 **「🌐 联网查证」** 开关时，才按需挂载 `deepseek_web_search` 与 `deepseek_read_url` 核查外部概念或解读网页链接。
5. **会后纪要语音朗读（`/v1/tools/tts`）与本地精准人民币账单**
   - 在会议总结页点击 **「🔊 朗读纪要」**，支持 `Stella`（清亮女声）与 `Tide`（沉稳男声）自然播报综述、决策与待办；
   - 内置北京时间工作日峰谷电价、缓存命中率及 ASR/OCR/TTS/Search 工具计费引擎，单机模式下也可在「AI 成本明细」查看精确到 `￥0.0001` 的真实人民币账单。

---

## 🛠️ 本地开发与构建

### 前置环境要求
- **Node.js** $\ge 18$
- **Rust** $\ge 1.75$ (`rustup update stable`)
- **平台依赖**：
  - macOS: Xcode 命令行工具 (`xcode-select --install`)
  - Windows: C++ 生成工具 (Visual Studio Build Tools)

### 1. 安装前端与桌面端依赖
```bash
# 克隆仓库
git clone https://github.com/your-username/tingxu.git
cd tingxu

# 安装根目录依赖
npm install
```

### 2. 启动桌面端调试
```bash
# 启动 Vite 前端 + Tauri 桌面窗口
npm run tauri dev
```

### 3. 运行质量门禁与测试
项目遵循严格的工程质量门禁体系（Secrets 防泄漏、文档完整性、TypeScript/Rust 语法类型、Vitest 核心单元测试、QA data-testid 覆盖）：

```bash
# 运行全套 5 大自动化门禁
bash scripts/verify-gates.sh
```

### 4. 打包分发安装包
```bash
# 构建桌面安装包 (.dmg 或 .exe)
npm run tauri build
```
打包产物位于 `src-tauri/target/release/bundle/`。

---

## 🗺️ 开发路线图 (Roadmap)

- [x] **v0.2.0**
  - [x] macOS `ScreenCaptureKit` 免驱内录与 WASAPI Loopback 音频捕获
  - [x] 流式 ASR 直连与双轨硬件级物理打标
  - [x] 双栏工作台、微型悬浮胶囊窗、人工保护机制
  - [x] Local-First SQLite 存储与 FTS5 全文检索
  - [x] 单机化 BYOK (Bring Your Own Key) 支持与 GitHub 全球开源
- [x] **v0.3.0 ~ v0.3.7**
  - [x] 本地离线 ASR 双轨演进（直连 Faster-Whisper HTTP / Sherpa-ONNX WS）与智能 VAD 自然断句
  - [x] SenseVoice-Small 本地轻量模型沙箱目录与状态探测
  - [x] 彻底单机免登录体验，移除云端控制面强依赖
  - [x] 实时洞察算力降费控频机制（手动按需 / 定时自动 / 完全关闭）
  - [x] **DeepSeek 全家桶 One-Key 全栈集成**（`deepseek-flash`/`v4-pro` 快慢分级 `thinking` 推理、双轨独立 VAD `/v1/tools/asr`、无状态 `/v1/tools/ocr` 资料注入、受控联网查证、`/v1/tools/tts` 纪要播报与本地峰谷人民币账单）
- [ ] **v0.4.0（计划中）**
  - [ ] 导出更多格式（PDF、Markdown 批量导出、Notion / 飞书文档一键同步）
  - [ ] 跨平台音频降噪（基于 RNNoise 端侧降噪插件）
  - [ ] 说话人声纹注册与高精聚类声纹库（Speaker Identification）进阶
  - [ ] 本地 SenseVoice-Small 原生推理引擎打包集成

---

## 🤝 参与贡献

欢迎社区开发者贡献代码或提出想法！
1. Fork 本仓库并新建分支：`git checkout -b feat/your-feature-name`
2. 提交代码前确保通过本地门禁：`bash scripts/verify-gates.sh`
3. 遵循严格 TDD 流程（编写失败测试 $\rightarrow$ 编写最小实现 $\rightarrow$ 重构）
4. 提交 Pull Request，并在描述中清晰阐述设计意图。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源发布。会议数据完全属于你自己，自由使用、修改与分发。
