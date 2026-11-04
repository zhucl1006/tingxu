import { OpenAiProtocolAdapter } from './openaiProtocolAdapter.js';

export interface DeepSeekOptions {
  apiKey?: string;
  baseUrl?: string;
  mockMode?: boolean;
  mockError?: Error;
}

/**
 * 听序 AI Gateway — DeepSeek 专用协议适配器
 * 继承自深度通用的 OpenAiProtocolAdapter，消除重复的请求流解析样板。
 */
export class DeepSeekAdapter extends OpenAiProtocolAdapter {
  constructor(options?: DeepSeekOptions) {
    super({
      provider: 'deepseek',
      modelVersion: 'deepseek-v3',
      modelName: 'deepseek-chat',
      apiKey: options?.apiKey || process.env.DEEPSEEK_API_KEY || '',
      baseUrl: options?.baseUrl || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
      mockMode: options?.mockMode,
      mockError: options?.mockError,
    });
  }
}
