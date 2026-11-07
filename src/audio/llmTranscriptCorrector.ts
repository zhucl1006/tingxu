/**
 * 听序（Tingxu）— 会话级 LLM 实时语法与术语异步纠偏器（LlmTranscriptCorrector）
 *
 * 遵循 AGENTS.md 规范与 Local-First 本地优先原则：
 * 1. 采用非阻塞异步并发流水线，ASR 原始文本 0 延迟即刻上屏；
 * 2. 借助用户配置的 BYOK LLM（本地 Ollama 如 qwen2.5:3b 或 云端大模型），针对性纠正同音字、拼音错别字与缺失标点；
 * 3. 具备 3 秒超时熔断保护，遇网络异常或 LLM 未配置时静默降级，绝不打断会议。
 */

import type { ByokSettings } from '../types/meeting';

export type TranscriptCorrectionCallback = (
  segmentId: string,
  correctedText: string,
  rawText: string
) => void;

export class LlmTranscriptCorrector {
  constructor(private onCorrected: TranscriptCorrectionCallback) {}

  /**
   * 异步纠偏单条逐字稿片段
   */
  public async correctTranscript(
    segmentId: string,
    rawText: string,
    settings: ByokSettings
  ): Promise<void> {
    const trimmed = rawText.trim();
    if (!trimmed || trimmed.length < 3) return;
    if (settings.enableLlmCorrection === false) return;

    // 若使用的是云端 LLM 且未提供 API Key，则不发起请求
    const isCloudProvider = settings.llmProvider !== 'ollama' && settings.llmProvider !== 'custom';
    if (isCloudProvider && (!settings.llmApiKey || !settings.llmApiKey.trim())) {
      return;
    }

    const endpoint = (settings.llmEndpoint || settings.llmBaseUrl || '').trim();
    if (!endpoint) return;

    // 格式化 API URL
    const normalizedUrl = endpoint.endsWith('/chat/completions')
      ? endpoint
      : `${endpoint.replace(/\/+$/, '')}/chat/completions`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500); // 3.5 秒超时熔断

    try {
      const messages = [
        {
          role: 'system',
          content:
            '你是严谨的会议同音字与语音错别字纠偏助手。请将用户输入的语音识别文本修正同音错别字、倒装和标点符号，保持口语原貌与含义，切勿扩写、解释或回答问题，仅输出修正后的文本。',
        },
        {
          role: 'user',
          content: trimmed,
        },
      ];

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (settings.llmApiKey && settings.llmApiKey.trim()) {
        headers['Authorization'] = `Bearer ${settings.llmApiKey.trim()}`;
      }

      const res = await fetch(normalizedUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: settings.llmModel || 'deepseek-chat',
          messages,
          temperature: 0.1,
          max_tokens: 150,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        return;
      }

      const data = await res.json();
      const corrected = data?.choices?.[0]?.message?.content?.trim();

      // 清理两端多余引号或无意义前缀
      if (corrected) {
        const cleaned = corrected
          .replace(/^["'“”‘’]|["'“”‘’]$/g, '')
          .replace(/^修正[后为]?[：:]\s*/, '')
          .trim();

        if (cleaned && cleaned !== trimmed) {
          this.onCorrected(segmentId, cleaned, trimmed);
        }
      }
    } catch {
      clearTimeout(timeout);
      // 超时或失败静默降级，不阻断会议
    }
  }
}
