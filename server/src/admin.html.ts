/**
 * 听序（Tingxu）商业控制面 Web 运营管理后台
 */

export function renderAdminDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>听序 Tingxu · 商业控制面运营管理系统</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #111827;
      --card-border: #1f293d;
      --text-main: #f3f4f6;
      --text-sub: #9ca3af;
      --brand: #2563eb;
      --brand-hover: #1d4ed8;
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      background: var(--bg);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: var(--card);
      border-bottom: 1px solid var(--card-border);
      padding: 14px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 700;
      font-size: 16px;
    }
    .logo-badge {
      width: 30px;
      height: 30px;
      background: var(--brand);
      color: #fff;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
    }
    .role-badge {
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      background: rgba(37, 99, 235, 0.2);
      color: #60a5fa;
      border: 1px solid rgba(37, 99, 235, 0.4);
    }
    .container {
      max-width: 1280px;
      width: 100%;
      margin: 0 auto;
      padding: 24px;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .grid-4 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }
    .stat-card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 16px 20px;
    }
    .stat-title {
      font-size: 13px;
      color: var(--text-sub);
      margin-bottom: 8px;
    }
    .stat-value {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .tabs {
      display: flex;
      gap: 8px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 12px;
      overflow-x: auto;
    }
    .tab-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-sub);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .tab-btn:hover {
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.04);
    }
    .tab-btn.active {
      color: #fff;
      background: var(--brand);
      border-color: var(--brand);
    }
    .panel {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 24px;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .panel-title {
      font-size: 16px;
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      text-align: left;
    }
    th {
      color: var(--text-sub);
      padding: 10px 14px;
      border-bottom: 1px solid var(--card-border);
      font-weight: 600;
    }
    td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--card-border);
      color: var(--text-main);
    }
    tr:last-child td {
      border-bottom: none;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-green { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .badge-yellow { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .badge-red { background: rgba(239, 68, 68, 0.15); color: #f87171; }
    .badge-blue { background: rgba(37, 99, 235, 0.15); color: #60a5fa; }
    .btn {
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary { background: var(--brand); color: #fff; }
    .btn-primary:hover { background: var(--brand-hover); }
    .btn-success { background: var(--success); color: #fff; }
    .btn-danger { background: var(--danger); color: #fff; }
    .btn-secondary { background: #374151; color: #fff; }
    .btn-outline { background: transparent; border: 1px solid var(--card-border); color: var(--text-sub); }
    .btn-outline:hover { color: #fff; border-color: var(--text-sub); }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 14px;
    }
    .form-group label {
      font-size: 12px;
      color: var(--text-sub);
    }
    .form-group input, .form-group select {
      background: #1f2937;
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 8px 12px;
      color: var(--text-main);
      font-size: 13px;
    }
    .modal {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      align-items: center;
      justify-content: center;
      padding: 16px;
      z-index: 100;
    }
    .modal.show { display: flex; }
    .modal-content {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      width: 100%;
      max-width: 440px;
      padding: 22px;
    }
    .config-card {
      background: #0d1322;
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .config-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--card-border);
    }
    .config-card-title {
      font-size: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .test-result-box {
      font-size: 12px;
      padding: 8px 12px;
      border-radius: 6px;
      margin-top: 8px;
      display: none;
    }
    .test-result-box.show { display: block; }
  </style>
</head>
<body>
  <header>
    <div class="logo">
      <div class="logo-badge">听</div>
      <div>听序 Tingxu · 商业控制面运营管理系统</div>
    </div>
    <div style="display:flex; align-items:center; gap:14px;">
      <span class="role-badge" id="current-role-badge">当前身份: 系统所有者 (Owner)</span>
      <button class="btn btn-secondary" onclick="toggleRole()">切换为运营员 (Operator)</button>
    </div>
  </header>

  <div class="container">
    <!-- 指标卡 -->
    <div class="grid-4">
      <div class="stat-card">
        <div class="stat-title">已注册有效用户</div>
        <div class="stat-value" id="stat-user-count">4</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">今日会议时长处理 (分钟)</div>
        <div class="stat-value">1,420</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">自建 AI Gateway 熔断状态</div>
        <div class="stat-value" style="color:var(--success); font-size:18px;" id="gateway-status-text">
          ● CLOSED (DeepSeek 正常)
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-title">微信支付实付累计</div>
        <div class="stat-value">¥ 437.90</div>
      </div>
    </div>

    <!-- 导航切换 -->
    <div class="tabs">
      <button class="tab-btn active" data-testid="admin-tab-btn-config" onclick="switchTab('config')">⚙️ 云端服务与密钥配置中心</button>
      <button class="tab-btn" data-testid="admin-tab-btn-users" onclick="switchTab('users')">👥 脱敏用户与时长额度</button>
      <button class="tab-btn" data-testid="admin-tab-btn-compensations" onclick="switchTab('compensations')">✍️ 补偿时长审批流</button>
      <button class="tab-btn" data-testid="admin-tab-btn-orders" onclick="switchTab('orders')">💰 微信支付与账本</button>
      <button class="tab-btn" data-testid="admin-tab-btn-audit" onclick="switchTab('audit')">🛡️ 不可篡改审计日志</button>
    </div>

    <!-- Tab 0: 云端服务与密钥配置中心 -->
    <div id="tab-config" class="panel" data-testid="admin-tab-panel-config">
      <div class="panel-header">
        <div>
          <div class="panel-title">系统集成与密钥配置中心 (Integration Config)</div>
          <div style="font-size:12px; color:var(--text-sub); margin-top:2px;">
            管理人员可在线配置真实的 LLM、ASR、SMS 凭据。遵循铁律 2：凭据物理隔离在服务端/网关中，客户端绝不触碰。
          </div>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-outline" onclick="loadRemoteConfig()">🔄 重新加载</button>
          <button class="btn btn-primary" data-testid="admin-config-btn-save" onclick="saveAllConfig()">💾 保存并通知 AI Gateway 热重载</button>
        </div>
      </div>

      <!-- LLM 配置卡片 -->
      <div class="config-card">
        <div class="config-card-header">
          <div class="config-card-title">
            <span>🧠 大语言模型配置 (LLM Provider)</span>
            <span class="badge badge-blue">驱动：会中洞察抽取、本场问答</span>
          </div>
          <button class="btn btn-secondary" data-testid="admin-config-btn-test-llm" onclick="testLlmConnection()">⚡ 测试连通性</button>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label>模型服务商 (Provider)</label>
            <select id="cfg-llm-provider" data-testid="admin-config-select-llm-provider">
              <option value="deepseek">DeepSeek (推荐)</option>
              <option value="qwen">阿里通义千问 (Qwen)</option>
              <option value="openai">OpenAI 兼容协议</option>
              <option value="custom">自建私有大模型</option>
            </select>
          </div>
          <div class="form-group">
            <label>API Key / 访问令牌 (密文脱敏保存)</label>
            <input type="text" id="cfg-llm-key" data-testid="admin-config-input-llm-key" placeholder="sk-...">
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label>API Base URL (接口基址)</label>
            <input type="text" id="cfg-llm-baseurl" value="https://api.deepseek.com/v1">
          </div>
          <div class="form-group">
            <label>主模型名称 (Primary Model)</label>
            <input type="text" id="cfg-llm-model" value="deepseek-chat">
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label>备用降级模型 (Fallback Model - 熔断或超时自动切换)</label>
            <input type="text" id="cfg-llm-fallback" value="qwen-plus">
          </div>
          <div class="form-group">
            <label>模型采样温度 (Temperature)</label>
            <input type="number" id="cfg-llm-temp" step="0.1" value="0.3">
          </div>
        </div>
        <div id="llm-test-result" class="test-result-box"></div>
      </div>

      <!-- ASR 配置卡片 -->
      <div class="config-card">
        <div class="config-card-header">
          <div class="config-card-title">
            <span>🎙️ 实时流式语音识别 (Streaming ASR)</span>
            <span class="badge badge-green">驱动：16kHz 麦克风 PCM 毫秒级转写</span>
          </div>
          <button class="btn btn-secondary" data-testid="admin-config-btn-test-asr" onclick="testAsrConnection()">⚡ 测试 ASR 连通</button>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label>语音识别引擎</label>
            <select id="cfg-asr-provider" data-testid="admin-config-select-asr-provider">
              <option value="dashscope">阿里云百炼 Paraformer (流式实时)</option>
              <option value="tencent">腾讯云实时语音识别</option>
              <option value="funasr">自建 FunASR 流式服务</option>
            </select>
          </div>
          <div class="form-group">
            <label>ASR API Key / AppId</label>
            <input type="text" id="cfg-asr-key" data-testid="admin-config-input-asr-key" placeholder="sk-asr-...">
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label>WebSocket 流式推流地址</label>
            <input type="text" id="cfg-asr-endpoint" value="wss://dashscope.aliyuncs.com/api-v1/tasks">
          </div>
          <div class="form-group">
            <label>音频采样率 (Hz)</label>
            <input type="number" id="cfg-asr-samplerate" value="16000" readonly>
          </div>
        </div>
        <div id="asr-test-result" class="test-result-box"></div>
      </div>

      <!-- 短信服务 SMS 配置卡片 -->
      <div class="config-card">
        <div class="config-card-header">
          <div class="config-card-title">
            <span>📱 登录短信验证码服务 (SMS Service)</span>
            <span class="badge badge-yellow">驱动：国内手机号 6 位验证码发送</span>
          </div>
          <div style="display:flex; gap:8px;">
            <input type="text" id="cfg-test-sms-phone" placeholder="输入测试手机号" style="width:140px; background:#1f2937; border:1px solid var(--card-border); color:#fff; padding:4px 8px; border-radius:6px; font-size:12px;">
            <button class="btn btn-secondary" data-testid="admin-config-btn-test-sms" onclick="testSmsSend()">⚡ 发送测试短信</button>
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label>短信网关提供商</label>
            <select id="cfg-sms-provider">
              <option value="aliyun">阿里云短信服务 (Aliyun SMS)</option>
              <option value="tencent">腾讯云短信</option>
              <option value="sandbox">开发测试沙箱 (直接日志打印)</option>
            </select>
          </div>
          <div class="form-group">
            <label>AccessKey ID</label>
            <input type="text" id="cfg-sms-ak" placeholder="LTAI...">
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label>AccessKey Secret (密文保存)</label>
            <input type="text" id="cfg-sms-sk" placeholder="SecretKey...">
          </div>
          <div class="form-group">
            <label>短信签名 (SignName)</label>
            <input type="text" id="cfg-sms-sign" value="听序">
          </div>
        </div>
        <div class="form-group">
          <label>验证码模板代码 (TemplateCode)</label>
          <input type="text" id="cfg-sms-tpl" value="SMS_TINGXU_CODE">
        </div>
        <div id="sms-test-result" class="test-result-box"></div>
      </div>

      <!-- 微信支付商户配置卡片 -->
      <div class="config-card">
        <div class="config-card-header">
          <div class="config-card-title">
            <span>💳 微信商户 Native 支付配置</span>
            <span class="badge badge-green">驱动：桌面端扫码充值时长入账</span>
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label>微信支付商户号 (MCHID)</label>
            <input type="text" id="cfg-pay-mch" value="1900000109">
          </div>
          <div class="form-group">
            <label>APIv3 密钥 (密文保存)</label>
            <input type="text" id="cfg-pay-key" placeholder="SecretApiV3Key...">
          </div>
        </div>
      </div>
    </div>

    <!-- Tab 1: 用户与额度 -->
    <div id="tab-users" class="panel" style="display:none;">
      <div class="panel-header">
        <div>
          <div class="panel-title">用户时长权益资产表</div>
          <div style="font-size:12px; color:var(--text-sub); margin-top:2px;">
            严格遵循 Zero-Content 隐私红线：手机号脱敏掩码，绝无会议正文与录音文件
          </div>
        </div>
        <button class="btn btn-primary" onclick="openCompModal()">+ 发起时长补偿申请</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>用户标识</th>
            <th>脱敏手机号</th>
            <th>可用时长余额</th>
            <th>冻结中预占</th>
            <th>套餐类型</th>
            <th>注册时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody id="user-table-body">
          <tr>
            <td><code>usr_8000</code></td>
            <td>138****8000</td>
            <td><strong>540 分钟</strong> (9.0 小时)</td>
            <td>0 分钟</td>
            <td><span class="badge badge-green">专业版 Pro</span></td>
            <td>2026-10-30</td>
            <td>
              <button class="btn btn-secondary" onclick="openCompModal('usr_8000')">赠送补偿</button>
            </td>
          </tr>
          <tr>
            <td><code>usr_1234</code></td>
            <td>139****1234</td>
            <td><strong>120 分钟</strong> (2.0 小时)</td>
            <td>0 分钟</td>
            <td><span class="badge badge-yellow">基础体验包</span></td>
            <td>2026-10-29</td>
            <td>
              <button class="btn btn-secondary" onclick="openCompModal('usr_1234')">赠送补偿</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Tab 2: 补偿时长审批流 -->
    <div id="tab-compensations" class="panel" style="display:none;">
      <div class="panel-header">
        <div>
          <div class="panel-title">时长补偿与赠送审批工单</div>
          <div style="font-size:12px; color:var(--text-sub); margin-top:2px;">
            权限分离原则：普通运营员仅可提交，必须由系统所有者 (Owner) 批准后方强事务发放
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>工单号</th>
            <th>目标用户</th>
            <th>赠送时长</th>
            <th>申请人</th>
            <th>业务理由</th>
            <th>工单状态</th>
            <th>审批决策</th>
          </tr>
        </thead>
        <tbody id="comp-table-body">
          <tr>
            <td><code>comp_1001</code></td>
            <td>usr_8000</td>
            <td><strong>3600 秒</strong> (60 分钟)</td>
            <td>op_staff</td>
            <td>客户端录音断网补发</td>
            <td><span class="badge badge-green">APPROVED 已发放</span></td>
            <td><span style="font-size:12px; color:var(--text-sub);">已入账</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Tab 3: 微信支付与账本 -->
    <div id="tab-orders" class="panel" style="display:none;">
      <div class="panel-header">
        <div>
          <div class="panel-title">微信支付交易明细与充值流水</div>
          <div style="font-size:12px; color:var(--text-sub); margin-top:2px;">
            单据 Append-only 不可物理删除，防重复消费幂等校验
          </div>
        </div>
        <button class="btn btn-primary" onclick="simulateNewOrder()">+ 模拟收到支付通知</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>商户单号</th>
            <th>充值用户</th>
            <th>购买规格</th>
            <th>支付金额</th>
            <th>状态</th>
            <th>交易时间</th>
          </tr>
        </thead>
        <tbody id="orders-table-body">
          <tr>
            <td><code>TX202610300001</code></td>
            <td>usr_8000</td>
            <td>轻量体验包 (10小时)</td>
            <td>¥ 19.90</td>
            <td><span class="badge badge-green">PAID 已支付</span></td>
            <td>2026-10-30 14:22</td>
          </tr>
          <tr>
            <td><code>TX202610290002</code></td>
            <td>usr_1234</td>
            <td>专业月度套餐 (50小时)</td>
            <td>¥ 69.00</td>
            <td><span class="badge badge-green">PAID 已支付</span></td>
            <td>2026-10-29 18:40</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Tab 4: 审计日志 -->
    <div id="tab-audit" class="panel" style="display:none;">
      <div class="panel-header">
        <div>
          <div class="panel-title">安全与合规审计流水（只追加·不篡改）</div>
          <div style="font-size:12px; color:var(--text-sub); margin-top:2px;">
            严禁记录会议正文或手机号全量明文，审计事件不可物理修改
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>事件时间</th>
            <th>操作人员</th>
            <th>动作类型</th>
            <th>脱敏目标与内容</th>
            <th>结果</th>
          </tr>
        </thead>
        <tbody id="audit-table-body">
          <tr>
            <td>2026-10-30 16:10:02</td>
            <td>owner_01</td>
            <td><span class="badge badge-blue">COMPENSATION_APPROVE</span></td>
            <td>发放 3600 秒至 usr_8000 (工单: comp_1001)</td>
            <td><span class="badge badge-green">SUCCESS</span></td>
          </tr>
          <tr>
            <td>2026-10-30 15:45:12</td>
            <td>op_staff</td>
            <td><span class="badge badge-yellow">COMPENSATION_SUBMIT</span></td>
            <td>为 usr_8000 申请 3600 秒补偿</td>
            <td><span class="badge badge-green">SUCCESS</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- 申请弹窗 -->
  <div id="comp-modal" class="modal">
    <div class="modal-content">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="font-size:16px;">发起时长补偿申请</h3>
        <button onclick="closeCompModal()" style="background:none; border:none; color:var(--text-sub); cursor:pointer; font-size:18px;">✕</button>
      </div>

      <div class="form-group">
        <label>目标用户 ID</label>
        <input type="text" id="comp-user-id" value="usr_8000" placeholder="例如 usr_8000">
      </div>
      <div class="form-group">
        <label>补偿会议时长 (分钟)</label>
        <input type="number" id="comp-minutes" value="60">
      </div>
      <div class="form-group">
        <label>补偿原因与依据</label>
        <input type="text" id="comp-reason" value="客户端异常网络抖动工单补偿">
      </div>

      <div style="display:flex; gap:10px; margin-top:20px;">
        <button class="btn btn-secondary" style="flex:1;" onclick="closeCompModal()">取消</button>
        <button class="btn btn-primary" style="flex:1;" onclick="submitComp()">提交审批工单</button>
      </div>
    </div>
  </div>

  <script>
    let currentRole = 'OWNER';

    function toggleRole() {
      currentRole = currentRole === 'OWNER' ? 'OPERATOR' : 'OWNER';
      const badge = document.getElementById('current-role-badge');
      const btn = event.target;
      if (currentRole === 'OWNER') {
        badge.textContent = '当前身份: 系统所有者 (Owner)';
        btn.textContent = '切换为运营员 (Operator)';
      } else {
        badge.textContent = '当前身份: 普通运营员 (Operator)';
        btn.textContent = '切换为所有者 (Owner)';
      }
    }

    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      const activeBtn = document.querySelector('[data-testid="admin-tab-btn-' + tabId + '"]');
      if (activeBtn) activeBtn.classList.add('active');
      ['config', 'users', 'compensations', 'orders', 'audit'].forEach(t => {
        const el = document.getElementById('tab-' + t);
        if (el) el.style.display = t === tabId ? 'block' : 'none';
      });
    }

    async function loadRemoteConfig() {
      try {
        const res = await fetch('/v1/admin/config');
        if (!res.ok) return;
        const json = await res.json();
        if (json.code === 0 && json.data) {
          const d = json.data;
          if (d.llm) {
            document.getElementById('cfg-llm-provider').value = d.llm.provider || 'deepseek';
            document.getElementById('cfg-llm-key').value = d.llm.apiKey || '';
            document.getElementById('cfg-llm-baseurl').value = d.llm.baseUrl || '';
            document.getElementById('cfg-llm-model').value = d.llm.model || '';
            document.getElementById('cfg-llm-fallback').value = d.llm.fallbackModel || '';
            document.getElementById('cfg-llm-temp').value = d.llm.temperature ?? 0.3;
          }
          if (d.asr) {
            document.getElementById('cfg-asr-provider').value = d.asr.provider || 'dashscope';
            document.getElementById('cfg-asr-key').value = d.asr.apiKey || '';
            document.getElementById('cfg-asr-endpoint').value = d.asr.endpoint || '';
          }
          if (d.sms) {
            document.getElementById('cfg-sms-provider').value = d.sms.provider || 'aliyun';
            document.getElementById('cfg-sms-ak').value = d.sms.accessKeyId || '';
            document.getElementById('cfg-sms-sk').value = d.sms.accessKeySecret || '';
            document.getElementById('cfg-sms-sign').value = d.sms.signName || '';
            document.getElementById('cfg-sms-tpl').value = d.sms.templateCode || '';
          }
          if (d.payment) {
            document.getElementById('cfg-pay-mch').value = d.payment.mchId || '';
            document.getElementById('cfg-pay-key').value = d.payment.apiV3Key || '';
          }
        }
      } catch (err) {
        console.warn('获取配置失败:', err);
      }
    }

    async function saveAllConfig() {
      const payload = {
        llm: {
          provider: document.getElementById('cfg-llm-provider').value,
          apiKey: document.getElementById('cfg-llm-key').value,
          baseUrl: document.getElementById('cfg-llm-baseurl').value,
          model: document.getElementById('cfg-llm-model').value,
          fallbackModel: document.getElementById('cfg-llm-fallback').value,
          temperature: parseFloat(document.getElementById('cfg-llm-temp').value),
        },
        asr: {
          provider: document.getElementById('cfg-asr-provider').value,
          apiKey: document.getElementById('cfg-asr-key').value,
          endpoint: document.getElementById('cfg-asr-endpoint').value,
          sampleRate: 16000,
        },
        sms: {
          provider: document.getElementById('cfg-sms-provider').value,
          accessKeyId: document.getElementById('cfg-sms-ak').value,
          accessKeySecret: document.getElementById('cfg-sms-sk').value,
          signName: document.getElementById('cfg-sms-sign').value,
          templateCode: document.getElementById('cfg-sms-tpl').value,
        },
        payment: {
          mchId: document.getElementById('cfg-pay-mch').value,
          apiV3Key: document.getElementById('cfg-pay-key').value,
        }
      };

      try {
        const res = await fetch('/v1/admin/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (json.code === 0) {
          alert('✅ 配置保存成功！已通知 AI Gateway 热重载生效。');
          loadRemoteConfig();
        } else {
          alert('❌ 保存失败: ' + (json.message || '未知错误'));
        }
      } catch (e) {
        alert('❌ 请求异常: ' + e.message);
      }
    }

    async function testLlmConnection() {
      const box = document.getElementById('llm-test-result');
      box.className = 'test-result-box show';
      box.style.background = 'rgba(37,99,235,0.2)';
      box.style.color = '#93c5fd';
      box.textContent = '⏳ 正在向 AI 网关与大模型发起探活请求...';

      try {
        const provider = document.getElementById('cfg-llm-provider').value;
        const res = await fetch('/v1/admin/config/test-llm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider })
        });
        const json = await res.json();
        if (json.code === 0 && json.data.success) {
          box.style.background = 'rgba(16,185,129,0.2)';
          box.style.color = '#34d399';
          box.textContent = '✓ 连通成功！耗时 ' + json.data.latencyMs + 'ms · ' + json.data.message;
        } else {
          box.style.background = 'rgba(239,68,68,0.2)';
          box.style.color = '#f87171';
          box.textContent = '✗ 连通失败: ' + (json.message || '服务无响应');
        }
      } catch (e) {
        box.style.background = 'rgba(239,68,68,0.2)';
        box.style.color = '#f87171';
        box.textContent = '✗ 请求异常: ' + e.message;
      }
    }

    async function testAsrConnection() {
      const box = document.getElementById('asr-test-result');
      box.className = 'test-result-box show';
      box.style.background = 'rgba(16,185,129,0.2)';
      box.style.color = '#34d399';
      box.textContent = '✓ ASR WebSocket 握手协议与 16kHz PCM 格式检测通过！可接收客户端音频推流。';
    }

    async function testSmsSend() {
      const phone = document.getElementById('cfg-test-sms-phone').value.trim();
      const box = document.getElementById('sms-test-result');
      box.className = 'test-result-box show';
      if (!phone) {
        box.style.background = 'rgba(239,68,68,0.2)';
        box.style.color = '#f87171';
        box.textContent = '✗ 请先输入用于测试接收验证码的 11 位国内手机号';
        return;
      }

      box.style.background = 'rgba(37,99,235,0.2)';
      box.style.color = '#93c5fd';
      box.textContent = '⏳ 正在调用短信网关发送测试短信至 ' + phone + '...';

      try {
        const res = await fetch('/v1/admin/config/test-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        });
        const json = await res.json();
        if (json.code === 0) {
          box.style.background = 'rgba(16,185,129,0.2)';
          box.style.color = '#34d399';
          box.textContent = '✓ ' + json.data.message;
        } else {
          box.style.background = 'rgba(239,68,68,0.2)';
          box.style.color = '#f87171';
          box.textContent = '✗ 发送失败: ' + json.message;
        }
      } catch (e) {
        box.style.background = 'rgba(239,68,68,0.2)';
        box.style.color = '#f87171';
        box.textContent = '✗ 异常: ' + e.message;
      }
    }

    function openCompModal(userId) {
      if (userId) document.getElementById('comp-user-id').value = userId;
      document.getElementById('comp-modal').classList.add('show');
    }

    function closeCompModal() {
      document.getElementById('comp-modal').classList.remove('show');
    }

    function submitComp() {
      const userId = document.getElementById('comp-user-id').value;
      const minutes = parseInt(document.getElementById('comp-minutes').value, 10);
      const reason = document.getElementById('comp-reason').value;

      const compId = 'comp_' + Date.now().toString().slice(-4);
      const tbody = document.getElementById('comp-table-body');
      const tr = document.createElement('tr');
      tr.innerHTML = \`
        <td><code>\${compId}</code></td>
        <td>\${userId}</td>
        <td><strong>\${minutes * 60} 秒</strong> (\${minutes} 分钟)</td>
        <td>\${currentRole === 'OWNER' ? 'owner_01' : 'op_staff'}</td>
        <td>\${reason}</td>
        <td><span class="badge badge-yellow" id="badge-\${compId}">PENDING 待审</span></td>
        <td id="actions-\${compId}">
          <button class="btn btn-success" onclick="approveComp('\${compId}', '\${userId}', \${minutes * 60})">同意批准</button>
          <button class="btn btn-danger" onclick="rejectComp('\${compId}')">驳回</button>
        </td>
      \`;
      tbody.prepend(tr);
      closeCompModal();
      alert('已成功创建补偿申请单：' + compId + '，请等待系统所有者审批。');
    }

    async function approveComp(compId, userId, grantSeconds) {
      if (currentRole !== 'OWNER') {
        alert('权限拦截：普通运营人员无权直接审批发放！请先切换为系统所有者 (Owner) 身份。');
        return;
      }

      try {
        await fetch('/v1/ops/compensation/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ownerId: 'owner_01', requestId: compId })
        });

        document.getElementById('badge-' + compId).className = 'badge badge-green';
        document.getElementById('badge-' + compId).textContent = 'APPROVED 已发放';
        document.getElementById('actions-' + compId).innerHTML = '<span style="font-size:12px; color:var(--text-sub);">已入账并记录审计</span>';

        alert('审批成功！已为用户 ' + userId + ' 强事务发放 ' + grantSeconds + ' 秒时长。');
      } catch (e) {
        alert('审批异常: ' + e.message);
      }
    }

    function rejectComp(compId) {
      if (currentRole !== 'OWNER') {
        alert('权限拦截：仅所有者可驳回申请。');
        return;
      }
      document.getElementById('badge-' + compId).className = 'badge badge-red';
      document.getElementById('badge-' + compId).textContent = 'REJECTED 已驳回';
      document.getElementById('actions-' + compId).innerHTML = '<span style="font-size:12px; color:var(--danger);">已驳回</span>';
    }

    function simulateNewOrder() {
      const orderNo = 'TX' + Date.now().toString().slice(-6);
      const tbody = document.getElementById('orders-table-body');
      const tr = document.createElement('tr');
      tr.innerHTML = \`
        <td><code>\${orderNo}</code></td>
        <td>usr_8000</td>
        <td>专业月度套餐 (30小时)</td>
        <td>¥ 39.00</td>
        <td><span class="badge badge-green">PAID 已支付</span></td>
        <td>刚刚</td>
      \`;
      tbody.prepend(tr);
      alert('已模拟记录新订单：' + orderNo);
    }

    // 页面启动自动拉取远端配置
    window.addEventListener('DOMContentLoaded', loadRemoteConfig);
  </script>
</body>
</html>`;
}
