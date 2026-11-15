import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LocalAsrClient,
  createWavFromPcm16,
  normalizeOpenAiAsrEndpoint,
  normalizeDeepSeekAsrEndpoint,
} from '../localAsrClient';
import type { AsrTranscriptEvent } from '../realStreamingAsrClient';

describe('LocalAsrClient 本地离线 ASR 客户端 (Plan 027 T02 TDD)', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('createWavFromPcm16 应为 16kHz 单声道 PCM 正确添加 44 字节标准 WAV 头部', () => {
    // 构造 1000 样本的 PCM16 数据 (2000 字节)
    const pcmData = new Uint8Array(2000);
    const wavBytes = createWavFromPcm16(pcmData, 16000);

    expect(wavBytes.length).toBe(2000 + 44);
    // 验证 RIFF 标记 (前 4 字节: 0x52, 0x49, 0x46, 0x46)
    const headerStr = String.fromCharCode(...wavBytes.slice(0, 4));
    expect(headerStr).toBe('RIFF');
    // 验证 WAVE 标记 (8..12 字节)
    const waveStr = String.fromCharCode(...wavBytes.slice(8, 12));
    expect(waveStr).toBe('WAVE');
  });

  it('OpenAI HTTP 协议：分块累积后应向本地端点 POST WAV 音频并触发 FINAL 逐字稿事件', async () => {
    const events: AsrTranscriptEvent[] = [];
    const finals: string[] = [];

    // Mock fetch 模拟本地 Faster-Whisper / LocalAI 返回结果
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        text: '讨论本地离线语音识别架构落地',
      }),
    });

    const client = new LocalAsrClient({
      protocol: 'openai_http',
      endpoint: 'http://127.0.0.1:8000/v1/audio/transcriptions',
      model: 'whisper-1',
      chunkDurationMs: 2000,
      onTranscriptEvent: (ev) => events.push(ev),
      onFinalSentence: (s) => finals.push(s.text),
    });

    await client.start();

    // 模拟 16kHz PCM 音频输入 (1 秒 = 32000 字节)
    const oneSecPcm = new Uint8Array(32000);
    client.sendAudioChunk(oneSecPcm, 'mic');

    // 主动 flush 触发转写
    await client.flush();

    expect(global.fetch).toHaveBeenCalled();
    const [url, options] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8000/v1/audio/transcriptions');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);

    expect(events.length).toBeGreaterThan(0);
    const finalEvent = events.find((e) => e.type === 'FINAL');
    expect(finalEvent).toBeDefined();
    expect(finalEvent?.text).toBe('讨论本地离线语音识别架构落地');
    expect(finals).toContain('讨论本地离线语音识别架构落地');

    await client.stop();
  });

  it('Sherpa-ONNX WebSocket 协议：应建立双向流并处理 INTERIM 与 FINAL 消息', async () => {
    const events: AsrTranscriptEvent[] = [];

    // Mock WebSocket
    let wsInstance: any = null;
    const MockWebSocket = vi.fn().mockImplementation(function (this: any, url: string) {
      this.url = url;
      this.readyState = 1; // OPEN
      this.send = vi.fn();
      this.close = vi.fn();
      this.addEventListener = vi.fn((event: string, handler: any) => {
        if (event === 'open') {
          setTimeout(() => handler(), 0);
        }
      });
      wsInstance = this;
    });

    (MockWebSocket as any).OPEN = 1;
    (global as any).WebSocket = MockWebSocket;

    const client = new LocalAsrClient({
      protocol: 'sherpa_ws',
      endpoint: 'ws://127.0.0.1:6006',
      onTranscriptEvent: (ev) => events.push(ev),
    });

    await client.start();
    expect(MockWebSocket).toHaveBeenCalledWith('ws://127.0.0.1:6006');

    // 发送 PCM 音频块
    const chunk = new Uint8Array(1600);
    client.sendAudioChunk(chunk, 'mic');
    expect(wsInstance.send).toHaveBeenCalled();

    // 模拟 Sherpa-ONNX 接收中间流式文本
    client.handleIncomingWsMessage(JSON.stringify({ text: '正在识别中', is_final: false }));
    expect(events.some((e) => e.type === 'INTERIM' && e.text === '正在识别中')).toBe(true);

    // 模拟 Sherpa-ONNX 接收最终完成文本
    client.handleIncomingWsMessage(JSON.stringify({ text: '正在识别中已完成', is_final: true }));
    expect(events.some((e) => e.type === 'FINAL' && e.text === '正在识别中已完成')).toBe(true);

    await client.stop();
    expect(wsInstance.close).toHaveBeenCalled();
  });

  it('testConnection 静态探测：对可达端点应返回成功与有效延迟毫秒', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: 'test probe' }),
    });

    const res = await LocalAsrClient.testConnection({
      protocol: 'openai_http',
      endpoint: 'http://127.0.0.1:8000/v1/audio/transcriptions',
    });

    expect(res.success).toBe(true);
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
    expect(res.message).toContain('连接成功');
  });

  it('testConnection 静态探测：当网络异常或拒绝连接时应捕获并返回友好错误提示', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:8000'));

    const res = await LocalAsrClient.testConnection({
      protocol: 'openai_http',
      endpoint: 'http://127.0.0.1:8000/v1/audio/transcriptions',
    });

    expect(res.success).toBe(false);
    expect(res.message).toContain('连接失败');
  });

  it('testConnection 静态探测：当端点响应超时触发 abort 时应返回针对模型加载中的友好指导提示', async () => {
    const abortErr = new Error('fetch is aborted');
    abortErr.name = 'AbortError';
    global.fetch = vi.fn().mockRejectedValue(abortErr);

    const res = await LocalAsrClient.testConnection({
      protocol: 'openai_http',
      endpoint: 'http://127.0.0.1:8009/v1/audio/transcriptions',
    });

    expect(res.success).toBe(false);
    expect(res.message).toContain('端点连接超时');
    expect(res.message).toContain('Whisper 模型权重');
  });

  it('HTTP 模式下转写请求应携带前文 prompt 上下文以提高同音字准确率 (T02)', async () => {
    let capturedBody: FormData | null = null;
    global.fetch = vi.fn().mockImplementation((_url: string, init: any) => {
      capturedBody = init.body;
      return Promise.resolve({
        ok: true,
        text: async () => JSON.stringify({ text: '听序是本地会议助手' }),
      });
    });

    const client = new LocalAsrClient({
      protocol: 'openai_http',
      endpoint: 'http://127.0.0.1:8000/v1/audio/transcriptions',
    });

    client.setContextPrompt('上一句讨论的会议议题');
    await client.start();

    // 发送测试音频
    const pcm = new Uint8Array(32000);
    client.sendPcmChunk(pcm);
    await client.flush();

    expect(capturedBody).toBeDefined();
    expect(capturedBody!.get('prompt')).toBe('上一句讨论的会议议题');
    expect(client.getContextPrompt()).toContain('听序是本地会议助手');

    await client.stop();
  });

  it('normalizeOpenAiAsrEndpoint 应正确自动规整缺失的 /v1/audio/transcriptions 路径，杜绝 404', () => {
    expect(normalizeOpenAiAsrEndpoint('http://127.0.0.1:8000')).toBe('http://127.0.0.1:8000/v1/audio/transcriptions');
    expect(normalizeOpenAiAsrEndpoint('http://127.0.0.1:8000/')).toBe('http://127.0.0.1:8000/v1/audio/transcriptions');
    expect(normalizeOpenAiAsrEndpoint('http://127.0.0.1:8000/v1')).toBe('http://127.0.0.1:8000/v1/audio/transcriptions');
    expect(normalizeOpenAiAsrEndpoint('http://127.0.0.1:8000/v1/audio/transcriptions')).toBe('http://127.0.0.1:8000/v1/audio/transcriptions');
    expect(normalizeOpenAiAsrEndpoint('https://api.deepseek.com/v1/tools/asr')).toBe('https://api.deepseek.com/v1/tools/asr');
  });

  it('normalizeDeepSeekAsrEndpoint 应将基础域名或 /v1 规整为标准 /v1/tools/asr 路径 (Plan 029 T03)', () => {
    expect(normalizeDeepSeekAsrEndpoint('')).toBe('https://api.deepseek.com/v1/tools/asr');
    expect(normalizeDeepSeekAsrEndpoint('https://api.deepseek.com')).toBe('https://api.deepseek.com/v1/tools/asr');
    expect(normalizeDeepSeekAsrEndpoint('https://api.deepseek.com/v1/')).toBe('https://api.deepseek.com/v1/tools/asr');
    expect(normalizeDeepSeekAsrEndpoint('https://api.deepseek.com/v1/tools/asr')).toBe('https://api.deepseek.com/v1/tools/asr');
  });

  it('DeepSeek HTTP 协议 (deepseek_http)：发送纯净单 file 表单并回传服务端 duration_ms 用量 (Plan 029 T03)', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: FormData | null = null;
    const usages: Array<{ durationMs: number; source: 'mic' | 'system' }> = [];
    const events: AsrTranscriptEvent[] = [];

    global.fetch = vi.fn().mockImplementation((url: string, init: any) => {
      capturedUrl = url;
      capturedHeaders = init.headers;
      capturedBody = init.body;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: 'req_ds_asr_01',
          text: '使用 DeepSeek 全家桶语音识别接口',
          duration_ms: 3600,
        }),
      });
    });

    const client = new LocalAsrClient({
      protocol: 'deepseek_http',
      endpoint: 'https://api.deepseek.com/v1',
      apiKey: 'mock-ds-key',
      onTranscriptEvent: (ev) => events.push(ev),
      onAsrUsage: (u) => usages.push(u),
    });

    await client.start();
    client.sendAudioChunk(new Uint8Array(32000), 'mic');
    await client.flush('mic');

    expect(capturedUrl).toBe('https://api.deepseek.com/v1/tools/asr');
    expect(capturedHeaders.Authorization).toBe('Bearer mock-ds-key');
    expect(capturedBody).toBeInstanceOf(FormData);
    expect(capturedBody!.get('file')).toBeTruthy();
    expect(capturedBody!.get('model')).toBeNull();
    expect(capturedBody!.get('prompt')).toBeNull();

    expect(usages).toEqual([{ durationMs: 3600, source: 'mic' }]);
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('mic');
    expect(events[0].text).toBe('使用 DeepSeek 全家桶语音识别接口');

    await client.stop();
  });

  it('双轨独立缓冲：mic 与 system 物理声道应各自独立缓冲并保留对应的 source 标签 (Plan 029 T03)', async () => {
    const events: AsrTranscriptEvent[] = [];
    let callIndex = 0;

    global.fetch = vi.fn().mockImplementation(() => {
      callIndex += 1;
      const text = callIndex === 1 ? '这是我方麦克风发言' : '这是远端系统内录发言';
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: `req_${callIndex}`,
          text,
          duration_ms: 1500,
        }),
      });
    });

    const client = new LocalAsrClient({
      protocol: 'deepseek_http',
      endpoint: 'https://api.deepseek.com/v1/tools/asr',
      apiKey: 'mock-ds-key',
      onTranscriptEvent: (ev) => events.push(ev),
    });

    await client.start();
    client.sendAudioChunk(new Uint8Array(32000), 'mic');
    client.sendAudioChunk(new Uint8Array(32000), 'system');

    await client.flush('mic');
    await client.flush('system');

    expect(events).toHaveLength(2);
    expect(events[0].source).toBe('mic');
    expect(events[0].text).toBe('这是我方麦克风发言');
    expect(events[1].source).toBe('system');
    expect(events[1].text).toBe('这是远端系统内录发言');

    await client.stop();
  });

  it('testConnection 静态探测：deepseek_http 协议应向 /v1/tools/asr 发送不含 model 的探测包 (Plan 029 T03)', async () => {
    let capturedUrl = '';
    let capturedBody: FormData | null = null;
    global.fetch = vi.fn().mockImplementation((url: string, init: any) => {
      capturedUrl = url;
      capturedBody = init.body;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ request_id: 'probe_1', text: '', duration_ms: 100 }),
      });
    });

    const res = await LocalAsrClient.testConnection({
      protocol: 'deepseek_http',
      endpoint: 'https://api.deepseek.com/v1',
      apiKey: 'mock-ds-key',
    });

    expect(res.success).toBe(true);
    expect(capturedUrl).toBe('https://api.deepseek.com/v1/tools/asr');
    expect(capturedBody!.get('file')).toBeTruthy();
    expect(capturedBody!.get('model')).toBeNull();
  });

  it('testConnection 容灾与协议自识别：Tauri 原生探针报客户端构建错误时应自动回退 fetch，且在 openai_http 下遇到 /tools/asr 自动省略 model 字段', async () => {
    // 模拟处于 Tauri 窗口环境，且旧版原生探针未启用 TLS 返回 builder error
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockResolvedValue({
        success: false,
        latencyMs: 0,
        message: '连接失败: builder error for url (https://api.deepseek.com/v1/tools/asr)',
      }),
    };

    let capturedUrl = '';
    let capturedBody: FormData | null = null;
    global.fetch = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedBody = init.body as FormData;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ request_id: 'probe_fallback_ok', text: '', duration_ms: 500 }),
      });
    });

    try {
      const res = await LocalAsrClient.testConnection({
        protocol: 'openai_http',
        endpoint: 'https://api.deepseek.com/v1/tools/asr',
        apiKey: 'mock-ds-key',
      });

      expect(res.success).toBe(true);
      expect(capturedUrl).toBe('https://api.deepseek.com/v1/tools/asr');
      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.get('file')).toBeTruthy();
      expect(capturedBody!.get('model')).toBeNull();
    } finally {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    }
  });

  it('normalizeDeepSeekAsrEndpoint: 遇到遗留的 wss:// 或 /audio/transcriptions 地址应安全收敛至合法的 /v1/tools/asr', async () => {
    const { normalizeDeepSeekAsrEndpoint } = await import('../localAsrClient');
    expect(normalizeDeepSeekAsrEndpoint('wss://dashscope.aliyuncs.com/api-ws/v1/inference')).toBe(
      'https://api.deepseek.com/v1/tools/asr'
    );
    expect(normalizeDeepSeekAsrEndpoint('http://127.0.0.1:8000/v1/audio/transcriptions')).toBe(
      'https://api.deepseek.com/v1/tools/asr'
    );
    expect(normalizeDeepSeekAsrEndpoint('https://api.deepseek.com/v1/chat/completions')).toBe(
      'https://api.deepseek.com/v1/tools/asr'
    );
  });
});
