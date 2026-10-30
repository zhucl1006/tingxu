# 听序（Tingxu）— UI/UX 设计系统与交互规范（UIUX-DESIGN-SPEC）

**项目名称：** 听序（Tingxu）  
**文档版本：** v0.3（Impeccable 极简无感生产级标准）  
**最后更新：** 2026-10-30  
**适用范围：** 桌面端跨平台客户端（Windows / macOS）与独立 Web 运营管理后台  
**设计模式：** **Operate Mode（生产力任务模式）** — 工具退后，任务向前；以极高可扫视性、克制的情绪表达与极致的排版韵律，让用户在会议中专注思考与沟通。

---

## 1. 设计哲学与核心原则

### 1.1 核心设计定位
听序是一款运行在桌面后台的“极简无感”会议伴侣。UI 设计追求 **“克制、严谨、轻量、可信”**：
1. **轻量与不打扰（Quiet & Unobtrusive）**：界面无多余修饰与无意义动效，常驻后台时极简纯净；微型悬浮条贴边隐蔽，开会时不遮挡主要会议软件内容。
2. **证据可回溯（Evidence-Anchored Visibility）**：所有 AI 提炼的事实与行动项必须具备明显的视觉证据锚点（如 `01:05` 时间胶囊），点击即可联动定位到原文逐字稿。
3. **人工确认受保护（Human Protection Affordance）**：经过用户确认或手动编辑的结论具备神圣不可侵犯的视觉层级；当后续发言产生事实冲突时，必须通过并列的“修订待复核（Pending Review）”卡片呈现新旧对比，严禁算法静默覆盖。
4. **状态真实透明（Honest State Transparency）**：断网、麦克风权限拒绝、转写中断、模型熔断等异常状态必须采用“图标 + 色彩 + 清晰中文”三重表达，绝不以虚假成功或无尽的静默加载误导用户。

---

## 2. 设计令牌（Design Tokens）规范

### 2.1 色彩系统（Semantic Palette）
系统严格遵循浅色（默认）与系统深色（Dark Mode）双套语义变量，避免强刺激的高饱和度色彩堆砌：

```css
/* 浅色主题 (Light - 默认) */
:root {
  /* 基础表面 */
  --bg-canvas: #ffffff;             /* 主工作区纯白背景 */
  --bg-subtle: #f8f9fb;             /* 侧边栏、卡片副背景、面板容器 */
  --bg-panel: #f0f3f7;              /* 分割容器、工具栏底色 */
  --bg-active: #edf3ff;             /* 选中项、证据高亮呼吸背景 */
  
  /* 文本与边框 */
  --text-primary: #1e2530;          /* 主要文字、标题（高对比、非纯黑） */
  --text-secondary: #586376;        /* 次要文字、描述、时间戳说明 */
  --text-tertiary: #8a94a6;         /* 占位符、辅助禁用说明 */
  --border-subtle: #e2e6ed;         /* 常用细分割线、卡片边框 */
  --border-strong: #c8d0dc;         /* 输入框控件边框、悬浮边线 */
  
  /* 语义品牌与状态 */
  --brand-blue: #1d58bd;            /* 主操作、核心按钮、高亮强调 */
  --brand-blue-hover: #15459b;      /* 按钮悬停状态 */
  --brand-blue-subtle: #ebf2fe;     /* 蓝色轻量标签底色 */
  
  --status-success: #1b7a4a;        /* 已确认结论、录音正常绿色 */
  --status-success-bg: #eaf6ef;     /* 绿色轻量胶囊底色 */
  
  --status-warning: #945318;        /* 待复核修订、AI建议、争议项 */
  --status-warning-bg: #fdf5ea;     /* 琥珀色轻量卡片底色 */
  --status-warning-border: #dfb88e; /* 待复核对比边框 */
  
  --status-danger: #bd3124;         /* 录音指示灯、删除危险项、错误 */
  --status-danger-bg: #fdeeee;      /* 红色轻量警示底色 */
}

/* 深色模式 (Dark Mode - 系统自动偏好) */
@media (prefers-color-scheme: dark) {
  :root {
    --bg-canvas: #151921;
    --bg-subtle: #1c222c;
    --bg-panel: #242c38;
    --bg-active: #203148;
    
    --text-primary: #f2f5f9;
    --text-secondary: #9da8b9;
    --text-tertiary: #6b7788;
    --border-subtle: #313c4c;
    --border-strong: #4a5668;
    
    --brand-blue: #88b0f8;
    --brand-blue-hover: #abc8fb;
    --brand-blue-subtle: #1e2c42;
    
    --status-success: #81cf9f;
    --status-success-bg: #1c3325;
    
    --status-warning: #f0be88;
    --status-warning-bg: #36291a;
    --status-warning-border: #6d5437;
    
    --status-danger: #f8968c;
    --status-danger-bg: #381e1c;
  }
}
```

