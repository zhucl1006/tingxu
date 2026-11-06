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
- ⚡ **单机免部署开箱即用（BYOK - Bring Your Own Key）**
  - 支持直接配置阿里云百炼（DashScope ASR & 通义千问）和 DeepSeek 等常用主流 Provider；
  - 兼容标准 OpenAI 协议（支持接入 Ollama 本地离线大模型、月之暗面 Kimi、智谱 GLM、硅基流动等）；
  - 零外部数据库或后端服务依赖，个人下载即用。
- 🛡️ **Zero-Content 本地隐私保障**
  - 会议标题、音视频切片、逐字稿与纪要全部存放在本地嵌入式 SQLite（支持全文检索 FTS5）；
  - 你的私有 API Key 安全保存在本地沙箱，绝不上报或外泄。
- 📊 **会中双栏工作台（In-Meeting Workbench）**
  - **左侧看板（54%）**：AI 实时增量提取“待办行动项（Action Items）”、“达成的关键结论（Decisions）”与“待澄清议题”；
  - **右侧逐字稿（46%）**：双轨实时滚动字幕，一键点击依据瞬间居中高亮溯源，绝无大模型幻觉；
  - **人工保护机制（Human Protection）**：已确认或手动修改的结论受强保护，后续讨论即便产生事实冲突，也只生成“待复核修订”卡片，绝不暴力算法覆盖。
- 💊 **42px 极简微型悬浮胶囊（Floating Pill）**
  - 会议进行中可随时收缩为 42px 贴边迷你胶囊悬浮条；
  - 实时显示录音跳动与呼吸灯，一键切换回主看板，绝不遮挡 Zoom / Teams / 腾讯会议共享屏幕。
- 📝 **会后高精纪要与协同问答**
  - 会后自动生成全局纪要、议题脉络与责任人矩阵；
  - 内置 Copilot：针对本场会议任意提问（“刚才张总说的 Q4 交付时间是几号？”），秒级精准定位原文。

---

## 🏛️ 双模架构设计 (Dual-Mode Architecture)

听序采用模块化接缝（Seam）设计，支持**单机本地模式**与**云端增援模式**灵活共存：

```
┌────────────────────────────────────────────────────────────────────────┐
│                        听序桌面客户端 (Tauri 2.0 / Rust)                │
│                                                                        │
│   ┌─────────────────────┐                 ┌────────────────────────┐   │
│   │   React 18 前端     │                 │   Rust 原生媒体层      │   │
│   │ ┌─────────────────┐ │                 │ ┌────────────────────┐ │   │
│   │ │ 会中双栏工作台  │ │                 │ │ ScreenCaptureKit   │ │   │
│   │ ├─────────────────┤ │                 │ │ WASAPI Loopback    │ │   │
│   │ │ 微型悬浮胶囊条  │ │                 │ ├────────────────────┤ │   │
│   │ ├─────────────────┤ │                 │ │ 双轨环形缓冲       │ │   │
│   │ │ 本地设置 (BYOK) │ │                 │ │ (RingBuffer 16kHz) │ │   │
│   │ └─────────────────┘ │                 │ └────────────────────┘ │   │
│   └──────────┬──────────┘                 └──────────┬─────────────┘   │
│              │                                       │                 │
│              ▼                                       ▼                 │
│      ┌───────────────┐                       ┌───────────────┐         │
│      │ 本地 SQLite   │                       │ 本地音频切片  │         │
│      │ (FTS5 全文检) │                       │ (原子化落盘)  │         │
│      └───────────────┘                       └───────────────┘         │
└──────────────┬─────────────────────────────────────────────────────────┘
               │
      ┌────────┴──────────────────────────┐
      ▼                                   ▼
【模式 A：单机 BYOK 模式（默认）】   【模式 B：云端托管增援模式（可选）】
  直连第三方服务商 / 本地模型           企业自建 / 托管部署
  • DashScope 实时 ASR                 • tingxu-gateway (AI 网关)
  • DeepSeek / Qwen / Ollama           • tingxu-server (控制面与统付)
  • 零服务端依赖，极简免费             • 统一采购分发、集中额度管理
```

---

## 🚀 快速上手（BYOK 单机模式）

### 1. 下载或打包应用
前往 [Releases 页面](https://github.com/) 下载适用于你系统的安装包（`.dmg` / `.exe`），或参考下文自行编译。

### 2. 配置你的 API Key
首次启动后，点击左侧导航栏的 **「设置（Settings）」**：

1. **语音识别（ASR）配置**：
   - 服务商选择：`阿里云百炼 (DashScope)`
   - 填入你的 `DashScope API Key`（开通阿里云 DashScope 实时语音识别服务即可获取，新用户通常赠送免费额度）
2. **大语言模型（LLM）配置**：
   - 服务商选择：`DeepSeek` 或 `通义千问 (Qwen)` 或 `自定义 OpenAI 兼容接口`
   - 填入对应平台的 `API Key`，例如：
     - DeepSeek: `https://api.deepseek.com/v1`，模型 `deepseek-chat`
     - 阿里云百炼: `https://dashscope.aliyuncs.com/compatible-mode/v1`，模型 `qwen-plus`
     - 本地 Ollama: `http://localhost:11434/v1`，模型 `qwen2.5:7b`
3. 点击 **「测试连接」**，指示灯变绿即配置完成！

### 3. 开始你的第一场会议
1. 点击左上角 **「开始新会议」**；
2. 授予麦克风与系统音频捕获权限；
3. 会议中你可以看到左右双栏实时滚动的逐字稿与智能提取的决策待办；
4. 点击右上角悬浮窗按钮，可将听序缩小为微型胶囊浮条贴在屏幕边角。

---

## 🔑 模型与 ASR 配置指南

| 服务提供商 | 适用环节 | 官网与申请地址 | 推荐模型 / 接口端点 |
| :--- | :--- | :--- | :--- |
| **阿里云百炼** | 实时 ASR 识别 | [aliyun.com/product/bailian](https://www.aliyun.com/product/bailian) | 实时语音转写 WebSocket |
| **DeepSeek** | 会中洞察 / 纪要 / 问答 | [platform.deepseek.com](https://platform.deepseek.com) | `deepseek-chat` (性价比极高，推荐) |
| **阿里云千问** | 会中洞察 / 纪要 / 问答 | [dashscope.aliyun.com](https://dashscope.aliyun.com) | `qwen-plus` / `qwen-2.5-72b` |
| **Ollama** | 100% 离线单机大模型 | [ollama.ai](https://ollama.ai) | `qwen2.5:7b` (`http://localhost:11434/v1`) |
| **SiliconFlow** | 聚合大模型 API | [siliconflow.cn](https://siliconflow.cn) | `deepseek-ai/DeepSeek-V3` |

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
  - [x] 流式 ASR 直连与双轨打标
  - [x] 双栏工作台、微型悬浮胶囊窗、人工保护机制
  - [x] Local-First SQLite 存储与 FTS5 全文检索
  - [x] 单机化 BYOK (Bring Your Own Key) 支持
- [ ] **v0.3.0（计划中）**
  - [ ] 内置端侧本地离线 ASR（基于 Whisper.cpp / SenseVoice / sherpa-onnx），实现完全离网无网络会议助理
  - [ ] 导出更多格式（PDF、Notion 格式一键同步、飞书文档导入）
  - [ ] 跨平台音频降噪（基于 RNNoise 端侧降噪插件）
  - [ ] 说话人声纹注册与高精聚类声纹库（Speaker Identification）

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
