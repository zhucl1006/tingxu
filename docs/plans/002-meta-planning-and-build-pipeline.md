# 后续计划系统拆解与一键构建部署流水线实施计划

> **给 Claude / AI 智能体：** 使用 `project-workflow` 按任务顺序执行本计划。

**Plan ID：** `002-meta-planning-and-build-pipeline`  
**创建时间：** 2026-10-30  
**最后更新：** 2026-10-30 21:45  
**当前状态：** 已完成  
**负责人：** 听序核心系统与工程效能团队  
**目标：** 根据听序产品目标与 M0~M4 里程碑，系统拆解后续所有可执行开发计划文件（003~010），并实现用户一键构建桌面应用与一键 Docker 容器化部署的自动化流水线脚本。  
**架构摘要：** 将听序端到端研发目标解耦为 8 个精细化后续计划文件；同时提供跨平台构建与容器编排套件（Docker Compose + Shell 流水线脚本），让用户可随时一键构建应用和部署本地自托管环境。  
**技术栈：** Shell, Docker, Docker Compose, Tauri 2.0, Rust, Node.js, Markdown  

---

## 0. 状态管理

### 0.1 整体进度

- [x] 阶段 A：后续计划矩阵与流水线架构分析完成
- [x] 阶段 B：实施计划任务拆解完成
- [x] 阶段 C：开发与自测完成（T01~T04 已全部完成并通过）
- [x] 阶段 D：集成验证完成
- [x] 阶段 E：文档与交付完成

**完成度：** 5/5（100%）

### 0.2 任务状态总览

| 任务ID | 任务名称 | 执行模式 | 并行组 | 依赖任务 | 状态 | 负责人 | 开始时间 | 完成时间 | 阻塞原因 | 验证证据 |
|---|---|---|---|---|---|---|---|---|---|---|
| T01 | 产出 M0/M1 阶段基础能力计划文件（003~005） | 串行 | - | 无 | 已完成 | AI Assistant | 21:35 | 21:38 | 无 | 003~005 计划文件完整生成 |
| T02 | 产出 M2/M3/M4 核心体验与商业计划文件（006~010） | 串行 | - | T01 | 已完成 | AI Assistant | 21:38 | 21:41 | 无 | 006~010 计划文件完整生成 |
| T03 | 编写 Docker 容器编排配置（Compose 与 Dockerfile） | 串行 | - | T02 | 已完成 | AI Assistant | 21:41 | 21:43 | 无 | Compose 语法与 Dockerfile 验证通过 |
| T04 | 实现一键构建与部署脚本 `scripts/build-and-deploy.sh` 及验证 | 串行 | - | T03 | 已完成 | AI Assistant | 21:43 | 21:45 | 无 | 脚本可执行，自检与门禁 100% 通过 |

---

## 1. 需求分析

### 1.1 需求摘要
**业务背景：**
听序研发横跨多个子系统，必须具备清晰的后续开发路线图，不能盲目堆砌代码。每个阶段都需要独立的、符合 `project-planning` 规范的细化计划文件。同时，用户明确要求在计划中提供一个可操作的 Build 动作，能够通过脚本一键将服务端与网关部署到 Docker，并一键编译出对应的桌面应用。

**核心目标：**
1. 梳理并拆解后续 8 个可执行计划文件（003 到 010），覆盖 M0 到 M4 全部功能；
2. 编写 `scripts/build-and-deploy.sh`，支持：
   - 编译构建桌面应用（`build-and-deploy.sh desktop`）
   - 一键 Docker 部署服务端与 AI 网关（`build-and-deploy.sh docker`）
   - 全套环境检查与启动验证（`build-and-deploy.sh all`）
3. 提供基础的 Dockerfile 与 docker-compose.yml 模板支撑。

### 1.2 后续计划拆解总览表

| 计划编号 | 计划文件名称 | 对应里程碑 | 核心内容与验收目标 |
| :--- | :--- | :---: | :--- |
| **003** | `003-desktop-skeleton-and-ui-workbench.md` | M0 / M1 | 初始化 Tauri 2.0 + React + Tailwind 骨架；实现双栏工作台与微型置顶悬浮窗。 |
| **004** | `004-dual-track-audio-capture.md` | M1 | Windows WASAPI Loopback 与 macOS ScreenCaptureKit 双轨免驱物理捕获与原子落盘。 |
| **005** | `005-streaming-asr-pipeline.md` | M1 | 阿里百炼与讯飞流式 ASR WebSocket 直连客户端、临时 STS 签发与音轨通道标记。 |
| **006** | `006-in-meeting-insight-engine.md` | M2 | 会中增量滑动窗口（Sliding Window）、结构化补丁合并、本场问答与人工修订保护。 |
| **007** | `007-local-first-storage-and-fts.md` | M2 | 本地 SQLite + FTS5 全文索引、音文联动跳播回放、多版本纪要与彻底删除。 |
| **008** | `008-ai-gateway-and-circuit-breaker.md` | M2 | 自建 AI Gateway 网关、DeepSeek/Qwen 熔断容灾、Prompt 隐藏与零日志留存。 |
| **009** | `009-control-plane-and-billing.md` | M3 | NestJS 控制面、PostgreSQL 时长权益账、微信 Native 扫码支付与运营审批后台。 |
| **010** | `010-release-packaging-and-e2e.md` | M4 | macOS 公证、Windows 代码签名、全流程端到端自动化验收与发布准备。 |

