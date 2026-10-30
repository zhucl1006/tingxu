import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AuthService } from './auth/auth.service.js';
import { BillingEngine } from './billing/billing.engine.js';
import { WechatPayService } from './payment/wechat-pay.service.js';
import { OpsService } from './ops/ops.service.js';

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
      // 1. 健康检查
      if (req.method === 'GET' && (pathname === '/v1/health' || pathname === '/health')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            service: 'tingxu-control-plane',
            timestamp: new Date().toISOString(),
          })
        );
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

      // 5. 短信验证码登录 (POST /v1/auth/sms/login)
      if (req.method === 'POST' && pathname === '/v1/auth/sms/login') {
        const body = JSON.parse(await readRequestBody(req));
        const session = await authService.loginWithSms(body.phone, body.code);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: session }));
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
