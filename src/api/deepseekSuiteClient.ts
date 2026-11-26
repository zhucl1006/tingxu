/**
 * 听序（Tingxu）— DeepSeek 全家桶深度协议适配与本地精准计费模块 (DeepSeekSuiteClient)
 *
 * 核心架构定位：
 * 1. One-Key 凭据统一解析：支持用户填入 1 个 DeepSeek API Key 同步授权 LLM、ASR、OCR、TTS、Search；
 * 2. 独立工具协议适配：封装 /v1/tools/asr、/v1/tools/ocr、/v1/tools/tts、/v1/tools/search、/v1/tools/fetch；
 * 3. 本地精准人民币账单引擎：自动识别北京时间（UTC+8）工作日峰谷半价时段、Prompt Cache 命中率及各工具按量单价。
 */

import type { ByokSettings, DeepSeekTtsVoiceId } from '../types/meeting';

export interface DeepSeekTokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

export type DeepSeekToolBillingEvent =
  | { type: 'asr'; durationMs: number }
  | { type: 'ocr'; pageCount: number }
  | { type: 'tts'; charCount: number }
  | { type: 'search'; callCount: number };

export interface DeepSeekAsrResult {
  requestId: string;
  text: string;
  durationMs: number;
}

export interface DeepSeekOcrPage {
  index: number;
  text: string;
  finishReason: string;
}

