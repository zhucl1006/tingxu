import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface UserSession {
  userId: string;
  phone: string;
  role: 'USER' | 'OPERATOR' | 'OWNER';
}

export interface AuthServiceOptions {
  jwtSecret?: string;
  storageFilePath?: string;
}

export class AuthService {
  private readonly jwtSecret: string;
  private readonly storageFilePath?: string;
  private readonly smsStore = new Map<
    string,
    {
      code: string;
      expiresAt: number;
      lastSentAt: number;
    }
  >();
  private readonly usersMap = new Map<string, { userId: string; phone: string; createdAt: string }>();

  constructor(options?: AuthServiceOptions) {
    this.jwtSecret = options?.jwtSecret || process.env.JWT_SECRET || 'tingxu_default_jwt_secret';
    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    if (options?.storageFilePath) {
      this.storageFilePath = options.storageFilePath;
    } else if (process.env.USERS_STORAGE_PATH) {
      this.storageFilePath = process.env.USERS_STORAGE_PATH;
    } else if (!isTest) {
      this.storageFilePath = path.resolve(process.cwd(), 'data/users.json');
    }

    // 尝试从持久化文件中加载历史用户
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (!this.storageFilePath) return;
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const content = fs.readFileSync(this.storageFilePath, 'utf-8');
        const list = JSON.parse(content);
        if (Array.isArray(list)) {
          for (const u of list) {
            if (u && u.userId && u.phone) {
              this.usersMap.set(u.userId, u);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[AuthService] 加载用户持久化文件失败:', (e as Error).message);
    }
  }

  private persistUsers(): void {
    if (!this.storageFilePath) return;
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.usersMap.values());
      fs.writeFileSync(this.storageFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[AuthService] 持久化用户文件失败:', (e as Error).message);
    }
  }

  public addUser(user: { userId: string; phone: string; createdAt?: string }): void {
    const record = {
      userId: user.userId,
      phone: user.phone,
      createdAt: user.createdAt || new Date().toISOString().split('T')[0],
    };
    this.usersMap.set(record.userId, record);
    this.persistUsers();
  }

  public getUsers(): Array<{ userId: string; phone: string; createdAt: string }> {
    return Array.from(this.usersMap.values());
  }

  public getUserCount(): number {
    return this.usersMap.size;
  }

  public async sendSmsCode(
    phone: string,
    options?: {
      sender?: (phone: string, code: string) => Promise<{ success: boolean; message?: string }>;
    }
  ): Promise<{ success: boolean; debugCode?: string; message?: string }> {
    if (!/^1\d{10}$/.test(phone)) {
      throw new Error('手机号码格式不正确');
    }

    const now = Date.now();
    const existing = this.smsStore.get(phone);
    if (existing && now - existing.lastSentAt < 60 * 1000) {
      const waitSec = Math.ceil((60 * 1000 - (now - existing.lastSentAt)) / 1000);
      throw new Error(`发送过于频繁，请 ${waitSec} 秒后再试`);
    }

    // 生成 6 位随机验证码
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // 如果传入了真实短信通道发送器，真实调用云端短信下发
    if (options?.sender) {
      const sendResult = await options.sender(phone, code);
      if (!sendResult.success) {
        throw new Error(sendResult.message || '短信验证码下发失败，请检查短信服务配置');
      }
    }

    this.smsStore.set(phone, {
      code,
      expiresAt: now + 5 * 60 * 1000, // 5 分钟有效
      lastSentAt: now,
    });

    return {
      success: true,
      message: '短信验证码已成功发送，请查收',
      ...(options?.sender ? {} : { debugCode: code }),
    };
  }

  public async loginWithSms(
    phone: string,
    code: string
  ): Promise<{ token: string; user: UserSession }> {
    const record = this.smsStore.get(phone);
    const now = Date.now();

    if (!record || record.code !== code || now > record.expiresAt) {
      throw new Error('验证码无效或已过期，请重新获取');
    }

    // 一次性核销，立即失效
    this.smsStore.delete(phone);

    const userId = `usr_${crypto.createHash('md5').update(phone).digest('hex').slice(0, 12)}`;
    const user: UserSession = {
      userId,
      phone,
      role: 'USER',
    };

    if (!this.usersMap.has(userId)) {
      this.usersMap.set(userId, {
        userId,
        phone,
        createdAt: new Date().toISOString().split('T')[0],
      });
      this.persistUsers();
    }

    const token = this.signJwt({ userId, phone, role: 'USER' });

    return { token, user };
  }

  public signJwt(payload: Record<string, any>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 7 * 86400, // 7天有效
      })
    ).toString('base64url');

    const signature = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(`${header}.${body}`)
      .digest('base64url');

    return `${header}.${body}.${signature}`;
  }

  public verifyJwt(token: string): Record<string, any> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }
    const [header, body, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(`${header}.${body}`)
      .digest('base64url');

    if (signature !== expectedSig) {
      throw new Error('Invalid JWT signature');
    }

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      throw new Error('JWT token expired');
    }
    return payload;
  }
}
