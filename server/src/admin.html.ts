/**
 * 听序（Tingxu）商业控制面 Web 运营管理后台
 * 严格遵循真实接入原则与 Zero-Content 隐私红线，严禁伪造假数据
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
      font-variant-numeric: tabular-nums;
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
    .empty-state-row td {
      text-align: center;
      padding: 32px 16px;
      color: var(--text-sub);
      font-size: 13px;
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
    .form-group input::placeholder {
      color: #6b7280;
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
    
    /* 登录弹窗遮罩 */
    #login-overlay {
      position: fixed;
      inset: 0;
      background: rgba(9, 13, 22, 0.95);
      backdrop-filter: blur(8px);
      z-index: 999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .login-box {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      width: 100%;
      max-width: 420px;
      padding: 32px 28px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .login-box h2 {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .login-sub {
      font-size: 13px;
      color: var(--text-sub);
      margin-bottom: 24px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <!-- 超级密码登录浮层 (未认证时呈现) -->
  <div id="login-overlay" style="display:none;">
    <div class="login-box">
      <h2>
        <span class="logo-badge" style="width:26px; height:26px; font-size:13px;">听</span>
        <span>听序 Tingxu · 管理员登录</span>
      </h2>
      <p class="login-sub">商业控制面受超级密码保护，请输入管理员密码后继续管理系统凭据与业务账本。</p>
      
      <div class="form-group">
        <label for="admin-super-password">超级管理密码 (Super Password)</label>
        <input type="password" id="admin-super-password" placeholder="请输入超级管理密码" autocomplete="current-password">
      </div>
      <div id="login-error-msg" style="color:var(--danger); font-size:12px; margin-bottom:12px; display:none;"></div>
      
      <button class="btn btn-primary" id="admin-btn-login" style="width:100%; padding:10px; font-size:14px;" onclick="doAdminLogin()">
        登入管理控制台
      </button>

      <div style="margin-top:16px; font-size:11px; color:var(--text-sub); line-height:1.5;">
        💡 初始默认密码为 <code>tingxu2026</code>（可在服务启动环境变量 <code>ADMIN_SUPER_PASSWORD</code> 中自定义）。
      </div>
    </div>
  </div>

  <!-- 主控制台 -->
  <header>
    <div class="logo">
      <div class="logo-badge">听</div>
      <div>听序 Tingxu · 商业控制面运营管理系统</div>
    </div>
    <div style="display:flex; align-items:center; gap:14px;">
      <span class="role-badge" id="current-role-badge">当前身份: 系统所有者 (Owner)</span>
      <button class="btn btn-outline" onclick="doAdminLogout()">退出登录</button>
    </div>
  </header>

  <div class="container" id="admin-main-container">
    <!-- 真实指标卡 -->
    <div class="grid-4">
      <div class="stat-card">
        <div class="stat-title">已注册有效用户</div>
        <div class="stat-value" id="stat-user-count">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">今日会议时长处理 (分钟)</div>
        <div class="stat-value" id="stat-meeting-minutes">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">自建 AI Gateway 熔断状态</div>
        <div class="stat-value" style="color:var(--success); font-size:16px;" id="stat-gateway-status">
          ● CLOSED (正常运行)
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-title">微信支付实付累计</div>
        <div class="stat-value" id="stat-total-paid">¥ 0.00</div>
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

      <!-- 真实配置说明横幅 -->
      <div style="background:rgba(37,99,235,0.1); border:1px solid rgba(37,99,235,0.3); border-radius:8px; padding:10px 14px; margin-bottom:18px; font-size:12px; color:#93c5fd; display:flex; align-items:center; gap:8px;">
        <span style="font-size:16px;">💡</span>
        <span><strong>配置接入说明：</strong>系统不预置任何虚假秘钥，未配置项目均为空栏位。请填入您在阿里云或大模型平台申请的真实密钥并保存，系统将即刻生效。</span>
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
            <input type="text" id="cfg-llm-key" data-testid="admin-config-input-llm-key" placeholder="例如 sk-...">
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label>API Base URL (接口基址)</label>
            <input type="text" id="cfg-llm-baseurl" placeholder="https://api.deepseek.com/v1">
          </div>
          <div class="form-group">
            <label>主模型名称 (Primary Model)</label>
            <input type="text" id="cfg-llm-model" placeholder="deepseek-chat">
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label>备用降级模型 (Fallback Model)</label>
            <input type="text" id="cfg-llm-fallback" placeholder="qwen-plus">
          </div>
          <div class="form-group">
            <label>模型采样温度 (Temperature)</label>
            <input type="number" id="cfg-llm-temp" step="0.1" placeholder="0.3">
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
            <input type="text" id="cfg-asr-key" data-testid="admin-config-input-asr-key" placeholder="例如 sk-asr-...">
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label>WebSocket 流式推流地址</label>
            <input type="text" id="cfg-asr-endpoint" placeholder="wss://dashscope.aliyuncs.com/api-v1/tasks">
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
            <input type="text" id="cfg-sms-ak" placeholder="例如 LTAI5t...">
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label>AccessKey Secret (密文保存)</label>
            <input type="text" id="cfg-sms-sk" placeholder="例如 SecretKey...">
          </div>
          <div class="form-group">
            <label>短信签名 (SignName)</label>
            <input type="text" id="cfg-sms-sign" placeholder="例如 听序">
          </div>
        </div>
        <div class="form-group">
          <label>验证码模板代码 (TemplateCode)</label>
          <input type="text" id="cfg-sms-tpl" placeholder="例如 SMS_123456789">
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
            <input type="text" id="cfg-pay-mch" placeholder="例如 1900000109">
          </div>
          <div class="form-group">
            <label>APIv3 密钥 (密文保存)</label>
            <input type="text" id="cfg-pay-key" placeholder="例如 32位APIv3密钥">
          </div>
        </div>
      </div>
    </div>

    <!-- Tab 1: 用户与额度 -->
    <div id="tab-users" class="panel" style="display:none;">
      <div class="panel-header" style="margin-bottom:16px;">
        <div>
          <div class="panel-title">用户时长权益资产表</div>
          <div style="font-size:12px; color:var(--text-sub); margin-top:2px;">
            严格遵循 Zero-Content 隐私红线：手机号脱敏掩码，绝无会议正文与录音文件
          </div>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <button class="btn btn-outline" onclick="loadUsers(currentUserPage)">🔄 刷新数据</button>
        </div>
      </div>

      <!-- 手机号快速定位与过滤栏 -->
      <div style="display:flex; justify-content:space-between; align-items:center; background:#0d1322; border:1px solid var(--card-border); border-radius:8px; padding:12px 16px; margin-bottom:16px; gap:12px; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:8px; flex:1; max-width:480px;">
          <input 
            type="text" 
            id="admin-users-search-input" 
            data-testid="admin-users-input-search-phone" 
            placeholder="输入手机号快速定位用户（支持完整手机号或前缀/后缀）..." 
            style="flex:1; background:#1f2937; border:1px solid var(--card-border); border-radius:6px; padding:8px 12px; color:var(--text-main); font-size:13px;"
            onkeydown="if(event.key==='Enter') doSearchUsers()"
          >
          <button class="btn btn-primary" data-testid="admin-users-btn-search" onclick="doSearchUsers()">🔍 搜索</button>
          <button class="btn btn-outline" data-testid="admin-users-btn-reset" onclick="resetSearchUsers()">重置</button>
        </div>
        <div id="users-search-status-tip" style="font-size:12px; color:var(--text-sub);"></div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:180px;">用户标识</th>
            <th style="width:160px;">脱敏手机号</th>
            <th style="width:200px;">剩余可用时长</th>
            <th style="width:140px;">预占冻结时长</th>
            <th>注册时间</th>
          </tr>
        </thead>
        <tbody id="user-table-body">
          <tr class="empty-state-row">
            <td colspan="5">暂无注册用户，客户端用户首次手机短信登录后将在此展示（已脱敏）。</td>
          </tr>
        </tbody>
      </table>

      <!-- 分页控制栏 -->
      <div 
        id="admin-users-pagination-bar" 
        data-testid="admin-users-pagination-bar" 
        style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; padding-top:16px; border-top:1px solid var(--card-border); font-size:13px; color:var(--text-sub);"
      >
        <div data-testid="admin-users-pagination-info" id="users-pagination-info">
          共 0 位用户，第 1 / 1 页
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span>每页:</span>
            <select 
              id="admin-users-page-size-select" 
              data-testid="admin-users-select-page-size" 
              style="background:#1f2937; border:1px solid var(--card-border); border-radius:6px; color:var(--text-main); padding:4px 8px; font-size:12px;"
              onchange="changeUsersPageSize(this.value)"
            >
              <option value="10">10 条/页</option>
              <option value="20">20 条/页</option>
              <option value="50">50 条/页</option>
            </select>
          </div>
          <button 
            class="btn btn-outline" 
            id="admin-users-btn-prev" 
            data-testid="admin-users-btn-prev-page" 
            onclick="goUsersPage(currentUserPage - 1)"
          >
            上一页
          </button>
          <span id="users-current-page-badge" style="padding:4px 10px; background:rgba(255,255,255,0.06); border-radius:6px; font-weight:600; color:var(--text-main);">
            1
          </span>
          <button 
            class="btn btn-outline" 
            id="admin-users-btn-next" 
            data-testid="admin-users-btn-next-page" 
            onclick="goUsersPage(currentUserPage + 1)"
          >
            下一页
          </button>
        </div>
      </div>
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
            <th>创建时间</th>
          </tr>
        </thead>
        <tbody id="comp-table-body">
          <tr class="empty-state-row">
            <td colspan="7">暂无时长补偿审批工单。</td>
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
            真实交易单据 Append-only 不可物理删除，防重复消费幂等校验
          </div>
        </div>
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
          <tr class="empty-state-row">
            <td colspan="6">暂无微信支付订单流水。用户在客户端发起充值后将实时入账。</td>
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
          </tr>
        </thead>
        <tbody id="audit-table-body">
          <tr class="empty-state-row">
            <td colspan="4">暂无安全审计日志。所有敏感权限操作将自动留痕。</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <script>
    // 页面初始化时检查认证状态
    async function checkAuthAndInit() {
      try {
        const res = await fetch('/v1/admin/session');
        if (res.ok) {
          document.getElementById('login-overlay').style.display = 'none';
          loadRemoteConfig();
          loadDashboardStats();
          loadUsers();
          loadCompensations();
          loadOrders();
          loadAuditLogs();
        } else {
          document.getElementById('login-overlay').style.display = 'flex';
        }
      } catch (err) {
        document.getElementById('login-overlay').style.display = 'flex';
      }
    }

    async function doAdminLogin() {
      const pwd = document.getElementById('admin-super-password').value;
      const errMsg = document.getElementById('login-error-msg');
      errMsg.style.display = 'none';
      if (!pwd) {
        errMsg.textContent = '请输入超级管理密码';
        errMsg.style.display = 'block';
        return;
      }

      try {
        const res = await fetch('/v1/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pwd })
        });
        const json = await res.json();
        if (res.ok && json.code === 0) {
          document.getElementById('login-overlay').style.display = 'none';
          loadRemoteConfig();
          loadDashboardStats();
        } else {
          errMsg.textContent = json.message || '超级密码错误，请核对后重试';
          errMsg.style.display = 'block';
        }
      } catch (e) {
        errMsg.textContent = '登录网络异常: ' + e.message;
        errMsg.style.display = 'block';
      }
    }

    async function doAdminLogout() {
      try {
        await fetch('/v1/admin/logout', { method: 'POST' });
      } finally {
        window.location.reload();
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

      if (tabId === 'users') loadUsers();
      if (tabId === 'compensations') loadCompensations();
      if (tabId === 'orders') loadOrders();
      if (tabId === 'audit') loadAuditLogs();
    }

    async function loadDashboardStats() {
      try {
        const res = await fetch('/v1/ops/stats');
        if (!res.ok) return;
        const json = await res.json();
        if (json.code === 0 && json.data) {
          document.getElementById('stat-user-count').textContent = json.data.userCount ?? 0;
          document.getElementById('stat-meeting-minutes').textContent = json.data.todayMeetingMinutes ?? 0;
          document.getElementById('stat-total-paid').textContent = '¥ ' + (Number(json.data.totalPaidAmount) || 0).toFixed(2);
          if (json.data.gatewayStatus) {
            document.getElementById('stat-gateway-status').textContent = json.data.gatewayStatus;
          }
        }
      } catch (err) {
        console.warn('获取真实指标失败:', err);
      }
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
            document.getElementById('cfg-llm-temp').value = d.llm.temperature ?? '';
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
          apiKey: document.getElementById('cfg-llm-key').value.trim(),
          baseUrl: document.getElementById('cfg-llm-baseurl').value.trim() || undefined,
          model: document.getElementById('cfg-llm-model').value.trim() || undefined,
          fallbackModel: document.getElementById('cfg-llm-fallback').value.trim() || undefined,
          temperature: document.getElementById('cfg-llm-temp').value ? parseFloat(document.getElementById('cfg-llm-temp').value) : undefined,
        },
        asr: {
          provider: document.getElementById('cfg-asr-provider').value,
          apiKey: document.getElementById('cfg-asr-key').value.trim(),
          endpoint: document.getElementById('cfg-asr-endpoint').value.trim() || undefined,
          sampleRate: 16000,
        },
        sms: {
          provider: document.getElementById('cfg-sms-provider').value,
          accessKeyId: document.getElementById('cfg-sms-ak').value.trim(),
          accessKeySecret: document.getElementById('cfg-sms-sk').value.trim(),
          signName: document.getElementById('cfg-sms-sign').value.trim() || undefined,
          templateCode: document.getElementById('cfg-sms-tpl').value.trim() || undefined,
        },
        payment: {
          mchId: document.getElementById('cfg-pay-mch').value.trim(),
          apiV3Key: document.getElementById('cfg-pay-key').value.trim(),
        },
      };

      try {
        const res = await fetch('/v1/admin/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (res.ok && json.code === 0) {
          alert('✅ 密钥配置已安全脱敏保存，并已通知 AI Gateway 热重载！');
          loadRemoteConfig();
        } else {
          alert('❌ 保存配置失败: ' + (json.message || '未知错误'));
        }
      } catch (e) {
        alert('❌ 网络请求失败: ' + e.message);
      }
    }

    async function testLlmConnection() {
      const provider = document.getElementById('cfg-llm-provider').value;
      const apiKey = document.getElementById('cfg-llm-key').value.trim();
      const baseUrl = document.getElementById('cfg-llm-baseurl').value.trim();
      const resultBox = document.getElementById('llm-test-result');
      resultBox.className = 'test-result-box show';

      if (!apiKey) {
        resultBox.style.background = 'rgba(239,68,68,0.15)';
        resultBox.style.color = '#f87171';
        resultBox.textContent = '❌ 请先在上方“API Key / 访问令牌”输入框中填入您的真实密钥后再点击测试。';
        return;
      }

      resultBox.style.background = 'rgba(255,255,255,0.05)';
      resultBox.style.color = 'var(--text-sub)';
      resultBox.textContent = '⏳ 正在向 [' + provider + '] 发起真实网络鉴权测试...';

      try {
        const res = await fetch('/v1/admin/config/test-llm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            apiKey,
            baseUrl: baseUrl || undefined,
          }),
        });
        const json = await res.json();
        if (json.data && json.data.success) {
          resultBox.style.background = 'rgba(16,185,129,0.15)';
          resultBox.style.color = '#34d399';
          resultBox.textContent = '✅ ' + json.data.message;
        } else {
          resultBox.style.background = 'rgba(239,68,68,0.15)';
          resultBox.style.color = '#f87171';
          resultBox.textContent = '❌ ' + ((json.data && json.data.message) || json.message || '连通失败');
        }
      } catch (e) {
        resultBox.style.background = 'rgba(239,68,68,0.15)';
        resultBox.style.color = '#f87171';
        resultBox.textContent = '❌ 探活失败: ' + e.message;
      }
    }

    async function testAsrConnection() {
      const provider = document.getElementById('cfg-asr-provider').value;
      const key = document.getElementById('cfg-asr-key').value.trim();
      const endpoint = document.getElementById('cfg-asr-endpoint').value.trim();
      const resultBox = document.getElementById('asr-test-result');
      resultBox.className = 'test-result-box show';

      if (!key) {
        resultBox.style.background = 'rgba(239,68,68,0.15)';
        resultBox.style.color = '#f87171';
        resultBox.textContent = '❌ 请先在“ASR API Key”输入框中填入您的真实密钥后再点击测试。';
        return;
      }

      resultBox.style.background = 'rgba(255,255,255,0.05)';
      resultBox.style.color = 'var(--text-sub)';
      resultBox.textContent = '⏳ 正在向 [' + provider + '] ASR 平台发起真实 API Key 鉴权验证...';

      try {
        const res = await fetch('/v1/admin/config/test-asr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            apiKey: key,
            endpoint: endpoint || undefined,
          }),
        });
        const json = await res.json();
        if (json.data && json.data.success) {
          resultBox.style.background = 'rgba(16,185,129,0.15)';
          resultBox.style.color = '#34d399';
          resultBox.textContent = '✅ ' + json.data.message;
        } else {
          resultBox.style.background = 'rgba(239,68,68,0.15)';
          resultBox.style.color = '#f87171';
          resultBox.textContent = '❌ ' + ((json.data && json.data.message) || json.message || 'ASR 鉴权失败');
        }
      } catch (e) {
        resultBox.style.background = 'rgba(239,68,68,0.15)';
        resultBox.style.color = '#f87171';
        resultBox.textContent = '❌ ASR 探活异常: ' + e.message;
      }
    }

    async function testSmsSend() {
      const phone = document.getElementById('cfg-test-sms-phone').value.trim();
      const resultBox = document.getElementById('sms-test-result');
      resultBox.className = 'test-result-box show';

      if (!phone || !/^1[3-9]\\d{9}$/.test(phone)) {
        resultBox.style.background = 'rgba(239,68,68,0.15)';
        resultBox.style.color = '#f87171';
        resultBox.textContent = '❌ 请先在输入框中填写真实的 11 位国内手机号';
        return;
      }

      const payload = {
        phone,
        provider: document.getElementById('cfg-sms-provider').value,
        accessKeyId: document.getElementById('cfg-sms-ak').value.trim(),
        accessKeySecret: document.getElementById('cfg-sms-sk').value.trim(),
        signName: document.getElementById('cfg-sms-sign').value.trim(),
        templateCode: document.getElementById('cfg-sms-tpl').value.trim(),
      };

      resultBox.style.background = 'rgba(255,255,255,0.05)';
      resultBox.style.color = 'var(--text-sub)';
      resultBox.textContent = '⏳ 正在通过阿里云短信真实 POP 协议签名并下发验证码...';

      try {
        const res = await fetch('/v1/admin/config/test-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (json.data && json.data.success) {
          resultBox.style.background = 'rgba(16,185,129,0.15)';
          resultBox.style.color = '#34d399';
          resultBox.textContent = '✅ ' + json.data.message;
        } else {
          resultBox.style.background = 'rgba(239,68,68,0.15)';
          resultBox.style.color = '#f87171';
          resultBox.textContent = '❌ 发送失败: ' + (json.message || (json.data && json.data.message) || '未知错误');
        }
      } catch (e) {
        resultBox.style.background = 'rgba(239,68,68,0.15)';
        resultBox.style.color = '#f87171';
        resultBox.textContent = '❌ 短信网关调用失败: ' + e.message;
      }
    }

    let currentUserPage = 1;
    let currentUserPageSize = 10;
    let currentUserSearch = '';
    let totalUsersCount = 0;
    let totalUsersPages = 1;

    function formatDuration(sec) {
      const s = Number(sec) || 0;
      if (s <= 0) return '0 分钟';
      const mins = Math.floor(s / 60);
      const remainSec = s % 60;
      if (mins < 60) {
        return mins + ' 分钟' + (remainSec > 0 ? ' ' + remainSec + ' 秒' : '');
      }
      const hours = Math.floor(mins / 60);
      const remMins = mins % 60;
      return hours + ' 小时' + (remMins > 0 ? ' ' + remMins + ' 分钟' : '');
    }

    function doSearchUsers() {
      const val = document.getElementById('admin-users-search-input').value.trim();
      currentUserSearch = val;
      const tip = document.getElementById('users-search-status-tip');
      if (val) {
        tip.textContent = '当前定位条件：' + val;
      } else {
        tip.textContent = '';
      }
      loadUsers(1);
    }

    function resetSearchUsers() {
      document.getElementById('admin-users-search-input').value = '';
      document.getElementById('users-search-status-tip').textContent = '';
      currentUserSearch = '';
      loadUsers(1);
    }

    function changeUsersPageSize(size) {
      currentUserPageSize = parseInt(size, 10) || 10;
      loadUsers(1);
    }

    function goUsersPage(page) {
      if (page < 1 || page > totalUsersPages) return;
      loadUsers(page);
    }

    function updateUsersPaginationUI() {
      const infoEl = document.getElementById('users-pagination-info');
      if (infoEl) {
        infoEl.textContent = '共 ' + totalUsersCount + ' 位用户，第 ' + currentUserPage + ' / ' + totalUsersPages + ' 页';
      }
      const badgeEl = document.getElementById('users-current-page-badge');
      if (badgeEl) {
        badgeEl.textContent = currentUserPage;
      }
      const prevBtn = document.getElementById('admin-users-btn-prev');
      if (prevBtn) {
        prevBtn.disabled = currentUserPage <= 1;
        prevBtn.style.opacity = currentUserPage <= 1 ? '0.5' : '1';
        prevBtn.style.cursor = currentUserPage <= 1 ? 'not-allowed' : 'pointer';
      }
      const nextBtn = document.getElementById('admin-users-btn-next');
      if (nextBtn) {
        nextBtn.disabled = currentUserPage >= totalUsersPages;
        nextBtn.style.opacity = currentUserPage >= totalUsersPages ? '0.5' : '1';
        nextBtn.style.cursor = currentUserPage >= totalUsersPages ? 'not-allowed' : 'pointer';
      }
    }

    async function loadUsers(page = 1) {
      currentUserPage = page;
      const params = new URLSearchParams();
      if (currentUserSearch) params.set('search', currentUserSearch);
      params.set('page', String(currentUserPage));
      params.set('pageSize', String(currentUserPageSize));

      try {
        const res = await fetch('/v1/ops/users?' + params.toString());
        if (!res.ok) return;
        const json = await res.json();
        const tbody = document.getElementById('user-table-body');
        
        let items = [];
        if (json.code === 0 && json.data) {
          if (Array.isArray(json.data)) {
            items = json.data;
            totalUsersCount = items.length;
            totalUsersPages = 1;
          } else {
            items = json.data.list || [];
            totalUsersCount = json.data.total ?? items.length;
            currentUserPage = json.data.page ?? page;
            currentUserPageSize = json.data.pageSize ?? currentUserPageSize;
            totalUsersPages = json.data.totalPages ?? Math.max(1, Math.ceil(totalUsersCount / currentUserPageSize));
          }
        }

        updateUsersPaginationUI();

        if (items.length > 0) {
          tbody.innerHTML = items.map(u => \`
            <tr data-testid="admin-users-row-user-\${u.userId}">
              <td><code>\${u.userId}</code></td>
              <td><strong>\${u.maskedPhone}</strong></td>
              <td data-testid="admin-users-cell-remaining-time-\${u.userId}">
                \${u.remainingSeconds > 0 
                  ? '<span class="badge badge-green" style="font-size:12px; font-variant-numeric:tabular-nums;">' + formatDuration(u.remainingSeconds) + '</span> <span style="font-size:11px; color:var(--text-sub); font-variant-numeric:tabular-nums;">(' + Number(u.remainingSeconds).toLocaleString() + ' 秒)</span>' 
                  : '<span class="badge" style="background:rgba(156,163,175,0.15); color:var(--text-sub); font-size:12px;">0 分钟</span>'}
              </td>
              <td>
                \${u.reservedSeconds > 0 
                  ? '<span class="badge badge-yellow" style="font-size:12px; font-variant-numeric:tabular-nums;">' + formatDuration(u.reservedSeconds) + '</span>' 
                  : '<span style="color:var(--text-sub);">-</span>'}
              </td>
              <td style="color:var(--text-sub); font-variant-numeric:tabular-nums;">\${u.createdAt || '-'}</td>
            </tr>
          \`).join('');
        } else {
          const emptyText = currentUserSearch 
            ? '未搜索到匹配“' + currentUserSearch + '”的手机号用户，请更换关键词重试。' 
            : '暂无注册用户，客户端用户首次手机短信登录后将在此展示（已脱敏）。';
          tbody.innerHTML = '<tr class="empty-state-row"><td colspan="5">' + emptyText + '</td></tr>';
        }
      } catch (err) {
        console.warn('获取用户列表失败:', err);
      }
    }

    async function loadCompensations() {
      try {
        const res = await fetch('/v1/ops/compensations');
        if (!res.ok) return;
        const json = await res.json();
        const tbody = document.getElementById('comp-table-body');
        if (json.code === 0 && Array.isArray(json.data) && json.data.length > 0) {
          tbody.innerHTML = json.data.map(c => \`
            <tr>
              <td><code>\${c.requestId}</code></td>
              <td>\${c.targetUserId}</td>
              <td><strong>\${c.grantSeconds} 秒</strong></td>
              <td>\${c.submittedBy}</td>
              <td>\${c.reason}</td>
              <td><span class="badge badge-yellow">\${c.status}</span></td>
              <td>\${c.createdAt}</td>
            </tr>
          \`).join('');
        } else {
          tbody.innerHTML = '<tr class="empty-state-row"><td colspan="7">暂无时长补偿审批工单。</td></tr>';
        }
      } catch (err) {
        console.warn('获取补偿工单失败:', err);
      }
    }

    async function loadOrders() {
      try {
        const res = await fetch('/v1/ops/orders');
        if (!res.ok) return;
        const json = await res.json();
        const tbody = document.getElementById('orders-table-body');
        if (json.code === 0 && Array.isArray(json.data) && json.data.length > 0) {
          tbody.innerHTML = json.data.map(o => \`
            <tr>
              <td><code>\${o.orderNo}</code></td>
              <td>\${o.userId}</td>
              <td>\${o.planName}</td>
              <td>¥ \${(o.actualPriceCents / 100).toFixed(2)}</td>
              <td><span class="badge badge-green">\${o.status}</span></td>
              <td>\${o.createdAt}</td>
            </tr>
          \`).join('');
        } else {
          tbody.innerHTML = '<tr class="empty-state-row"><td colspan="6">暂无微信支付订单流水。用户在客户端发起充值后将实时入账。</td></tr>';
        }
      } catch (err) {
        console.warn('获取订单列表失败:', err);
      }
    }

    async function loadAuditLogs() {
      try {
        const res = await fetch('/v1/ops/audit/logs');
        if (!res.ok) return;
        const json = await res.json();
        const tbody = document.getElementById('audit-table-body');
        if (json.code === 0 && Array.isArray(json.data) && json.data.length > 0) {
          tbody.innerHTML = json.data.map(a => \`
            <tr>
              <td>\${a.timestamp}</td>
              <td>\${a.operatorId}</td>
              <td><span class="badge badge-blue">\${a.action}</span></td>
              <td>\${JSON.stringify(a.details)}</td>
            </tr>
          \`).join('');
        } else {
          tbody.innerHTML = '<tr class="empty-state-row"><td colspan="4">暂无安全审计日志。所有敏感权限操作将自动留痕。</td></tr>';
        }
      } catch (err) {
        console.warn('获取审计日志失败:', err);
      }
    }

    // 页面启动
    window.addEventListener('DOMContentLoaded', checkAuthAndInit);
  </script>
</body>
</html>`;
}
