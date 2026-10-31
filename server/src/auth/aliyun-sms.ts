import crypto from 'node:crypto';

export function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

export interface AliyunSmsParams {
  accessKeyId: string;
  accessKeySecret: string;
  phoneNumbers: string;
  signName: string;
  templateCode: string;
  templateParam?: Record<string, string>;
}

export interface AliyunSmsResult {
  success: boolean;
  bizId?: string;
  code: string;
  message: string;
}

/**
 * 调用阿里云短信 Dysmsapi 真实发送短信 (POP RPC 签名协议)
 */
export async function sendAliyunSms(params: AliyunSmsParams): Promise<AliyunSmsResult> {
  const ak = params.accessKeyId || '';
  const sk = params.accessKeySecret || '';

  // 1. 占位符检测
  if (!ak || !sk || ak.includes('Placeholder') || sk.includes('Placeholder') || ak.startsWith('LTAI5tPlaceholder')) {
    return {
      success: false,
      code: 'PLACEHOLDER_KEY',
      message: '当前配置的是系统默认示例占位符 (LTAI5tPlaceholder...)，并非真实凭据。请在 Admin 后台填入您在阿里云控制台创建的真实 AccessKey ID 和 Secret。',
    };
  }

  // 2. 组装请求参数
  const query: Record<string, string> = {
    Action: 'SendSms',
    Version: '2017-05-25',
    Format: 'JSON',
    AccessKeyId: ak,
    SignatureMethod: 'HMAC-SHA1',
    Timestamp: new Date().toISOString(),
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    PhoneNumbers: params.phoneNumbers,
    SignName: params.signName,
    TemplateCode: params.templateCode,
  };

  if (params.templateParam) {
    query.TemplateParam = JSON.stringify(params.templateParam);
  }

  // 3. 规范化参数排序与拼接 CanonicalizedQueryString
  const sortedKeys = Object.keys(query).sort();
  const canonicalizedQueryString = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(query[k])}`)
    .join('&');

  // 4. 计算待签名字符串
  const stringToSign = `GET&${percentEncode('/')}&${percentEncode(canonicalizedQueryString)}`;

  // 5. 使用 AccessKeySecret + "&" 计算 HMAC-SHA1 签名
  const signature = crypto
    .createHmac('sha1', `${sk}&`)
    .update(stringToSign)
    .digest('base64');

  const requestUrl = `https://dysmsapi.aliyuncs.com/?${canonicalizedQueryString}&Signature=${percentEncode(signature)}`;

  try {
    const res = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const data = (await res.json()) as { Code?: string; Message?: string; BizId?: string };

    if (data.Code === 'OK') {
      return {
        success: true,
        bizId: data.BizId,
        code: 'OK',
        message: `阿里云短信下发成功！流水号 (BizId): ${data.BizId}`,
      };
    } else {
      return {
        success: false,
        code: data.Code || 'SMS_FAILED',
        message: `阿里云短信网关拒绝发送 [${data.Code || 'UNKNOWN'}]: ${data.Message || '未知原因'}`,
      };
    }
  } catch (err) {
    return {
      success: false,
      code: 'NETWORK_ERROR',
      message: `请求阿里云短信网关网络异常: ${(err as Error).message}`,
    };
  }
}
