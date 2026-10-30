# 项目门禁定义与 Agent 开发规范实施计划

> **给 Claude / AI 智能体：** 使用 `project-workflow` 按任务顺序执行本计划。

**Plan ID：** `001-project-gates-and-agent-spec`  
**创建时间：** 2026-10-30  
**最后更新：** 2026-10-30 21:40  
**当前状态：** 已完成  
**负责人：** 听序核心系统与工程效能团队  
**目标：** 根据工程 Harness 规范建立自动化质量门禁体系，输出约束 AI 与研发人员的根目录 `AGENTS.md`，实现一键门禁校验脚本与 Git Hook 拦截机制。  
**架构摘要：** 基于 Shell 驱动轻量跨平台门禁校验脚本，组合代码格式、类型检查、凭据防泄漏扫描、TDD 单元测试与 QA `data-testid` 规范，配合根目录 `AGENTS.md` 形成硬性防护圈。  
**技术栈：** Shell, Git Hooks, Markdown, TypeScript, Rust  

---

## 0. 状态管理

### 0.1 整体进度

- [x] 阶段 A：门禁标准与 Agent 规范分析完成
- [x] 阶段 B：实施计划任务拆解完成
- [x] 阶段 C：开发与自测完成（T01~T04 已全部完成并通过）
- [x] 阶段 D：集成验证完成
- [x] 阶段 E：文档与交付完成

**完成度：** 5/5（100%）

### 0.2 任务状态总览

| 任务ID | 任务名称 | 执行模式 | 并行组 | 依赖任务 | 状态 | 负责人 | 开始时间 | 完成时间 | 阻塞原因 | 验证证据 |
|---|---|---|---|---|---|---|---|---|---|---|
| T01 | 编写根目录规范文件 `AGENTS.md` | 串行 | - | 无 | 已完成 | AI Assistant | 21:30 | 21:35 | 无 | 根目录 `AGENTS.md` 包含 4 大铁律与 QA 规范 |
| T02 | 实现跨平台门禁校验脚本 `scripts/verify-gates.sh` | 串行 | - | T01 | 已完成 | AI Assistant | 21:35 | 21:38 | 无 | 脚本可执行，通过 5 大门禁自动化扫描 |
| T03 | 实现本地 Git Hooks 安装脚本与预提交拦截 | 串行 | - | T02 | 已完成 | AI Assistant | 21:38 | 21:39 | 无 | `.git/hooks/pre-commit` 自动挂载成功 |
| T04 | 门禁校验脚本端到端执行与自测验证 | 串行 | - | T03 | 已完成 | AI Assistant | 21:39 | 21:40 | 无 | `bash scripts/verify-gates.sh` 退出码 0 |

---

## 1. 需求分析

### 1.1 需求摘要
**业务背景：**
听序（Tingxu）涉及系统级底层音频 C-FFI / Rust 媒体采集、本地嵌入式 SQLite、Tauri 桌面端前端与金融级微信支付服务端控制面。代码复杂性高、对隐私与凭据安全性要求极高。为防止后续开发中 AI 或开发人员出现凭据硬编码、跳过测试直接写代码、破坏 Local-First 隐私红线或遗漏 QA 元素标记，必须先建立严格的门禁（Gates）与行为准则（`AGENTS.md`）。

**核心目标：**
1. 定制 Harness 级别的工程门禁（Lint、Typecheck、Secret-Scan、TDD-Coverage、QA-TestID）；
2. 定义根目录 `AGENTS.md`，明确行为守则、编程铁律与反模式；
3. 产出可本地运行的一键检查脚本 `scripts/verify-gates.sh` 与 Git 预提交钩子。

**范围内（In Scope）：**
- [x] 根目录 `AGENTS.md` 规范定制与落地；
- [x] 5 大工程门禁定义与自动化脚本实现；
- [x] Git Hook 安装与本地自动挂载；
- [x] 门禁执行与红绿灯自检。

**范围外（Out of Scope）：**
- 复杂的远程云端第三方 SaaS 持续集成平台配置（由 M4 阶段完成）。

### 1.2 验收标准（AC）验证结果

| AC-ID | 可测试条目 | 验证方式 | 对应测试 | 状态 |
|---|---|---|---|---|
| AC-01 | 根目录存在规范完整的 `AGENTS.md`，涵盖角色职责、开发铁律与 QA testid 规范 | 自动/检查 | 检查 `AGENTS.md` | 已验证 |
| AC-02 | `scripts/verify-gates.sh` 具备可执行权限，提供统一退出码（0 成功，非 0 失败） | 自动 | `bash scripts/verify-gates.sh` 返回 0 | 已验证 |
| AC-03 | 门禁脚本能成功拦截模拟的 API 密钥硬编码泄漏（如 `sk-xxxx`） | 自动 | 正则规则有效排查代码与配置 | 已验证 |
| AC-04 | 提供 `scripts/install-hooks.sh`，能一键将校验逻辑挂载到 `.git/hooks/pre-commit` | 自动 | 钩子已成功生成且带执行权限 | 已验证 |

---

## 2. 实施产出清单

1. [`AGENTS.md`](file:///Users/zhuchunlei/work/02_mycode/tingxu/AGENTS.md)：根目录规范约束手册。
2. [`scripts/verify-gates.sh`](file:///Users/zhuchunlei/work/02_mycode/tingxu/scripts/verify-gates.sh)：跨平台 5 大工程质量门禁自动化验证脚本。
3. [`scripts/install-hooks.sh`](file:///Users/zhuchunlei/work/02_mycode/tingxu/scripts/install-hooks.sh)：Git pre-commit 钩子一键挂载脚本。

---

## 3. 执行记录

| 时间 | 任务ID | 变更 | 操作人 | 备注 |
|---|---|---|---|---|
| 2026-10-30 21:30 | INIT | 初始化计划 001 | AI Assistant | 门禁与 Agent 规范分析与计划建立 |
| 2026-10-30 21:35 | T01 | 编写 `AGENTS.md` | AI Assistant | 完成 4 大铁律、5 门禁、QA data-testid 规范编写 |
| 2026-10-30 21:38 | T02 | 实现 `scripts/verify-gates.sh` | AI Assistant | 编写 5 门禁自动化校验逻辑 |
| 2026-10-30 21:39 | T03 | 实现 `scripts/install-hooks.sh` | AI Assistant | 创建并在本地成功挂载 Git pre-commit 钩子 |
| 2026-10-30 21:40 | T04 | 门禁端到端自测 | AI Assistant | 运行 `verify-gates.sh`，所有门禁 100% 通过，本计划闭环 |
