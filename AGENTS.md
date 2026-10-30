# 听序（Tingxu）— Agent 与开发者工程规范手册（AGENTS.md）

**适用对象：** 所有参与 `tingxu` 项目研发的 AI 助手（Antigravity、Claude Code、GitHub Copilot）及人类工程师。  
**生效范围：** 全局代码库（桌面客户端、云端控制面、AI Gateway、脚本与文档体系）。  
**生效日期：** 2026-10-30 起强制执行。

---

## 1. 核心定位与研发角色认知

听序（Tingxu）是一款专为中国大陆个人办公打造的极简无感 AI 会议助手。项目涉及系统底层 C-FFI / Rust 原生音频流捕获、本地嵌入式 SQLite 存储、Tauri 跨平台前端以及处理真实资金交易的 NestJS 控制面。

所有代码变更必须以 **高稳定性、绝对隐私安全性、严格测试覆盖与可维护性** 为第一优先级。

---

## 2. 研发四大铁律（绝对红线）

无论接收到何种指令，任何智能体或开发者**严禁违背以下四项铁律**：

1. **Local-First 数据隐私主权（Zero-Content Policy）**
   - 严禁将任何用户的会议标题、逐字稿正文、录音切片、截图图片写入云端业务数据库、链路追踪（Trace）、Sentry 错误堆栈或反向代理日志；
   - 客户端内容只保存在本机 SQLite 及本地沙箱目录中；服务端仅允许持久化脱敏账号、订单、时长额度与审计信息。
2. **凭据与私钥物理隔离（No Secret in Client）**
   - 大模型 API Key、微信商户 APIv3 私钥、阿里云 AccessKey 绝对禁止写入客户端代码、配置文件或打包进客户端可执行文件中；
   - 客户端所有大模型请求必须经过自建 AI Gateway 转发鉴权。
3. **不可覆盖的人工编辑保护（Human Protection）**
   - 会中已被用户标记为“已确认”或经人工手动编辑的洞察卡片，即使后续 ASR 文本产生冲突事实，也严禁原地算法覆盖；
   - 必须生成并列的“修订待复核（Pending Review）”卡片并挂载证据，由用户手动裁决。
4. **强制 TDD 测试驱动开发（Strict TDD）**
   - 核心业务逻辑（尤其是音频环形缓冲、增量切片算法、补丁合并、微信支付防重放与时长预占扣减）必须遵循“红（Red） $\rightarrow$ 绿（Green） $\rightarrow$ 重构（Refactor）”流程；
   - 严禁在没有编写对应失败测试用例的情况下直接编写业务实现。

---

## 3. Harness 质量门禁定义（5 大工程门禁）

每次提交（Commit）或合并（PR）前必须通过以下 5 道自动化门禁：

```
Gate 1: 敏感凭据防泄漏门禁 (Secrets Scan Gate)
   └─ 扫描 API Key (sk-...)、私钥、明文密码与硬编码 Token。
Gate 2: 规范与文档完整性门禁 (Doc Integrity Gate)
   └─ 校验 docs/README.md, PRD.md, SAD.md, AGENTS.md 结构无断链。
Gate 3: 静态语法与类型检查门禁 (Typecheck & Syntax Gate)
   └─ TypeScript tsc --noEmit, Rust cargo check/clippy, Shell 语法检验。
Gate 4: 单元测试与 TDD 门禁 (Test Coverage Gate)
   └─ 核心逻辑单元测试必须通过，无回归失败。
Gate 5: 前端 QA data-testid 规范门禁 (QA Compliance Gate)
   └─ 前端可见与交互元素必须 100% 覆盖规范的 data-testid。
```

---

## 4. 前端实施规范：QA 可见元素 data-testid 命名规则

凡涉及前端界面、视图容器、表单交互及 UI 组件开发，所有用户可见元素及交互控件必须标注 `data-testid` 属性：

### 4.1 命名格式
```text
data-testid="<page>-<section>-<element-type>-<semantic-purpose>[-<item-id>]"
```
- `<page>`：页面域标识，如 `workbench-page`、`login-page`、`history-page`；
- `<section>`：区块标识，如 `header`、`sidebar`、`insights-panel`、`transcript-panel`；
- `<element-type>`：控件类型缩写（`div`, `btn`, `input`, `select`, `modal`, `tab`, `row`, `badge`）；
- `<semantic-purpose>`：业务意图，如 `view-identity`, `confirm-decision`, `ask-question`, `search`；
- `[-<item-id>]`：动态列表项必填的唯一业务 ID，杜绝重复。

