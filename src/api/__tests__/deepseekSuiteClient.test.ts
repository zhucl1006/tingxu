import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveEffectiveDeepSeekKey,
  normalizeDeepSeekOrigin,
  isDeepSeekPeakHourBeijing,
  calculateDeepSeekTokenCostYuan,
  calculateDeepSeekToolCostYuan,
  DeepSeekSuiteClient,
} from '../deepseekSuiteClient';
import type { ByokSettings } from '../../types/meeting';

describe('DeepSeek 全家桶凭据共享与精准峰谷计费引擎 (Plan 029 T01 TDD)', () => {
  const baseSettings: ByokSettings = {
    mode: 'standalone',
    llmProvider: 'deepseek',
    llmApiKey: 'mock-deepseek-master-key-001',
    llmBaseUrl: 'https://api.deepseek.com/v1',
    llmModel: 'deepseek-flash',
    asrProvider: 'deepseek',
    asrApiKey: '',
    asrEndpoint: 'https://api.deepseek.com/v1/tools/asr',
    shareDeepSeekKey: true,
    enableSummaryThinking: true,
    ttsVoiceId: 'stella',
  };

  it('resolveEffectiveDeepSeekKey: 开启 shareDeepSeekKey 且未单独填 asrApiKey 时应自动复用 llmApiKey', () => {
    expect(resolveEffectiveDeepSeekKey(baseSettings)).toBe('mock-deepseek-master-key-001');

    // 若单独指定了专用工具 Key 则优先使用专用 Key
    expect(
      resolveEffectiveDeepSeekKey({
        ...baseSettings,
        asrApiKey: 'mock-dedicated-asr-key-002',
      })
    ).toBe('mock-dedicated-asr-key-002');

    // 若关闭共享且未填专用 Key，则不越权复用非 DeepSeek LLM Key
    expect(
      resolveEffectiveDeepSeekKey({
        ...baseSettings,
        llmProvider: 'qwen',
        shareDeepSeekKey: false,
        asrApiKey: '',
      })
    ).toBe('');

    // 若 ASR 选用了百炼 (dashscope)，则不应误将百炼 asrApiKey 当作 DeepSeek 全家桶 Key，而应回退复用 DeepSeek llmApiKey
    expect(
      resolveEffectiveDeepSeekKey({
        ...baseSettings,
        asrProvider: 'dashscope',
        asrApiKey: 'mock-bailian-dashscope-key',
        llmProvider: 'deepseek',
        llmApiKey: 'mock-deepseek-master-key-001',
      })
    ).toBe('mock-deepseek-master-key-001');
  });

  it('normalizeDeepSeekOrigin: 应将含 /v1 或 /v1/chat/completions 的地址规范化为根域名', () => {
    expect(normalizeDeepSeekOrigin('https://api.deepseek.com/v1')).toBe('https://api.deepseek.com');
    expect(normalizeDeepSeekOrigin('https://api.deepseek.com/v1/')).toBe('https://api.deepseek.com');
    expect(normalizeDeepSeekOrigin('https://api.deepseek.com/v1/chat/completions')).toBe(
      'https://api.deepseek.com'
    );
    expect(normalizeDeepSeekOrigin('https://api.deepseek.com/anthropic')).toBe(
      'https://api.deepseek.com'
    );
    expect(normalizeDeepSeekOrigin('')).toBe('https://api.deepseek.com');
  });

  it('isDeepSeekPeakHourBeijing: 应准确识别北京时间工作日 09:00-12:00 与 14:00-18:00 高峰时段', () => {
    // 2026-11-16 是周一；北京时间 10:30 = UTC 02:30 -> 高峰
    expect(isDeepSeekPeakHourBeijing(new Date('2026-11-16T02:30:00Z'))).toBe(true);
    // 周一北京时间 13:00 (午休) = UTC 05:00 -> 空闲
    expect(isDeepSeekPeakHourBeijing(new Date('2026-11-16T05:00:00Z'))).toBe(false);
    // 周一北京时间 15:30 = UTC 07:30 -> 高峰
    expect(isDeepSeekPeakHourBeijing(new Date('2026-11-16T07:30:00Z'))).toBe(true);
    // 周一北京时间 21:00 = UTC 13:00 -> 空闲
    expect(isDeepSeekPeakHourBeijing(new Date('2026-11-16T13:00:00Z'))).toBe(false);
    // 2026-11-14 是周六；北京时间 10:30 = UTC 02:30 -> 周末全天空闲
    expect(isDeepSeekPeakHourBeijing(new Date('2026-11-14T02:30:00Z'))).toBe(false);
  });

  it('calculateDeepSeekTokenCostYuan: 应按 deepseek-flash 与 deepseek-v4-pro 峰谷及缓存命中精准计费', () => {
    // 空闲时段 (周六): deepseek-flash 命中 0.02/M, 未命中 1.00/M, 输出 4.00/M
    const offPeakTime = new Date('2026-11-14T02:30:00Z');
    const flashOffPeak = calculateDeepSeekTokenCostYuan(
      'deepseek-flash',
      {
        prompt_cache_hit_tokens: 500_000, // 0.5M * 0.02 = 0.01
        prompt_cache_miss_tokens: 100_000, // 0.1M * 1.00 = 0.10
        completion_tokens: 50_000, // 0.05M * 4.00 = 0.20
      },
      offPeakTime
    );
    expect(flashOffPeak).toBeCloseTo(0.31, 5);

    // 高峰时段 (周一 10:30): deepseek-flash 价格翻倍 -> 0.62 元
    const peakTime = new Date('2026-11-16T02:30:00Z');
    const flashPeak = calculateDeepSeekTokenCostYuan(
      'deepseek-flash',
      {
        prompt_cache_hit_tokens: 500_000,
        prompt_cache_miss_tokens: 100_000,
        completion_tokens: 50_000,
      },
      peakTime
    );
    expect(flashPeak).toBeCloseTo(0.62, 5);

    // deepseek-v4-pro 空闲时段: 命中 0.15/M, 未命中 4.50/M, 输出 13.50/M
    const proOffPeak = calculateDeepSeekTokenCostYuan(
      'deepseek-v4-pro',
      {
        prompt_tokens: 100_000, // 无 hit/miss 拆分时按未命中计: 0.1M * 4.50 = 0.45
        completion_tokens: 20_000, // 0.02M * 13.50 = 0.27
      },
      offPeakTime
    );
    expect(proOffPeak).toBeCloseTo(0.72, 5);
  });

  it('calculateDeepSeekToolCostYuan: 应精准计算 ASR (0.39元/时)、OCR (1.5元/千页)、TTS (1.5元/万字)、Search (5元/千次)', () => {
    // 1 小时 (3,600,000 ms) ASR = 0.39 元
    expect(calculateDeepSeekToolCostYuan({ type: 'asr', durationMs: 3_600_000 })).toBeCloseTo(0.39, 5);
    // 20 页 PPT OCR = 20 / 1000 * 1.5 = 0.03 元
    expect(calculateDeepSeekToolCostYuan({ type: 'ocr', pageCount: 20 })).toBeCloseTo(0.03, 5);
    // 2000 字符 TTS = 2000 / 10000 * 1.5 = 0.30 元
    expect(calculateDeepSeekToolCostYuan({ type: 'tts', charCount: 2000 })).toBeCloseTo(0.30, 5);
    // 2 次联网搜索/抓取 = 2 / 1000 * 5.0 = 0.01 元
    expect(calculateDeepSeekToolCostYuan({ type: 'search', callCount: 2 })).toBeCloseTo(0.01, 5);
  });
});

