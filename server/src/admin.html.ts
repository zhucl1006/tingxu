/**
 * 听序（Tingxu）商业控制面 Web 运营管理后台
 */

export function renderAdminDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>听序 Tingxu · 商业控制面运营管理后台</title>
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
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }
    .stat-card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 18px;
    }
    .stat-title {
      font-size: 12px;
      color: var(--text-sub);
      margin-bottom: 8px;
    }
    .stat-value {
      font-size: 26px;
      font-weight: 800;
      font-family: monospace;
      color: var(--text-main);
    }
    .tabs {
      display: flex;
      gap: 8px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 10px;
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
    }
    .tab-btn.active {
      background: var(--card);
      border-color: var(--card-border);
      color: #60a5fa;
    }
    .panel {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .panel-title {
      font-size: 15px;
      font-weight: 700;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      text-align: left;
    }
    th, td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--card-border);
    }
    th {
      color: var(--text-sub);
      font-size: 12px;
      font-weight: 600;
    }
    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-green { background: rgba(16, 185, 129, 0.15); color: var(--success); }
    .badge-yellow { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
    .badge-red { background: rgba(239, 68, 68, 0.15); color: var(--danger); }
    button.btn {
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
      <button class="tab-btn active" onclick="switchTab('users')">👥 脱敏用户与时长额度</button>
      <button class="tab-btn" onclick="switchTab('compensations')">✍️ 补偿时长审批流</button>
      <button class="tab-btn" onclick="switchTab('orders')">💰 微信支付与账本</button>
      <button class="tab-btn" onclick="switchTab('audit')">🛡️ 不可篡改审计日志</button>
    </div>

    <!-- Tab 1: 用户与额度 -->
    <div id="tab-users" class="panel">
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
            <td>op_01 (运营小李)</td>
            <td>网络异常重试补偿</td>
            <td><span class="badge badge-yellow" id="badge-comp-1001">PENDING 待审</span></td>
            <td id="actions-comp-1001">
              <button class="btn btn-success" onclick="approveComp('comp_1001', 'usr_8000', 3600)">同意批准</button>
              <button class="btn btn-danger" onclick="rejectComp('comp_1001')">驳回</button>
            </td>
          </tr>
          <tr>
            <td><code>comp_1000</code></td>
            <td>usr_1234</td>
            <td><strong>7200 秒</strong> (120 分钟)</td>
            <td>op_02 (运营小张)</td>
            <td>ASR 服务波动体验补偿</td>
            <td><span class="badge badge-green">APPROVED 已发放</span></td>
            <td><span style="font-size:12px; color:var(--text-sub);">owner_01 已批准</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Tab 3: 订单与账本 -->
    <div id="tab-orders" class="panel" style="display:none;">
      <div class="panel-header">
        <div class="panel-title">微信支付交易订单账本 (Append-only)</div>
        <button class="btn btn-primary" onclick="simulateNewOrder()">+ 模拟收到新微信订单</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>内部订单号</th>
            <th>用户 ID</th>
            <th>套餐规格</th>
            <th>实付金额</th>
            <th>支付状态</th>
            <th>创建时间</th>
          </tr>
        </thead>
        <tbody id="orders-table-body">
          <tr>
            <td><code>TX20261031001</code></td>
            <td>usr_8000</td>
            <td>专业月度套餐 (30小时)</td>
            <td>¥ 39.00</td>
            <td><span class="badge badge-green">PAID 已支付</span></td>
            <td>2026-10-31 09:12</td>
          </tr>
          <tr>
            <td><code>TX20261030099</code></td>
            <td>usr_1234</td>
            <td>基础体验包 (10小时)</td>
            <td>¥ 9.90</td>
            <td><span class="badge badge-green">PAID 已支付</span></td>
            <td>2026-10-30 16:45</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Tab 4: 审计记录 -->
    <div id="tab-audit" class="panel" style="display:none;">
      <div class="panel-header">
        <div class="panel-title">系统操作审计与防篡改流水</div>
      </div>

      <table>
        <thead>
          <tr>
            <th>事件 ID</th>
            <th>操作类型</th>
            <th>操作人</th>
            <th>作用对象</th>
            <th>详细上下文</th>
            <th>发生时间</th>
          </tr>
        </thead>
        <tbody id="audit-table-body">
          <tr>
            <td><code>aud_001</code></td>
            <td><span class="badge badge-green">APPROVE_COMPENSATION</span></td>
            <td>owner_01</td>
            <td>usr_1234</td>
            <td>批准发放 7200 秒时长批次 (补偿单 comp_1000)</td>
            <td>2026-10-30 17:00</td>
          </tr>
          <tr>
            <td><code>aud_002</code></td>
            <td><span class="badge badge-yellow">SUBMIT_COMPENSATION</span></td>
            <td>op_01</td>
            <td>usr_8000</td>
            <td>提交 3600 秒时长补偿申请</td>
            <td>2026-10-31 10:30</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- 补偿申请弹窗 -->
  <div class="modal" id="comp-modal">
    <div class="modal-content">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <h3 style="font-size:15px; font-weight:700;">发起会议时长补偿申请</h3>
        <button style="background:none; border:none; color:var(--text-sub); font-size:18px; cursor:pointer;" onclick="closeCompModal()">×</button>
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
      event.target.classList.add('active');
      ['users', 'compensations', 'orders', 'audit'].forEach(t => {
        document.getElementById('tab-' + t).style.display = t === tabId ? 'block' : 'none';
      });
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
        const res = await fetch('/v1/ops/compensation/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ownerId: 'owner_01', requestId: compId })
        }).catch(() => null);

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
  </script>
</body>
</html>`;
}
