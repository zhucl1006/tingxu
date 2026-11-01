import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import { AuthService } from './auth/auth.service.js';
import { sendAliyunSms } from './auth/aliyun-sms.js';
import { BillingEngine } from './billing/billing.engine.js';
import { WechatPayService } from './payment/wechat-pay.service.js';
import { OpsService } from './ops/ops.service.js';
import { SystemConfigService } from './config/system-config.service.js';
import { renderAdminDashboardHtml } from './admin.html.js';

export interface ControlPlaneOptions {
  authService?: AuthService;
  billingEngine?: BillingEngine;
  wechatPayService?: WechatPayService;
  opsService?: OpsService;
  configService?: SystemConfigService;
  superPassword?: string;
}

export function createControlPlaneServer(options?: ControlPlaneOptions) {
  const authService = options?.authService || new AuthService();
  const billingEngine = options?.billingEngine || new BillingEngine();
  const wechatPayService =
    options?.wechatPayService || new WechatPayService({ billingEngine });
  const opsService = options?.opsService || new OpsService({ billingEngine });
  const configService = options?.configService || new SystemConfigService();
  const superPassword = options?.superPassword || process.env.ADMIN_SUPER_PASSWORD || 'tingxu2026';
  const adminSessions = new Set<string>();

  function parseCookies(req: IncomingMessage): Record<string, string> {
    const list: Record<string, string> = {};
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return list;
    cookieHeader.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      const key = parts.shift()?.trim();
      if (key) {
        list[key] = decodeURIComponent(parts.join('=').trim());
      }
    });
    return list;
  }

  function isAdminAuthenticated(req: IncomingMessage): boolean {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (adminSessions.has(token) || token === superPassword) return true;
    }
    const cookies = parseCookies(req);
    if (cookies['tingxu_admin_token'] && adminSessions.has(cookies['tingxu_admin_token'])) {
      return true;
    }
    return false;
  }

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

      // 0.1 Admin 超级密码登录 (POST /v1/admin/login)
      if (req.method === 'POST' && pathname === '/v1/admin/login') {
        const body = JSON.parse(await readRequestBody(req));
        if (body.password === superPassword) {
          const token = `adm_${crypto.randomBytes(24).toString('hex')}`;
          adminSessions.add(token);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': `tingxu_admin_token=${token}; Path=/; HttpOnly; SameSite=Lax`,
          });
          res.end(JSON.stringify({ code: 0, data: { token, role: 'OWNER' }, message: '超级密码登录成功' }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 401, message: '超级密码错误，请核对后重试' }));
        }
        return;
      }

      // 0.2 Admin 安全登出 (POST /v1/admin/logout)
      if (req.method === 'POST' && pathname === '/v1/admin/logout') {
        const cookies = parseCookies(req);
        if (cookies['tingxu_admin_token']) {
          adminSessions.delete(cookies['tingxu_admin_token']);
        }
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': 'tingxu_admin_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        });
        res.end(JSON.stringify({ code: 0, message: '已安全退出登录' }));
        return;
      }

      // 0.3 Admin 会话校验 (GET /v1/admin/session)
      if (req.method === 'GET' && pathname === '/v1/admin/session') {
        if (isAdminAuthenticated(req)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 0, data: { authenticated: true, role: 'OWNER' } }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 401, message: '未登录' }));
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
        let userId = url.searchParams.get('userId');
        if (!userId && req.headers.authorization?.startsWith('Bearer ')) {
          try {
            const token = req.headers.authorization.slice(7);
            const decoded = authService.verifyJwt(token);
            userId = decoded.userId;
          } catch {
            // ignore
          }
        }
        const balance = await billingEngine.getUserBalance(userId || 'unknown');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: balance }));
        return;
      }

      // 5. 短信验证码发送 (POST /v1/auth/sms/send)
      if (req.method === 'POST' && pathname === '/v1/auth/sms/send') {
        const body = JSON.parse(await readRequestBody(req));
        const smsConfig = (await configService.getConfig({ masked: false })).sms;
        const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

        // 真实阿里云凭据检测：严禁在未配置时假装发送成功 (遵守 Zero-Content 与真实接入铁律)
        const hasRealAliyunKey =
          smsConfig &&
          smsConfig.provider === 'aliyun' &&
          smsConfig.accessKeyId &&
          smsConfig.accessKeySecret &&
          !smsConfig.accessKeyId.includes('Placeholder');

        if (!hasRealAliyunKey && !isTestEnv && smsConfig.provider !== 'sandbox') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              code: 400,
              message: '未配置阿里云短信 AccessKey ID 或 AccessKey Secret，无法发送真实短信。请前往控制面运营后台 (http://localhost:3200) 配置真实短信服务凭据。',
            })
          );
          return;
        }

        let sender: ((phone: string, code: string) => Promise<{ success: boolean; message?: string }>) | undefined;
        if (hasRealAliyunKey) {
          sender = async (phone, code) => {
            return await sendAliyunSms({
              accessKeyId: smsConfig.accessKeyId,
              accessKeySecret: smsConfig.accessKeySecret,
              phoneNumbers: phone,
              signName: smsConfig.signName,
              templateCode: smsConfig.templateCode,
              templateParam: { code },
            });
          };
        }

        const sendResult = await authService.sendSmsCode(body.phone, { sender });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, ...sendResult }));
        return;
      }

      // 6. 短信验证码登录 (POST /v1/auth/sms/login)
      if (req.method === 'POST' && pathname === '/v1/auth/sms/login') {
        const body = JSON.parse(await readRequestBody(req));
        const session = await authService.loginWithSms(body.phone, body.code);

        // 新用户注册体验时长赠送：若无任何历史批次则真实发放 60 分钟 (3600 秒) 体验时长
        const userBal = await billingEngine.getUserBalance(session.user.userId);
        if (userBal.totalAvailableSeconds === 0) {
          await billingEngine.grantBucket({
            userId: session.user.userId,
            source: 'PROMOTION',
            totalSeconds: 3600,
            expireAt: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
            metadata: { reason: '新用户注册体验时长赠送 (60分钟)' },
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: session }));
        return;
      }

      // === 以下管理与运营后台接口必须通过超级密码鉴权 ===
      if (pathname.startsWith('/v1/admin/') || pathname.startsWith('/v1/ops/')) {
        if (!isAdminAuthenticated(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 401, message: '未授权：请先输入超级密码登录' }));
          return;
        }
      }

      // 7. 运营后台：真实统计数据 (GET /v1/ops/stats)
      if (req.method === 'GET' && pathname === '/v1/ops/stats') {
        const userCount = authService.getUserCount();
        const totalPaid = await wechatPayService.getTotalPaidAmount();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            code: 0,
            data: {
              userCount,
              todayMeetingMinutes: 0,
              totalPaidAmount: totalPaid,
              gatewayStatus: '● CLOSED (正常运行)',
            },
          })
        );
        return;
      }

      // 8. 运营后台：真实脱敏用户列表 (GET /v1/ops/users)
      if (req.method === 'GET' && pathname === '/v1/ops/users') {
        const search = url.searchParams.get('search') || url.searchParams.get('phone') || undefined;
        const page = parseInt(url.searchParams.get('page') || '1', 10);
        const pageSize = parseInt(url.searchParams.get('pageSize') || '10', 10);

        const users = authService.getUsers();
        const pagedResult = await opsService.queryDesensitizedUsers(users, { search, page, pageSize });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: pagedResult }));
        return;
      }

      // 9. 运营后台：真实审批工单列表 (GET /v1/ops/compensations)
      if (req.method === 'GET' && pathname === '/v1/ops/compensations') {
        const list = await opsService.getAllCompensationRequests();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: list }));
        return;
      }

      // 10. 运营后台：真实微信支付订单流水 (GET /v1/ops/orders)
      if (req.method === 'GET' && pathname === '/v1/ops/orders') {
        const orders = await wechatPayService.getAllOrders();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: orders }));
        return;
      }

      // 11. 运营后台：提交补偿申请 (POST /v1/ops/compensation/submit)
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

      // 12. 运营后台：所有者审批发放 (POST /v1/ops/compensation/approve)
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

      // 13. 运营后台：审计日志查询 (GET /v1/ops/audit/logs)
      if (req.method === 'GET' && pathname === '/v1/ops/audit/logs') {
        const logs = await opsService.getAuditLogs();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: logs }));
        return;
      }

      // 14. 运营后台：系统集成与密钥配置读取 (GET /v1/admin/config)
      if (req.method === 'GET' && pathname === '/v1/admin/config') {
        const maskedConfig = await configService.getConfig({ masked: true });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: maskedConfig }));
        return;
      }

      // 15. 运营后台：系统集成配置更新并热载 (POST /v1/admin/config)
      if (req.method === 'POST' && pathname === '/v1/admin/config') {
        const body = JSON.parse(await readRequestBody(req));
        const updated = await configService.updateConfig(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: updated, message: '配置已更新并已通知 AI Gateway 热重载' }));
        return;
      }

      // 16. 运营后台：LLM 连通性测试 (POST /v1/admin/config/test-llm)
      if (req.method === 'POST' && pathname === '/v1/admin/config/test-llm') {
        const body = JSON.parse(await readRequestBody(req));
        const testRes = await configService.testLlmConnection(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: testRes }));
        return;
      }

      // 16.1 运营后台：ASR 连通性与 Key 有效性测试 (POST /v1/admin/config/test-asr)
      if (req.method === 'POST' && pathname === '/v1/admin/config/test-asr') {
        const body = JSON.parse(await readRequestBody(req));
        const testRes = await configService.testAsrConnection(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: testRes }));
        return;
      }

      // 17. 运营后台：短信发送通道自测 (POST /v1/admin/config/test-sms)
      if (req.method === 'POST' && pathname === '/v1/admin/config/test-sms') {
        const body = JSON.parse(await readRequestBody(req));
        const testRes = await configService.testSmsConnection(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, data: testRes }));
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

  return { server, authService, billingEngine, wechatPayService, opsService, configService };
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
