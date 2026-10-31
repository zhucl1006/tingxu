import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AuthService } from './auth/auth.service.js';
import { BillingEngine } from './billing/billing.engine.js';
import { WechatPayService } from './payment/wechat-pay.service.js';
import { OpsService } from './ops/ops.service.js';
import { renderAdminDashboardHtml } from './admin.html.js';

export interface ControlPlaneOptions {
  authService?: AuthService;
  billingEngine?: BillingEngine;
  wechatPayService?: WechatPayService;
  opsService?: OpsService;
}

export function createControlPlaneServer(options?: ControlPlaneOptions) {
  const authService = options?.authService || new AuthService();
  const billingEngine = options?.billingEngine || new BillingEngine();
  const wechatPayService =
    options?.wechatPayService || new WechatPayService({ billingEngine });
  const opsService = options?.opsService || new OpsService({ billingEngine });

  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // 跨域设置
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Platform, X-Client-Version');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    try {
      // 0. Web 运营管理后台页面 (GET/HEAD / 或 /admin 或 /dashboard)
      if ((req.method === 'GET' || req.method === 'HEAD') && (pathname === '/' || pathname === '/admin' || pathname === '/dashboard')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        if (req.method === 'HEAD') {
          res.end();
        } else {
          res.end(renderAdminDashboardHtml());
        }
        return;
      }

      // 1. 健康检查
      if ((req.method === 'GET' || req.method === 'HEAD') && (pathname === '/v1/health' || pathname === '/health')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (req.method === 'HEAD') {
          res.end();
        } else {
          res.end(
            JSON.stringify({
              status: 'ok',
              service: 'tingxu-control-plane',
              timestamp: new Date().toISOString(),
            })
          );
        }
        return;
      }

      // 2. 购买订单 (POST /v1/orders)
      if (req.method === 'POST' && pathname === '/v1/orders') {
        const body = JSON.parse(await readRequestBody(req));
        const order = await wechatPayService.createOrder({
          userId: body.userId || 'usr_anonymous',
          planId: body.planId,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: order }));
        return;
      }

      // 3. 微信支付异步通知 (POST /v1/pay/wechat/notify)
      if (req.method === 'POST' && pathname === '/v1/pay/wechat/notify') {
        const body = JSON.parse(await readRequestBody(req));
        const result = await wechatPayService.handlePaymentNotify(body);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 'SUCCESS', message: 'OK', ...result }));
        return;
      }

      // 4. 查询时长余额 (GET /v1/billing/balance)
      if (req.method === 'GET' && pathname === '/v1/billing/balance') {
        const userId = url.searchParams.get('userId') || 'unknown';
        const balance = await billingEngine.getUserBalance(userId);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: balance }));
        return;
      }

      // 5. 短信验证码发送 (POST /v1/auth/sms/send)
      if (req.method === 'POST' && pathname === '/v1/auth/sms/send') {
        const body = JSON.parse(await readRequestBody(req));
        const sendResult = await authService.sendSmsCode(body.phone);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, ...sendResult }));
        return;
      }

      // 6. 短信验证码登录 (POST /v1/auth/sms/login)
      if (req.method === 'POST' && pathname === '/v1/auth/sms/login') {
        const body = JSON.parse(await readRequestBody(req));
        const session = await authService.loginWithSms(body.phone, body.code);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: session }));
        return;
      }

      // 7. 运营后台：脱敏用户列表 (GET /v1/ops/users)
      if (req.method === 'GET' && pathname === '/v1/ops/users') {
        const desensitized = await opsService.getDesensitizedUsers([
          { userId: 'usr_8000', phone: '13800138000', createdAt: '2026-10-30' },
          { userId: 'usr_1234', phone: '13912345678', createdAt: '2026-10-29' },
          { userId: 'usr_5678', phone: '18688889999', createdAt: '2026-10-28' },
        ]);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: desensitized }));
        return;
      }

      // 8. 运营后台：提交补偿申请 (POST /v1/ops/compensation/submit)
      if (req.method === 'POST' && pathname === '/v1/ops/compensation/submit') {
        const body = JSON.parse(await readRequestBody(req));
        const compReq = await opsService.submitCompensationRequest(
          { userId: body.operatorId || 'op_anonymous', role: 'OPERATOR' },
          {
            targetUserId: body.targetUserId,
            grantSeconds: Number(body.grantSeconds),
            reason: body.reason,
          }
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: compReq }));
        return;
      }

      // 9. 运营后台：所有者审批发放 (POST /v1/ops/compensation/approve)
      if (req.method === 'POST' && pathname === '/v1/ops/compensation/approve') {
        const body = JSON.parse(await readRequestBody(req));
        const approved = await opsService.approveCompensation(
          { userId: body.ownerId || 'owner_01', role: 'OWNER' },
          body.requestId
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: approved }));
        return;
      }

      // 10. 运营后台：审计日志查询 (GET /v1/ops/audit/logs)
      if (req.method === 'GET' && pathname === '/v1/ops/audit/logs') {
        const logs = await opsService.getAuditLogs();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: logs }));
        return;
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 404, message: `Route not found: ${pathname}` }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 400, message: (err as Error).message }));
    }
  });

  return { server, authService, billingEngine, wechatPayService, opsService };
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) reject(new Error('Payload too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
