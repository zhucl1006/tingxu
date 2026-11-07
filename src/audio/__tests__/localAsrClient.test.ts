import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalAsrClient, createWavFromPcm16, normalizeOpenAiAsrEndpoint } from '../localAsrClient';
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

  it('normalizeOpenAiAsrEndpoint 应正确自动规整缺失的 /v1/audio/transcriptions 路径，杜绝 404', () => {
    expect(normalizeOpenAiAsrEndpoint('http://127.0.0.1:8000')).toBe('http://127.0.0.1:8000/v1/audio/transcriptions');
    expect(normalizeOpenAiAsrEndpoint('http://127.0.0.1:8000/')).toBe('http://127.0.0.1:8000/v1/audio/transcriptions');
    expect(normalizeOpenAiAsrEndpoint('http://127.0.0.1:8000/v1')).toBe('http://127.0.0.1:8000/v1/audio/transcriptions');
    expect(normalizeOpenAiAsrEndpoint('http://127.0.0.1:8000/v1/audio/transcriptions')).toBe('http://127.0.0.1:8000/v1/audio/transcriptions');
  });
});
