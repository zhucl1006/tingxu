import { OpenAiProtocolAdapter } from './openaiProtocolAdapter.js';

export interface QwenOptions {
  apiKey?: string;
  baseUrl?: string;
  mockMode?: boolean;
  mockError?: Error;
}

/**
 * 听序 AI Gateway — Qwen 专用协议适配器
 * 继承自深度通用的 OpenAiProtocolAdapter，消除重复的请求流解析样板。
 */
export class QwenAdapter extends OpenAiProtocolAdapter {
  constructor(options?: QwenOptions) {
    super({
      provider: 'qwen',
      modelVersion: 'qwen-2.5-72b',
      modelName: 'qwen-2.5-72b',
      apiKey: options?.apiKey || process.env.QWEN_API_KEY || '',
      baseUrl:
        options?.baseUrl ||
        process.env.QWEN_BASE_URL ||
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
      mockMode: options?.mockMode,
      mockError: options?.mockError,
    });
  }
}
