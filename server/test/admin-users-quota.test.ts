import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { BillingEngine } from '../src/billing/billing.engine.js';
import { OpsService } from '../src/ops/ops.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import { createControlPlaneServer } from '../src/server.js';
import { renderAdminDashboardHtml } from '../src/admin.html.js';

describe('Admin 管理台用户时长与额度列表功能 (TDD: 时长展示、分页、手机号搜索)', () => {
  let billingEngine: BillingEngine;
  let opsService: OpsService;
  let authService: AuthService;

  const mockUsers = [
    { userId: 'usr_001', phone: '13812345678', createdAt: '2026-10-01' },
    { userId: 'usr_002', phone: '13987654321', createdAt: '2026-10-02' },
    { userId: 'usr_003', phone: '15011112222', createdAt: '2026-10-03' },
    { userId: 'usr_004', phone: '13888889999', createdAt: '2026-10-04' },
    { userId: 'usr_005', phone: '18600001111', createdAt: '2026-10-05' },
  ];

  beforeEach(async () => {
    billingEngine = new BillingEngine();
    opsService = new OpsService({ billingEngine });
    authService = new AuthService();

    // 给部分用户充值/发放时长批次
    const expireAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
    // usr_001: 7200 秒 (120 分钟)
    await billingEngine.grantBucket({
      userId: 'usr_001',
      source: 'PURCHASE',
      totalSeconds: 7200,
      expireAt,
    });
    // usr_002: 3600 秒 (60 分钟)
    await billingEngine.grantBucket({
      userId: 'usr_002',
      source: 'COMPENSATION',
      totalSeconds: 3600,
      expireAt,
    });
    // usr_003 保持 0 秒余额
  });

  describe('1. 增加字段：展示该用户剩余时长', () => {
    it('getDesensitizedUsers 必须返回每个用户的 remainingSeconds，正确反映时长余额', async () => {
      const result = await opsService.getDesensitizedUsers(mockUsers.slice(0, 3));
      
      expect(result).toHaveLength(3);
      
      const u1 = result.find((u) => u.userId === 'usr_001');
      expect(u1).toBeDefined();
      expect(u1?.maskedPhone).toBe('138****5678');
      expect(u1?.remainingSeconds).toBe(7200);

      const u2 = result.find((u) => u.userId === 'usr_002');
      expect(u2).toBeDefined();
      expect(u2?.maskedPhone).toBe('139****4321');
      expect(u2?.remainingSeconds).toBe(3600);

      const u3 = result.find((u) => u.userId === 'usr_003');
      expect(u3).toBeDefined();
      expect(u3?.remainingSeconds).toBe(0);
    });
  });

  describe('2. 增加分页：支持分页模式查询', () => {
    it('queryDesensitizedUsers 应支持 page 和 pageSize，并返回准确的 total 和 totalPages', async () => {
      // 5 个用户，每页 2 条，第一页
      const page1 = await opsService.queryDesensitizedUsers(mockUsers, {
        page: 1,
        pageSize: 2,
      });

      expect(page1.total).toBe(5);
      expect(page1.page).toBe(1);
      expect(page1.pageSize).toBe(2);
      expect(page1.totalPages).toBe(3);
      expect(page1.list).toHaveLength(2);
      expect(page1.list[0].userId).toBe('usr_001');
      expect(page1.list[1].userId).toBe('usr_002');

      // 第二页
      const page2 = await opsService.queryDesensitizedUsers(mockUsers, {
        page: 2,
        pageSize: 2,
      });
      expect(page2.page).toBe(2);
      expect(page2.list).toHaveLength(2);
      expect(page2.list[0].userId).toBe('usr_003');
      expect(page2.list[1].userId).toBe('usr_004');

      // 第三页
      const page3 = await opsService.queryDesensitizedUsers(mockUsers, {
        page: 3,
        pageSize: 2,
      });
      expect(page3.page).toBe(3);
      expect(page3.list).toHaveLength(1);
      expect(page3.list[0].userId).toBe('usr_005');
    });

    it('默认参数应安全容错并返回第 1 页与标准 pageSize', async () => {
      const defaultRes = await opsService.queryDesensitizedUsers(mockUsers);
      expect(defaultRes.page).toBe(1);
      expect(defaultRes.pageSize).toBe(10);
      expect(defaultRes.total).toBe(5);
      expect(defaultRes.list).toHaveLength(5);
    });
  });

  describe('3. 增加搜索：支持快速根据手机号码定位查找用户', () => {
    it('可根据完整手机号码精确查找到特定用户，且手机号脱敏输出', async () => {
      const searchRes = await opsService.queryDesensitizedUsers(mockUsers, {
        search: '13987654321',
      });

      expect(searchRes.total).toBe(1);
      expect(searchRes.list).toHaveLength(1);
      expect(searchRes.list[0].userId).toBe('usr_002');
      expect(searchRes.list[0].maskedPhone).toBe('139****4321');
      expect(searchRes.list[0].remainingSeconds).toBe(3600);
    });

    it('可根据手机号片段（如前缀或后缀）快速模糊匹配', async () => {
      // 搜索包含 '138' 的手机号 (usr_001: 13812345678, usr_004: 13888889999)
      const searchRes = await opsService.queryDesensitizedUsers(mockUsers, {
        search: '138',
      });

      expect(searchRes.total).toBe(2);
      expect(searchRes.list.map((u) => u.userId)).toEqual(['usr_001', 'usr_004']);
    });

    it('搜索无匹配时应返回空列表且 total 为 0', async () => {
      const searchRes = await opsService.queryDesensitizedUsers(mockUsers, {
        search: '19999999999',
      });

      expect(searchRes.total).toBe(0);
      expect(searchRes.list).toHaveLength(0);
      expect(searchRes.totalPages).toBe(1);
    });
  });

  describe('4. HTTP 接口与权限合规验证 (GET /v1/ops/users)', () => {
    it('GET /v1/ops/users 接口应支持 search、page、pageSize 查询参数并包含剩余时长', async () => {
      // 模拟注册用户到 authService
      for (const u of mockUsers) {
        (authService as any).usersMap.set(u.userId, u);
      }

      const { server } = createControlPlaneServer({
        authService,
        billingEngine,
        opsService,
      });

      await new Promise<void>((resolve) => server.listen(0, resolve));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;

      try {
        // 请求带搜索和分页 (需提供管理员超级密码鉴权)
        const res = await fetch(`http://127.0.0.1:${port}/v1/ops/users?search=138&page=1&pageSize=1`, {
          headers: { Authorization: 'Bearer tingxu2026' },
        });
        expect(res.status).toBe(200);
        const json = await res.json();

        expect(json.code).toBe(0);
        expect(json.data.total).toBe(2);
        expect(json.data.page).toBe(1);
        expect(json.data.pageSize).toBe(1);
        expect(json.data.totalPages).toBe(2);
        expect(json.data.list).toHaveLength(1);
        expect(json.data.list[0].remainingSeconds).toBe(7200);
        expect(json.data.list[0].maskedPhone).toBe('138****5678');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  describe('5. Admin 管理台前端 HTML 元素与合规测试 (data-testid 规范)', () => {
    it('Admin HTML 模板应包含剩余时长表头、搜索输入框与按钮、以及分页组件元素', () => {
      const html = renderAdminDashboardHtml();

      // 验证剩余时长表头
      expect(html).toContain('剩余可用时长');

      // 验证搜索元素与 data-testid
      expect(html).toContain('data-testid="admin-users-input-search-phone"');
      expect(html).toContain('data-testid="admin-users-btn-search"');
      expect(html).toContain('data-testid="admin-users-btn-reset"');

      // 验证分页元素与 data-testid
      expect(html).toContain('data-testid="admin-users-pagination-bar"');
      expect(html).toContain('data-testid="admin-users-select-page-size"');
      expect(html).toContain('data-testid="admin-users-btn-prev-page"');
      expect(html).toContain('data-testid="admin-users-btn-next-page"');
      expect(html).toContain('data-testid="admin-users-pagination-info"');
    });
  });

  describe('6. 服务端用户与额度持久化存储防丢失 (Persistence)', () => {
    it('服务重启后应自动从持久化文件恢复用户与时长批次，防止重启丢失', async () => {
      const tempUserFile = path.resolve(os.tmpdir(), `tingxu_test_users_${Date.now()}.json`);
      const tempBillingFile = path.resolve(os.tmpdir(), `tingxu_test_billing_${Date.now()}.json`);

      try {
        // 第一次启动实例：注册用户并充值
        const auth1 = new AuthService({ storageFilePath: tempUserFile });
        const billing1 = new BillingEngine({ storageFilePath: tempBillingFile });

        await auth1.sendSmsCode('13800008888');
        const debugCode = (auth1 as any).smsStore.get('13800008888')?.code;
        const loginRes = await auth1.loginWithSms('13800008888', debugCode);

        await billing1.grantBucket({
          userId: loginRes.user.userId,
          source: 'PURCHASE',
          totalSeconds: 3600,
          expireAt: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
        });

        // 模拟服务重启：重新新建实例并加载同一个持久化文件
        const auth2 = new AuthService({ storageFilePath: tempUserFile });
        const billing2 = new BillingEngine({ storageFilePath: tempBillingFile });

        expect(auth2.getUserCount()).toBe(1);
        const users = auth2.getUsers();
        expect(users[0].phone).toBe('13800008888');

        const balance = await billing2.getUserBalance(users[0].userId);
        expect(balance.totalAvailableSeconds).toBe(3600);
      } finally {
        if (fs.existsSync(tempUserFile)) fs.unlinkSync(tempUserFile);
        if (fs.existsSync(tempBillingFile)) fs.unlinkSync(tempBillingFile);
      }
    });
  });
});