describe('DeepSeekSuiteClient - 五大独立底层工具 API 协议适配测试 (Plan 029 T02 TDD)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('transcribeAudio: 应向 /v1/tools/asr 发送仅包含 file 的 multipart/form-data 并解析 duration_ms', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url, init: any) => {
      expect(url.toString()).toBe('https://api.deepseek.com/v1/tools/asr');
      expect(init.method).toBe('POST');
      expect(init.headers['Authorization']).toBe('Bearer mock-ds-key');
      const form = init.body as FormData;
      expect(form.get('file')).toBeTruthy();
      expect(form.get('model')).toBeNull(); // 严禁夹带 OpenAI whisper model 字段

      return {
        ok: true,
        status: 200,
        json: async () => ({
          request_id: 'req-asr-001',
          text: '确认下周五上线新版网关',
          duration_ms: 3450,
        }),
      } as any;
    });

    const client = new DeepSeekSuiteClient();
    const wavBytes = new Uint8Array([82, 73, 70, 70]);
    const res = await client.transcribeAudio(wavBytes, 'mock-ds-key', 'https://api.deepseek.com/v1');
    expect(res.requestId).toBe('req-asr-001');
    expect(res.text).toBe('确认下周五上线新版网关');
    expect(res.durationMs).toBe(3450);
  });

  it('recognizeDocumentOcr: 应向 /v1/tools/ocr 提交 purpose 与 file 并拼接分页文本（无状态不留存）', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url, init: any) => {
      expect(url.toString()).toBe('https://api.deepseek.com/v1/tools/ocr');
      expect(init.headers['Authorization']).toBe('Bearer mock-ds-key');
      const form = init.body as FormData;
      expect(form.get('purpose')).toBe('rich_layout_recognition');
      expect(form.get('file')).toBeTruthy();

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'ocr-9988',
          object: 'ocr.result',
          created: 1700000000,
          purpose: 'rich_layout_recognition',
          page_count: 2,
          pages: [
            { index: 0, text: '# 第一页：项目里程碑', finish_reason: 'stop' },
            { index: 1, text: '## 第二页：SLA 99.99%', finish_reason: 'stop' },
          ],
          usage: { input_tokens: 240, output_tokens: 80 },
        }),
      } as any;
    });

    const client = new DeepSeekSuiteClient();
    const dummyFile = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    const res = await client.recognizeDocumentOcr(
      dummyFile,
      'agenda.pdf',
      'mock-ds-key',
      'rich_layout_recognition',
      'https://api.deepseek.com/v1'
    );

    expect(res.id).toBe('ocr-9988');
    expect(res.pageCount).toBe(2);
    expect(res.fullText).toContain('第一页：项目里程碑');
    expect(res.fullText).toContain('第二页：SLA 99.99%');
  });

  it('synthesizeSpeech: 应向 /v1/tools/tts 发送 JSON 并返回二进制音频 ArrayBuffer', async () => {
    const fakeWav = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]).buffer;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url, init: any) => {
      expect(url.toString()).toBe('https://api.deepseek.com/v1/tools/tts');
      const body = JSON.parse(init.body);
      expect(body.text).toBe('本次会议达成两项核心决策。');
      expect(body.voice_id).toBe('tide');
      expect(body.format).toBe('wav');
      expect(body.filter_markdown).toBe(true);

      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => fakeWav,
      } as any;
    });

    const client = new DeepSeekSuiteClient();
    const audioBuf = await client.synthesizeSpeech(
      { text: '本次会议达成两项核心决策。', voiceId: 'tide' },
      'mock-ds-key',
      'https://api.deepseek.com/v1'
    );
    expect(audioBuf.byteLength).toBe(8);
  });

  it('webSearch & fetchUrl: 应正确调用 /v1/tools/search 与 /v1/tools/fetch', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              rerank_score: 2.8,
              title: 'DeepSeek V4.1 Docs',
              url: 'https://api-docs.deepseek.com',
              snippet: '1M context window',
              summary: 'Detailed summary',
              content: '',
              site_name: 'DeepSeek',
              date: '2026-11-14T00:00:00Z',
              authority: 5,
            },
          ],
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          title: 'DeepSeek API Changelog',
          content: '# Changelog\nApp API Suite released.',
        }),
      } as any);

    const client = new DeepSeekSuiteClient();
    const searchResults = await client.webSearch('DeepSeek V4.1', 'mock-ds-key', { count: 5 });
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0].title).toBe('DeepSeek V4.1 Docs');

    const page = await client.fetchUrl('https://api-docs.deepseek.com', 'mock-ds-key');
    expect(page.title).toBe('DeepSeek API Changelog');
    expect(page.content).toContain('App API Suite');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('recognizeDocumentOcr & synthesizeSpeech: 支持直接传入 ByokSettings 配置对象与选项字典完成调用', async () => {
    const fakeWav = new Uint8Array([82, 73, 70, 70]).buffer;
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async (url, init: any) => {
        expect(url.toString()).toBe('https://api.deepseek.com/v1/tools/ocr');
        expect(init.headers['Authorization']).toBe('Bearer mock-shared-ds-key');
        const form = init.body as FormData;
        expect(form.get('purpose')).toBe('rich_layout_recognition');
        expect(form.get('file')).toBeTruthy();
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'ocr-byok-1',
            purpose: 'rich_layout_recognition',
            page_count: 1,
            pages: [{ index: 0, text: '议程概要', finish_reason: 'stop' }],
          }),
        } as any;
      })
      .mockImplementationOnce(async (url, init: any) => {
        expect(url.toString()).toBe('https://api.deepseek.com/v1/tools/tts');
        expect(init.headers['Authorization']).toBe('Bearer mock-shared-ds-key');
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => fakeWav,
        } as any;
      });

    const settings: ByokSettings = {
      mode: 'standalone',
      llmProvider: 'deepseek',
      llmApiKey: 'mock-shared-ds-key',
      llmBaseUrl: 'https://api.deepseek.com/v1',
      llmModel: 'deepseek-flash',
      asrProvider: 'deepseek',
      asrApiKey: '',
      asrEndpoint: 'https://api.deepseek.com/v1/tools/asr',
      shareDeepSeekKey: true,
      enableSummaryThinking: true,
      ttsVoiceId: 'stella',
    };

    const client = new DeepSeekSuiteClient();
    const file = new File(['%PDF'], 'slide.pdf', { type: 'application/pdf' });
    const ocrRes = await client.recognizeDocumentOcr(
      { file, purpose: 'rich_layout_recognition' },
      settings
    );
    expect(ocrRes.pageCount).toBe(1);
    expect(ocrRes.fullText).toBe('议程概要');

    const ttsBuf = await client.synthesizeSpeech(
      { text: '会议纪要朗读测试', voiceId: 'stella' },
      settings
    );
    expect(ttsBuf.byteLength).toBe(4);
  });
});