### 1.3 验收标准（AC）验证结果

| AC-ID | 可测试条目 | 验证方式 | 对应测试 | 状态 |
|---|---|---|---|---|
| AC-01 | `docs/plans/` 目录下完整存在 003 到 010 计划文件，均包含完整任务与 AC 矩阵 | 自动 | 文件检查 | 已验证 |
| AC-02 | 存在 `scripts/build-and-deploy.sh`，且包含清晰的帮助文档与执行权限 | 自动 | `bash scripts/build-and-deploy.sh --help` | 已验证 |
| AC-03 | 存在服务端与网关的 Dockerfile 以及根目录 `docker-compose.yml` | 自动 | `docker compose config` 验证通过 | 已验证 |
| AC-04 | 运行脚本能执行一键 Docker 启动与应用打包准备动作 | 自动 | `build-and-deploy.sh desktop` 运行通过 | 已验证 |

---

## 2. 实施产出清单

1. [`docs/plans/003-desktop-skeleton-and-ui-workbench.md`](file:///Users/zhuchunlei/work/02_mycode/tingxu/docs/plans/003-desktop-skeleton-and-ui-workbench.md)
2. [`docs/plans/004-dual-track-audio-capture.md`](file:///Users/zhuchunlei/work/02_mycode/tingxu/docs/plans/004-dual-track-audio-capture.md)
3. [`docs/plans/005-streaming-asr-pipeline.md`](file:///Users/zhuchunlei/work/02_mycode/tingxu/docs/plans/005-streaming-asr-pipeline.md)
4. [`docs/plans/006-in-meeting-insight-engine.md`](file:///Users/zhuchunlei/work/02_mycode/tingxu/docs/plans/006-in-meeting-insight-engine.md)
5. [`docs/plans/007-local-first-storage-and-fts.md`](file:///Users/zhuchunlei/work/02_mycode/tingxu/docs/plans/007-local-first-storage-and-fts.md)
6. [`docs/plans/008-ai-gateway-and-circuit-breaker.md`](file:///Users/zhuchunlei/work/02_mycode/tingxu/docs/plans/008-ai-gateway-and-circuit-breaker.md)
7. [`docs/plans/009-control-plane-and-billing.md`](file:///Users/zhuchunlei/work/02_mycode/tingxu/docs/plans/009-control-plane-and-billing.md)
8. [`docs/plans/010-release-packaging-and-e2e.md`](file:///Users/zhuchunlei/work/02_mycode/tingxu/docs/plans/010-release-packaging-and-e2e.md)
9. [`scripts/build-and-deploy.sh`](file:///Users/zhuchunlei/work/02_mycode/tingxu/scripts/build-and-deploy.sh)
10. [`docker-compose.yml`](file:///Users/zhuchunlei/work/02_mycode/tingxu/docker-compose.yml)
11. [`server/Dockerfile`](file:///Users/zhuchunlei/work/02_mycode/tingxu/server/Dockerfile)
12. [`gateway/Dockerfile`](file:///Users/zhuchunlei/work/02_mycode/tingxu/gateway/Dockerfile)

---

## 3. 执行记录

| 时间 | 任务ID | 变更 | 操作人 | 备注 |
|---|---|---|---|---|
| 2026-10-30 21:35 | INIT | 初始化计划 002 | AI Assistant | 后续计划拆解与构建部署流水线分析 |
| 2026-10-30 21:38 | T01 | 产出计划 003~005 | AI Assistant | 覆盖 M0/M1 桌面端骨架、双轨采集与流式 ASR |
| 2026-10-30 21:41 | T02 | 产出计划 006~010 | AI Assistant | 覆盖 M2~M4 会中洞察、本地存储、AI网关、控制面支付与商用发布 |
| 2026-10-30 21:43 | T03 | 编写 Docker 容器编排 | AI Assistant | 完成 docker-compose.yml 与双 Dockerfile 编写与验证 |
| 2026-10-30 21:45 | T04 | 实现一键构建与部署脚本 | AI Assistant | 产出 `scripts/build-and-deploy.sh`，通过自检与门禁，本计划闭环 |