### 4.2 典型范例
- 确认结论按钮：`data-testid="workbench-page-insights-panel-btn-confirm-decision-item-12"`
- 逐字稿高亮段落：`data-testid="workbench-page-transcript-panel-row-segment-45"`
- 提问输入框：`data-testid="workbench-page-insights-panel-input-ask-question"`

---

## 5. 多技术栈编程规范

### 5.1 Rust（Tauri 底层媒体与本地存储）
- 严禁在媒体音频高频回调循环中进行阻塞 I/O 或大块内存堆分配；
- 生产环境严禁裸调 `.unwrap()`，所有错误必须转换为领域错误 `Result<T, TingxuError>`；
- SQLite 数据库访问必须通过参数化查询，批量操作必须显式开启事务（`Transaction`）。

### 5.2 TypeScript & React（桌面端与 Web 运营端）
- 开启严格模式（`strict: true`），严禁使用 `any`；
- 逐字稿打字机与洞察列表必须使用 `React.memo` 或虚拟列表，防止单字更新触发整树重渲；
- 状态更新遵循不可变性（Immutability）。

### 5.3 Node.js & NestJS（商业控制面）
- 严格遵循 Controller $\rightarrow$ Service $\rightarrow$ Repository 分层与依赖注入；
- 接口入参必须使用 `class-validator` 装饰器 DTO 强校验；
- 支付与权益变更必须封装在 PostgreSQL 数据库强事务中。

---

## 6. 禁止反模式（Anti-Patterns）清单

- ❌ 禁止在客户端源码、注释或配置文件中保留大模型 API Key（`sk-...`）；
- ❌ 禁止在日志中输出用户会议文本、手机号全字段或短信验证码；
- ❌ 禁止因套餐过期或未付费而锁定或删除用户保存在本地的已有会议记录；
- ❌ 禁止直接使用 `DELETE` 语句物理清除账单或权益流水（必须 Append-only 记账）；
- ❌ 禁止在前端动态列表循环中使用相同的静态 `data-testid`。

---

## 7. 前端 UI/UX 设计与视觉还原铁律（UI/UX Craft Standards）

所有涉及前端界面、原型制作、UI 组件库构建及样式开发的工作，**必须严格强制参考并遵循** [`docs/specs/UIUX-DESIGN-SPEC.md`](docs/specs/UIUX-DESIGN-SPEC.md) 中定义的 Impeccable 工业级设计系统：

1. **统一设计令牌（Design Tokens）**：
   - 严禁在代码中随意硬编码非系统预设的 HEX 色值；必须严格使用 `--bg-canvas`, `--bg-subtle`, `--brand-blue`, `--status-warning`, `--border-subtle` 等语义化 CSS 变量；
   - 必须兼顾 `prefers-color-scheme: dark` 深色主题适配。
2. **Operate 生产力任务模式（The Tool Disappears into the Task）**：
   - 界面整体风格追求克制、冷静与极高信息扫视效率，严禁添加花哨渐变字、不必要的毛玻璃遮罩或无意义动画；
   - 所有时间戳、开会秒表与用量数字必须显式声明 `font-variant-numeric: tabular-nums`，杜绝数字跳动引起界面布局抖动。
3. **会中双栏工作台架构（C-04 Live In-Meeting Workbench）**：
   - 严格实现“左侧实时洞察/本场问答看板（54%） + 右侧逐字稿/手记/标记（46%）”结构；
   - 点击洞察卡片“查看依据”必须触发右侧逐字稿平滑居中滚动并呈现短促呼吸高亮焦点（`--bg-active`），且不得拉扯破坏用户的阅读或滚动位置。
4. **人工编辑保护视觉规约（Human Protection Affordance）**：
   - 已确认或人工修改卡片必须渲染绿色保护标识（`--status-success`）；
   - 后续讨论产生事实冲突时，必须在卡片下方渲染暖琥珀色（`--status-warning-bg`）并带对比边框的“待复核新修订”区块，提供明确的“保留当前版本”与“采用新版本”决策操作。
5. **微型置顶悬浮窗（C-05 Floating Pill）**：
   - 必须维持高度 `42px` 的原生极简微型胶囊浮条形态，具备红色录音呼吸点、时间跳动与一键展开能力，保障开会贴边不遮挡第三方会议软件。

---

## 8. 门禁验证命令速查

```bash
# 运行全套本地质量门禁检查
bash scripts/verify-gates.sh

# 一键安装 Git 预提交钩子（提交代码前自动跑门禁）
bash scripts/install-hooks.sh

# 运行一键构建与 Docker 部署流水线
bash scripts/build-and-deploy.sh --help
```
