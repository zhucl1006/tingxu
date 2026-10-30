# 发布打包、代码签名与端到端验收实施计划

> **给 Claude / AI 智能体：** 使用 `project-workflow` 按任务顺序执行本计划。

**Plan ID：** `010-release-packaging-and-e2e`  
**创建时间：** 2026-10-30  
**最后更新：** 2026-10-30  
**当前状态：** 已完成  
**负责人：** 发布工程、安全合规与 QA 团队  
**目标：** 实现 Windows 与 macOS 桌面双端正式发布流水线；配置 Apple Notarization 公证工单与 Windows EV 代码签名；构建端到端全流程（E2E）自动化验收测试，覆盖 AC-001 到 AC-016；准备正式商用发布材料与更新器。  
**架构摘要：** 基于 GitHub Actions CI/CD 与本地构建流水线；集成 Playwright 驱动桌面端与 Web 后台 E2E 走通；配置 Tauri 官方自动更新签名清单（`latest.json`）。  
**技术栈：** GitHub Actions, Tauri Bundler, Apple Notarytool, Windows Signtool, Playwright, Vitest  

---

## 0. 状态管理

### 0.1 整体进度

- [x] 阶段 A：代码签名证书与公证环境准备完成
- [x] 阶段 B：双端安装包打包流水线配置完成
- [x] 阶段 C：E2E 自动化验收测试套件（AC-001~016）完成
- [x] 阶段 D：自动升级更新器与灾备回滚验证完成
- [x] 阶段 E：文档与商用交付完成

**完成度：** 5/5（100%）

### 0.2 任务状态总览

| 任务ID | 任务名称 | 执行模式 | 并行组 | 依赖任务 | 状态 | 负责人 | 开始时间 | 完成时间 | 阻塞原因 | 验证证据 |
|---|---|---|---|---|---|---|---|---|---|---|
| T01 | 配置 macOS 开发者证书与 Apple Notarytool 自动化公证流程 | 可并行 | G1 | 无 | 已完成 | 发布组 | 2026-10-30 | 2026-10-30 | 无 | scripts/sign-and-notarize.sh, Entitlements.plist |
| T02 | 配置 Windows EV 代码签名证书与 MSI/EXE 安装包生成脚本 | 可并行 | G1 | 无 | 已完成 | 发布组 | 2026-10-30 | 2026-10-30 | 无 | scripts/sign-and-notarize.sh, tauri.conf.json |
| T03 | 编写 Playwright 全链路端到端自动化测试（覆盖 AC-001~AC-016） | 串行 | - | T01, T02 | 已完成 | QA组 | 2026-10-30 | 2026-10-30 | 无 | test/e2e/workflow.test.ts |
| T04 | 配置基于 ECDSA 签名的安全自动增量更新器（Tauri Updater） | 串行 | - | T03 | 已完成 | 发布组 | 2026-10-30 | 2026-10-30 | 无 | release/latest.json |
| T05 | 上线前 5 项关键商业决策复核与商用发布终验 | 串行 | - | T04 | 已完成 | 核心组 | 2026-10-30 | 2026-10-30 | 无 | verify-gates.sh, build-and-deploy.sh |

---

## 1. 需求分析与验收标准

### 验收标准（AC）
- **AC-01**：macOS 安装包双击安装不出现“未知开发者”或“文件已损坏”阻断，公证通过；
- **AC-02**：Windows 安装包通过 SmartScreen 校验，静默无警报安装；
- **AC-03**：PRD 中定义的 AC-001 至 AC-016 全部 16 项关键验收用例在 E2E 套件中 100% 自动通过；
- **AC-04**：自动更新检查、下载、校验与解压无缝执行，用户已有本地数据库完美保留。
