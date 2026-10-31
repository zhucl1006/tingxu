import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendAliyunSms, percentEncode } from '../src/auth/aliyun-sms.js';

describe('阿里云短信服务真实发送与 POP 签名测试', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('percentEncode 应符合阿里云规范转义特殊字符', () => {
    expect(percentEncode('*')).toBe('%2A');
    expect(percentEncode('!')).toBe('%21');
    expect(percentEncode('abc 123')).toBe('abc%20123');
  });

  it('如果配置为系统占位符，应拦截并明确提示填入真实凭据', async () => {
    const res = await sendAliyunSms({
      accessKeyId: 'LTAI5tPlaceholderKey',
      accessKeySecret: 'SecretPlaceholder12345678',
      phoneNumbers: '13800138000',
      signName: '听序',
      templateCode: 'SMS_123456',
    });

    expect(res.success).toBe(false);
    expect(res.code).toBe('PLACEHOLDER_KEY');
    expect(res.message).toContain('系统默认示例占位符');
  });

  it('配置真实凭据时应正确构造签名并向阿里云发送请求', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Code: 'OK',
        Message: 'OK',
        BizId: '900112345678901234^0',
        RequestId: 'F655A8D5-B967-440B-8683-DB688D2D3E0E',
      }),
    } as any);

    const res = await sendAliyunSms({
      accessKeyId: 'LTAI5tRealKey123',
      accessKeySecret: 'RealSecretKey456',
      phoneNumbers: '13800138000',
      signName: '听序',
      templateCode: 'SMS_998877',
      templateParam: { code: '889900' },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callUrl = mockFetch.mock.calls[0][0] as string;
    expect(callUrl).toContain('dysmsapi.aliyuncs.com');
    expect(callUrl).toContain('Signature=');
    expect(callUrl).toContain('AccessKeyId=LTAI5tRealKey123');
    expect(res.success).toBe(true);
    expect(res.bizId).toBe('900112345678901234^0');
  });

  it('当阿里云返回签名非法或模板不存在时，应如实透传阿里云错误码', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Code: 'isv.SMS_SIGNATURE_ILLEGAL',
        Message: '短信签名不合法或未审核通过',
      }),
    } as any);

    const res = await sendAliyunSms({
      accessKeyId: 'LTAI5tRealKey123',
      accessKeySecret: 'RealSecretKey456',
      phoneNumbers: '13800138000',
      signName: '未审核签名',
      templateCode: 'SMS_998877',
    });

    expect(res.success).toBe(false);
    expect(res.code).toBe('isv.SMS_SIGNATURE_ILLEGAL');
    expect(res.message).toContain('短信签名不合法');
  });
});