export interface DeepSeekOcrResult {
  id: string;
  purpose: 'text_recognition' | 'rich_layout_recognition';
  pageCount: number;
  pages: DeepSeekOcrPage[];
  fullText: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export interface DeepSeekSearchItem {
  rerank_score: number;
  title: string;
  url: string;
  snippet: string;
  summary: string;
  content: string;
  site_name: string | null;
  date: string | null;
  authority: number;
}

export interface DeepSeekFetchResult {
  title: string;
  content: string;
}

/**
 * 解析当前生效的 DeepSeek 全家桶 API Key：
 * - 开启 shareDeepSeekKey（默认 true）时，明确优先复用上方 DeepSeek LLM Key，忽略隐藏的残留 asrApiKey；
 * - 显式关闭 shareDeepSeekKey (false) 且 ASR 选用 deepseek 时，使用独立的 asrApiKey。
 */
export function resolveEffectiveDeepSeekKey(settings: ByokSettings): string {
  const allowShare = settings.shareDeepSeekKey !== false;
  if (allowShare) {
    if (settings.llmProvider === 'deepseek' || settings.asrProvider === 'deepseek') {
      return (settings.llmApiKey || '').trim();
    }
    return '';
  }
  if (settings.asrProvider === 'deepseek') {
    return (settings.asrApiKey || '').trim();
  }
  return '';
}

export const resolveEffectiveAsrApiKey = resolveEffectiveDeepSeekKey;

/**
 * 将用户填写的 Base URL（如 https://api.deepseek.com/v1）规范化为根 Origin（https://api.deepseek.com）
 */
export function normalizeDeepSeekOrigin(rawBaseUrl?: string): string {
  const trimmed = (rawBaseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    return 'https://api.deepseek.com';
  }
  return trimmed
    .replace(/\/v1\/chat\/completions$/i, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/anthropic\/v1$/i, '')
    .replace(/\/anthropic$/i, '')
    .replace(/\/v1\/tools\/[a-z_]+$/i, '')
    .replace(/\/v1$/i, '');
}

/**
 * 判断指定时间是否处于 DeepSeek 北京时间（UTC+8）高峰计费时段：
 * 周一至周五 09:00 - 12:00、14:00 - 18:00 为高峰时段，其余时间及周末全天为空闲半价时段。
 */
export function isDeepSeekPeakHourBeijing(now: Date = new Date()): boolean {
  // 转换为 UTC+8 时间戳
  const beijingMs = now.getTime() + 8 * 60 * 60 * 1000;
  const bjDate = new Date(beijingMs);
  const day = bjDate.getUTCDay(); // 0 = 周日, 6 = 周六
  if (day === 0 || day === 6) {
    return false;
  }
  const hour = bjDate.getUTCHours();
  const minute = bjDate.getUTCMinutes();
  const totalMinutes = hour * 60 + minute;

  const isMorningPeak = totalMinutes >= 9 * 60 && totalMinutes < 12 * 60;
  const isAfternoonPeak = totalMinutes >= 14 * 60 && totalMinutes < 18 * 60;
  return isMorningPeak || isAfternoonPeak;
}

function roundYuan(val: number): number {
  return Math.round(val * 1_000_000) / 1_000_000;
}

/**
 * 按 DeepSeek 官方阶梯峰谷与缓存命中价格计算单次大模型请求人民币费用（元）
 */
export function calculateDeepSeekTokenCostYuan(
  model: string,
  usage: DeepSeekTokenUsage,
  now: Date = new Date()
): number {
  const isPeak = isDeepSeekPeakHourBeijing(now);
  const normalizedModel = (model || 'deepseek-flash').toLowerCase();
  const isPro = normalizedModel.includes('pro') || normalizedModel.includes('reasoner');

  // 基准空闲时段单价（元 / 百万 Tokens）；高峰时段翻倍 (* 2)
  const multiplier = isPeak ? 2 : 1;
  const hitRatePerM = (isPro ? 0.15 : 0.02) * multiplier;
  const missRatePerM = (isPro ? 4.5 : 1.0) * multiplier;
  const outRatePerM = (isPro ? 13.5 : 4.0) * multiplier;

  const hitTokens = Math.max(0, usage.prompt_cache_hit_tokens ?? 0);
  const missTokens =
    usage.prompt_cache_miss_tokens !== undefined
      ? Math.max(0, usage.prompt_cache_miss_tokens)
      : Math.max(0, (usage.prompt_tokens ?? 0) - hitTokens);
  const completionTokens = Math.max(0, usage.completion_tokens ?? 0);

  const cost =
    (hitTokens / 1_000_000) * hitRatePerM +
    (missTokens / 1_000_000) * missRatePerM +
    (completionTokens / 1_000_000) * outRatePerM;

  return roundYuan(cost);
}

/**
 * 计算 DeepSeek 全家桶底层独立工具接口人民币费用（元）
 * - ASR: 限时优惠 0.39 元 / 小时
 * - OCR: 1.50 元 / 1,000 页
 * - TTS: 限时优惠 1.50 元 / 10,000 字符
 * - Search / Fetch: 5.00 元 / 1,000 次成功请求
 */
export function calculateDeepSeekToolCostYuan(event: DeepSeekToolBillingEvent): number {
  switch (event.type) {
    case 'asr':
      return roundYuan((Math.max(0, event.durationMs) / 3_600_000) * 0.39);
    case 'ocr':
      return roundYuan((Math.max(0, event.pageCount) / 1_000) * 1.5);
    case 'tts':
      return roundYuan((Math.max(0, event.charCount) / 10_000) * 1.5);
    case 'search':
      return roundYuan((Math.max(0, event.callCount) / 1_000) * 5.0);
  }
}

export interface RecognizeOcrOptions {
  file: Blob | File;
  fileName?: string;
  purpose?: 'text_recognition' | 'rich_layout_recognition';
}

export interface SynthesizeSpeechOptions {
  text: string;
  voiceId?: DeepSeekTtsVoiceId;
  format?: 'wav' | 'pcm';
  filterMarkdown?: boolean;
}

export interface WebSearchOptions {
  count?: number;
  oriQuestion?: string;
  needContent?: boolean;
}

export class DeepSeekSuiteClient {
  /**
   * 独立语音转文字接口：POST /v1/tools/asr
   * 仅上传 file (16-bit PCM WAV 或 Ogg Opus)，返回完整转写文本与毫秒级时长
   */
  public async transcribeAudio(
    wavBytes: Uint8Array,
    apiKey: string,
    baseUrl?: string
  ): Promise<DeepSeekAsrResult> {
    const cleanKey = (apiKey || '').trim();
    if (!cleanKey) {
      throw new Error('请先配置 DeepSeek API Key');
    }

    const origin = normalizeDeepSeekOrigin(baseUrl);
    const endpoint = `${origin}/v1/tools/asr`;

    // Tauri 桌面环境下优先走 Rust 原生免 CORS 代理
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { uint8ArrayToBase64 } = await import('../audio/localAsrClient');
        const rawRes = await invoke<string>('proxy_post_local_asr', {
          endpoint,
          wavBase64: uint8ArrayToBase64(wavBytes),
          model: 'deepseek-asr',
          apiKey: cleanKey,
        });
        const parsed = JSON.parse(rawRes);
        return {
          requestId: parsed.request_id || '',
          text: (parsed.text || '').trim(),
          durationMs: Number(parsed.duration_ms || 0),
        };
      } catch {
        // 回退至标准 fetch
      }
    }