### 2.2 排版与字体阶梯（Typography Hierarchy）
- **字体族声明**：  
  `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;`
- **等宽数字支持（Tabular Nums）**：  
  所有会议时钟、音频时间戳、百分比进度必须配置 `font-variant-numeric: tabular-nums`，杜绝数字跳动时产生界面震颤。
- **阶梯字阶（Fixed Scale）**：
  - `Display / H1`：24px / 1.3 行高，字重 650，字距 -0.02em（页面主标题）
  - `H2`：18px / 1.4 行高，字重 600（区块与模块标题）
  - `H3`：15px / 1.4 行高，字重 600（洞察卡片标题、弹窗小标）
  - `Body / P`：14px / 1.6 行高，字重 400（常规正文、逐字稿文本）
  - `Caption / Small`：12px / 1.4 行高，字重 400（时间戳、证据标签、次要说明）

### 2.3 阴影与微物理层级（Elevation & Shadows）
严格执行“单层表现原则（Declare elevation once: border or shadow）”：
- **扁平卡片（Default Card）**：`border: 1px solid var(--border-subtle)`，无阴影，保持界面纯净整洁。
- **浮起工具条与悬浮小条（Floating Pill）**：  
  `box-shadow: 0 4px 16px -2px rgba(16, 24, 40, 0.08), 0 2px 6px -1px rgba(16, 24, 40, 0.04);`
- **弹窗遮罩层（Modal Backdrop）**：  
  `background: rgba(15, 23, 42, 0.45); backdrop-filter: blur(4px);`

---

## 3. 核心界面布局架构

### 3.1 桌面应用双栏架构（Shell Layout）
- **左侧导航侧边栏（Aside）**：固定宽度 `220px`，包含品牌 Logo、主导航项（工作台、会中记录、待办、搜索、套餐、设置）、底部额度进度条与当前用户 Profile。
- **主视口（Main）**：流式自适应宽度，顶部标准 Header 高度 `56px`，带页面面包屑导航与云端服务网络状态胶囊。

```
┌─────────────────┬────────────────────────────────────────────────────────────┐
│  听序 TINGXU    │  面包屑导航                      [🟢 云端可用] [异常模拟]   │
├─────────────────┼────────────────────────────────────────────────────────────┤
│ ▦ 会议工作台    │                                                            │
│ ◉ 会中实时记录  │                   主工作区内容视图                         │
│ ☑ 我的待办     │             (由各路由组件承载渲染)                         │
│ ⌕ 历史检索     │                                                            │
│ ◇ 套餐与用量   │                                                            │
│ ⚙ 系统设置     │                                                            │
├─────────────────┤                                                            │
│ 剩余时长进度条  │                                                            │
│ [林沐 · 个人版] │                                                            │
└─────────────────┴────────────────────────────────────────────────────────────┘
```

### 3.2 会中双栏工作台布局（C-04 Live In-Meeting Workbench）
会中工作台是系统最核心的作业界面，采用响应式双分栏布局：
- **左栏（54% 权重）：实时洞察看板 / AI 问一问**
  - **头部状态**：显示当前理解状态（“正在理解会议”、“更新已暂停”）、更新时间戳、本场 AI 预算进度；
  - **当前议题胶囊**：显示算法聚合的讨论 Topic；
  - **卡片列表**：按“会议决定（绿色边线）”、“行动待办（蓝色边线）”、“讨论要点（常规）”、“AI 提醒（橙色边线）”四分流展示；
  - **修订待复核弹窗/对比块**：当产生冲突时，以明显的橙色背景卡片展示新旧草稿对比与审核按钮。
