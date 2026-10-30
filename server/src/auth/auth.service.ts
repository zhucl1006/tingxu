import crypto from 'node:crypto';

export interface UserSession {
  userId: string;
  phone: string;
  role: 'USER' | 'OPERATOR' | 'OWNER';
}

export interface AuthServiceOptions {
  jwtSecret?: string;
}

export class AuthService {
  private readonly jwtSecret: string;
  private readonly smsStore = new Map<
    string,
    {
      code: string;
      expiresAt: number;
      lastSentAt: number;
    }
  >();

  constructor(options?: AuthServiceOptions) {
    this.jwtSecret = options?.jwtSecret || process.env.JWT_SECRET || 'tingxu_default_jwt_secret';
  }

  public async sendSmsCode(phone: string): Promise<{ success: boolean; debugCode?: string }> {
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
    this.smsStore.set(phone, {
      code,
      expiresAt: now + 5 * 60 * 1000, // 5 分钟有效
      lastSentAt: now,
    });

    return {
      success: true,
      debugCode: code,
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