    const wavBlob = new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });
    const formData = new FormData();
    formData.append('file', wavBlob, 'audio.wav');

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cleanKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`DeepSeek ASR 请求失败 (HTTP ${res.status}): ${errText.slice(0, 120)}`);
    }

    const data = await res.json();
    return {
      requestId: data.request_id || '',
      text: (data.text || '').trim(),
      durationMs: Number(data.duration_ms || 0),
    };
  }

  /**
   * 独立无状态文档与图像 OCR 接口：POST /v1/tools/ocr
   * 遵循 Zero-Content 原则：文件解析完即焚，不驻留云端 Files 库
   */
  public async recognizeDocumentOcr(
    options: RecognizeOcrOptions,
    settingsOrKey: ByokSettings | string,
    baseUrl?: string
  ): Promise<DeepSeekOcrResult>;
  public async recognizeDocumentOcr(
    file: Blob,
    fileName: string,
    apiKey: string,
    purpose?: 'text_recognition' | 'rich_layout_recognition',
    baseUrl?: string
  ): Promise<DeepSeekOcrResult>;
  public async recognizeDocumentOcr(
    fileOrOptions: Blob | RecognizeOcrOptions,
    fileNameOrSettings: string | ByokSettings,
    apiKeyOrBaseUrl?: string,
    purposeArg: 'text_recognition' | 'rich_layout_recognition' = 'rich_layout_recognition',
    baseUrlArg?: string
  ): Promise<DeepSeekOcrResult> {
    let file: Blob;
    let fileName = 'document.pdf';
    let purpose: 'text_recognition' | 'rich_layout_recognition' = purposeArg;
    let cleanKey = '';
    let resolvedBaseUrl = baseUrlArg;

    if (fileOrOptions instanceof Blob) {
      file = fileOrOptions;
      fileName = typeof fileNameOrSettings === 'string' && fileNameOrSettings ? fileNameOrSettings : 'document.pdf';
      cleanKey = (apiKeyOrBaseUrl || '').trim();
    } else {
      file = fileOrOptions.file;
      fileName =
        fileOrOptions.fileName ||
        (typeof File !== 'undefined' && fileOrOptions.file instanceof File ? fileOrOptions.file.name : '') ||
        'document.pdf';
      purpose = fileOrOptions.purpose || 'rich_layout_recognition';
      if (typeof fileNameOrSettings === 'string') {
        cleanKey = fileNameOrSettings.trim();
        resolvedBaseUrl = apiKeyOrBaseUrl;
      } else {
        cleanKey = resolveEffectiveDeepSeekKey(fileNameOrSettings);
        resolvedBaseUrl = apiKeyOrBaseUrl || fileNameOrSettings.llmBaseUrl;
      }
    }

    if (!cleanKey) {
      throw new Error('请先配置 DeepSeek API Key 以启用文档/图片 OCR 解析');
    }

    const origin = normalizeDeepSeekOrigin(resolvedBaseUrl);
    const endpoint = `${origin}/v1/tools/ocr`;

    const formData = new FormData();
    // 官方规范：purpose 字段置于 file 字段之前
    formData.append('purpose', purpose);
    formData.append('file', file, fileName);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cleanKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`DeepSeek OCR 解析失败 (HTTP ${res.status}): ${errText.slice(0, 120)}`);
    }

    const data = await res.json();
    const pages: DeepSeekOcrPage[] = Array.isArray(data.pages)
      ? data.pages.map((p: Record<string, unknown>) => ({
          index: Number(p.index || 0),
          text: String(p.text || ''),
          finishReason: String(p.finish_reason || 'stop'),
        }))
      : [];

    const fullText = pages
      .map((p) => p.text.trim())
      .filter(Boolean)
      .join('\n\n');

    return {
      id: String(data.id || `ocr_${Date.now()}`),
      purpose: data.purpose || purpose,
      pageCount: Number(data.page_count ?? pages.length),
      pages,
      fullText,
      usage: data.usage,
    };
  }

  /**
   * 独立语音合成接口：POST /v1/tools/tts
   * 支持 stella (知性女声) 与 tide (沉稳男声)，默认过滤 Markdown 标记返回 WAV 音频流
   */
  public async synthesizeSpeech(
    options: SynthesizeSpeechOptions,
    apiKeyOrSettings: string | ByokSettings,
    baseUrl?: string
  ): Promise<ArrayBuffer> {
    const cleanKey =
      typeof apiKeyOrSettings === 'string'
        ? apiKeyOrSettings.trim()
        : resolveEffectiveDeepSeekKey(apiKeyOrSettings);
    const resolvedBaseUrl =
      baseUrl || (typeof apiKeyOrSettings === 'string' ? undefined : apiKeyOrSettings.llmBaseUrl);

    if (!cleanKey) {
      throw new Error('请先配置 DeepSeek API Key 以启用纪要语音朗读');
    }

    const text = (options.text || '').trim().slice(0, 10_000);
    if (!text) {
      throw new Error('朗读文本不能为空');
    }

    const origin = normalizeDeepSeekOrigin(resolvedBaseUrl);
    const endpoint = `${origin}/v1/tools/tts`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cleanKey}`,
      },
      body: JSON.stringify({
        text,
        voice_id: options.voiceId || 'stella',
        format: options.format || 'wav',
        filter_markdown: options.filterMarkdown !== false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`DeepSeek TTS 语音合成失败 (HTTP ${res.status}): ${errText.slice(0, 120)}`);
    }

    return res.arrayBuffer();
  }

  /**
   * 独立联网搜索接口：POST /v1/tools/search
   */
  public async webSearch(
    query: string,
    apiKey: string,
    options: WebSearchOptions = {},
    baseUrl?: string
  ): Promise<DeepSeekSearchItem[]> {
    const cleanKey = (apiKey || '').trim();
    if (!cleanKey) {
      throw new Error('请先配置 DeepSeek API Key');
    }
    const cleanQuery = (query || '').trim().slice(0, 128);
    if (!cleanQuery) {
      return [];
    }

    const origin = normalizeDeepSeekOrigin(baseUrl);
    const endpoint = `${origin}/v1/tools/search`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cleanKey}`,
      },
      body: JSON.stringify({
        query: cleanQuery,
        count: options.count ?? 8,
        ori_question: options.oriQuestion ? options.oriQuestion.slice(0, 128) : null,
        need_content: Boolean(options.needContent),
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`DeepSeek Search 请求失败 (HTTP ${res.status}): ${errText.slice(0, 120)}`);
    }

    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  }

  /**
   * 独立网页 Markdown 抓取接口：POST /v1/tools/fetch
   */
  public async fetchUrl(
    targetUrl: string,
    apiKey: string,
    baseUrl?: string
  ): Promise<DeepSeekFetchResult> {
    const cleanKey = (apiKey || '').trim();
    if (!cleanKey) {
      throw new Error('请先配置 DeepSeek API Key');
    }

    const origin = normalizeDeepSeekOrigin(baseUrl);
    const endpoint = `${origin}/v1/tools/fetch`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cleanKey}`,
      },
      body: JSON.stringify({
        url: targetUrl.trim().slice(0, 8192),
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`DeepSeek Fetch 请求失败 (HTTP ${res.status}): ${errText.slice(0, 120)}`);
    }

    const data = await res.json();
    return {
      title: String(data.title || ''),
      content: String(data.content || ''),
    };
  }
}

let defaultDeepSeekSuiteClient = new DeepSeekSuiteClient();

export function getDeepSeekSuiteClient(): DeepSeekSuiteClient {
  return defaultDeepSeekSuiteClient;
}

export function setDeepSeekSuiteClient(client: DeepSeekSuiteClient): void {
  defaultDeepSeekSuiteClient = client;
}