- **右栏（46% 权重）：实时逐字稿 / 我的手记 / 时间标记**
  - **逐字稿模式**：按时间轴滚动，每行带说话人徽章（“麦克风 · 我” vs “系统音频 · 远端”）与时间戳；
  - **手记模式**：纯本地文本草稿编辑区，默认不上传；
  - **标记模式**：显示会中点击“重点”与“截图”创建的时间锚点。
- **底部悬浮控制台（Sticky Controller）**：固定在视口底部，包含录音时长秒表、暂停/继续按钮、打点按钮、一键截图、微型悬浮窗切换与“结束并整理”主按钮。

---

## 4. 关键交互模式与微交互（Micro-Interactions）

### 4.1 证据定位与联动高亮（Evidence Jump）
1. 用户在左侧洞察卡片点击 `↗ 查看依据 01:05`；
2. 右侧面板若在手记或标记状态，自动秒级切换至“逐字稿”选项卡；
3. 视口平滑滚动（`scrollIntoView({ block: 'center', behavior: 'smooth' })`）至对应段落；
4. 对应段落呈现 1.2 秒的柔和蓝色呼吸高亮光晕（`--bg-active`），提示阅读焦点，随后平滑淡出，不打断用户原有阅读位置。

### 4.2 冲突事实与修订保护流（BR-005）
```
[用户确认周五交付] ──► 卡片锁定 (标绿色 tag) ──► 后文新讨论更正为周一
                                                  │
┌─────────────────────────────────────────────────┴────────────────────────────┐
│ ⚠️ 发现后续讨论存在更新修订                                                   │
│ 当前保留版本：本周五前完成双轨采集验证                                       │
│ 后续讨论新提议：截止时间调整为下周一完成（依据：02:18）                       │
│                                                                              │
│ [保留当前人工版本]                                          [采用新修订版本] │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 微型置顶悬浮小条（C-05 Floating Pill）
- 用户开会切换至全屏 PPT 或第三方会议软件时，点击工作台“悬浮窗”按钮；
- 主界面平滑最小化，屏幕右侧贴边浮起一个微型胶囊浮条（高度 `42px`，无边框置顶）；
- 包含：红色录音跳动呼吸点、当前开会时长、暂停快捷键、一键打点与一键展开按钮。

---

## 5. 前端 QA 可见元素规范（data-testid 对应表）

所有前端元素在实施时必须 100% 具备以下命名格式的测试 ID：

| 交互元素 | 规范 `data-testid` 属性 |
| :--- | :--- |
| 会中工作台页面容器 | `data-testid="workbench-page-main-container"` |
| 实时洞察看板滚动区 | `data-testid="workbench-page-insights-panel-scroll-container"` |
| 洞察卡片容器 | `data-testid="workbench-page-insights-panel-card-${item.id}"` |
| 卡片确认按钮 | `data-testid="workbench-page-insights-panel-btn-confirm-${item.id}"` |
| 卡片查看依据按钮 | `data-testid="workbench-page-insights-panel-btn-evidence-${item.id}"` |
| 修订待复核对比容器 | `data-testid="workbench-page-insights-panel-div-proposal-${item.id}"` |
| 采用新修订按钮 | `data-testid="workbench-page-insights-panel-btn-adopt-${item.id}"` |
| 逐字稿行项 | `data-testid="workbench-page-transcript-panel-row-${segment.id}"` |
| 会中提问输入框 | `data-testid="workbench-page-chat-panel-input-ask"` |
| 会中提问发送按钮 | `data-testid="workbench-page-chat-panel-btn-send"` |
| 底部结束并整理按钮 | `data-testid="workbench-page-footer-btn-finish-meeting"` |
| 微型置顶悬浮窗容器 | `data-testid="floating-bar-div-container"` |
| 悬浮窗展开主界面按钮 | `data-testid="floating-bar-btn-expand-workbench"` |
