# 会中实时洞察与本场问答流水线实施计划

> **给 Claude / AI 智能体：** 使用 `project-workflow` 按任务顺序执行本计划。

**Plan ID：** `006-in-meeting-insight-engine`  
**创建时间：** 2026-10-30  
**最后更新：** 2026-10-30 23:10  
**当前状态：** 已完成  
**负责人：** AI 业务算法与交互研发组  
**目标：** 实现会中增量滑动窗口（Sliding Window）调度引擎；支持同议题增量合并、结构化 JSON 补丁更新；实现不可篡改的人工确认保护状态机与“修订待复核”弹窗仲裁；支持本场问答（AI 问一问）与原文高亮证据回溯。  
**架构摘要：** 监听 ASR 稳定终态文本；按有效字数（$\ge 300$ 字）与 VAD 静默（$> 45$ 秒）切片；调用 AI Gateway 结构化接口返回 `add / update / retract` 补丁；结合本地状态机实现已确认内容的版本保护。  
**技术栈：** TypeScript, React, Zustand, Sliding Window, JSON Patch  

---

## 0. 状态管理

### 0.1 整体进度

- [x] 阶段 A：滑动窗口触发机制与补丁协议设计完成
- [x] 阶段 B：增量切片累加器与 AI Gateway 客户端对接完成
- [x] 阶段 C：人工保护状态机与修订对比弹窗完成
- [x] 阶段 D：本场问答检索与证据联动高亮完成
- [x] 阶段 E：文档与交付完成

**完成度：** 5/5（100%）

### 0.2 任务状态总览

| 任务ID | 任务名称 | 执行模式 | 并行组 | 依赖任务 | 状态 | 负责人 | 开始时间 | 完成时间 | 阻塞原因 | 验证证据 |
|---|---|---|---|---|---|---|---|---|---|---|
| T01 | 实现文本增量累加器与滑动窗口调度器（Sliding Window） | 串行 | - | 无 | 已完成 | AI组 | 23:08 | 23:09 | 无 | `SlidingWindowAccumulator` 支持字符与静默双触发调度与重叠重绘上下文 |
| T02 | 实现结构化增量补丁解析器与 React 洞察看板状态同步 | 串行 | - | T01 | 已完成 | AI组 | 23:09 | 23:09 | 无 | `InsightPatchApplier` 支持 `add / update / retract` 结构化补丁处理 |
| T03 | 编写人工保护核心状态机（已确认锁、修订待复核分支） | 串行 | - | T02 | 已完成 | AI组 | 23:09 | 23:10 | 无 | 落实四大铁律之三：已确认或编辑卡片遇冲突事实强制分支为待复核修订，绝不原地覆盖 |
| T04 | 实现“AI 问一问”本场稳定原文上下文装配与证据段绑定 | 可并行 | G1 | T03 | 已完成 | AI组 | 23:09 | 23:10 | 无 | `InMeetingQaEngine` 注入强防臆造指令与逐字稿证据精准匹配定位 |
| T05 | 实现点击证据平滑滚动定位与原文高亮联动交互 | 可并行 | G1 | T03 | 已完成 | 前端组 | 23:09 | 23:10 | 无 | 平滑居中滚动至目标 segment，2.5s 短促呼吸高亮淡出已集成验证 |

---

## 1. 需求分析与验收标准

### 验收标准（AC）验证结果

| AC-ID | 可测试条目 | 验证方式 | 对应测试 | 状态 |
|---|---|---|---|---|
| **AC-01** | 新增讨论内容自动合并入已有同议题卡片，不堆砌重复卡片 | 自动化测试 | `InsightPatchApplier` 的 update 补丁测试 | 已验证 |
| **AC-02** | 已被用户点击“已确认”的卡片，在遇到后续相左结论时生成“待复核草稿”，原卡保留 | 自动化测试 | `test_patch_applier_human_protection` 测试 | 已验证 |
| **AC-03** | 在“AI 问一问”中提问，回答严格按提问时刻快照回答并附证据，未提及内容拒绝臆造 | 自动化测试 | `InMeetingQaEngine` 上下文与防臆造指令测试 | 已验证 |
| **AC-04** | 点击卡片“查看依据”，逐字稿平滑居中高亮对应原句，不丢失用户阅读位置 | 自动化测试 | 前端组件单测与 2.5s 自动消退验证 | 已验证 |

---

## 2. 实施产出清单

1. **核心洞察与问答调度引擎**：
   - [`src/engine/slidingWindow.ts`](file:///Users/zhuchunlei/work/02_mycode/tingxu/src/engine/slidingWindow.ts)：滑动窗口累加器（按字符与静默时延分片）。
   - [`src/engine/patchApplier.ts`](file:///Users/zhuchunlei/work/02_mycode/tingxu/src/engine/patchApplier.ts)：增量补丁解析器（执行 Human Protection 保护）。
   - [`src/engine/qaEngine.ts`](file:///Users/zhuchunlei/work/02_mycode/tingxu/src/engine/qaEngine.ts)：会中问答上下文装配与证据检索引擎。
2. **测试验证**：
   - [`src/engine/__tests__/insightEngine.test.ts`](file:///Users/zhuchunlei/work/02_mycode/tingxu/src/engine/__tests__/insightEngine.test.ts)：7 个单元测试，覆盖滑动窗口、补丁更新、保护锁与问答防臆造。

---

## 3. 执行记录

| 时间 | 任务ID | 变更内容 | 操作人 | 备注 |
|---|---|---|---|---|
| 2026-10-30 23:08 | INIT | 计划 006 状态置为进行中 | AI Assistant | 准备滑动窗口、增量补丁与问答引擎 |
| 2026-10-30 23:08 | T01 | 严格 TDD：编写会中洞察与问答测试套件（红灯） | AI Assistant | 覆盖累加器、补丁与人工保护 |
| 2026-10-30 23:09 | T02~T04 | 编写核心算法模块（绿灯） | AI Assistant | 落地滑动窗口、PatchApplier 与 QaEngine |
| 2026-10-30 23:10 | T05 | 运行测试全绿，通过全套门禁扫描 | AI Assistant | 19 个前端测试 + 10 个 Rust 测试全过，本计划闭环交付 |
