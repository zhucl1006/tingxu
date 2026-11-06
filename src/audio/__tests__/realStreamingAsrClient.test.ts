import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealStreamingAsrClient, streamingAsrUrl } from '../realStreamingAsrClient';

describe('RealStreamingAsrClient 流式 ASR 客户端测试 (T11)', () => {
  it('014：转写地址遵循配置的网关，HTTPS对应WSS，非法协议拒绝', () => {
    expect(streamingAsrUrl('http://127.0.0.1:3214')).toBe('ws://127.0.0.1:3214/gateway/v1/asr/stream');
    expect(streamingAsrUrl('https://gateway.example/')).toBe('wss://gateway.example/gateway/v1/asr/stream');
    expect(() => streamingAsrUrl('file:///tmp/test')).toThrow();
  });
  let mockWs: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockWs = {
      readyState: 1, // OPEN
      send: vi.fn(),
      close: vi.fn(),
      onopen: null as any,
      onmessage: null as any,
      onerror: null as any,
      onclose: null as any,
    };

    (global as any).WebSocket = vi.fn().mockImplementation(() => mockWs);
  });

  it('连接建立后应能发送 16kHz PCM 二进制帧', async () => {
    const client = new RealStreamingAsrClient({
      wsUrl: 'ws://localhost:3201/gateway/v1/asr/stream',
    });

    const connectPromise = client.connect();
    // 模拟握手成功
    mockWs.onopen();
    await connectPromise;

    expect(client.isConnected()).toBe(true);

    // 发送 PCM 块
    const dummyBuffer = new ArrayBuffer(3200);
    client.sendPcmChunk(dummyBuffer);

    expect(mockWs.send).toHaveBeenCalledWith(dummyBuffer);

    // 断开连接
    client.disconnect();
    expect(mockWs.close).toHaveBeenCalled();
  });

  it('传入 meetingId 时，WebSocket 建连 URL 应正确携带 meetingId 查询参数 (T02)', async () => {
    const client = new RealStreamingAsrClient({
      wsUrl: 'ws://localhost:3201/gateway/v1/asr/stream',
      meetingId: 'mtg_asr_test_101',
    });

    const connectPromise = client.connect();
    mockWs.onopen();
    await connectPromise;

    expect((global as any).WebSocket).toHaveBeenCalledWith('ws://localhost:3201/gateway/v1/asr/stream?meetingId=mtg_asr_test_101');
    client.disconnect();
  });

  it('收到 ASR 转写消息时应触发临时与终态句子回调', async () => {
    let interimText = '';
    let receivedSentence: any = null;

    const client = new RealStreamingAsrClient({
      wsUrl: 'ws://localhost:3201/gateway/v1/asr/stream',
      onInterimText: (text) => {
        interimText = text;
      },
      onFinalSentence: (sentence) => {
        receivedSentence = sentence;
      },
    });

    client.connect();
    mockWs.onopen();

    // 1. 模拟收到中间识别字
    mockWs.onmessage({
      data: JSON.stringify({
        type: 'INTERIM',
        text: '我们今天讨论的是',
      }),
    });
    expect(interimText).toBe('我们今天讨论的是');

    // 2. 模拟收到确认句（包含句子起止时间与说话人标识）
    mockWs.onmessage({
      data: JSON.stringify({
        type: 'FINAL',
        sentence: {
          text: '我们今天讨论的是听序正式接入真实 ASR 与大模型。',
          speaker: '我',
          speakerId: 'spk_1',
          timestamp: '14:20:00',
          beginTimeMs: 1200,
          endTimeMs: 4200,
        },
      }),
    });
    expect(receivedSentence).toEqual({
      text: '我们今天讨论的是听序正式接入真实 ASR 与大模型。',
      speaker: '我',
      speakerId: 'spk_1',
      timestamp: '14:20:00',
      beginTimeMs: 1200,
      endTimeMs: 4200,
    });
  });

  it('014：finish等待尾句和确认、重复调用幂等且停止发送新音频', async () => {
    const events = vi.fn();
    const client = new RealStreamingAsrClient({ onTranscriptEvent: events });
    const connected = client.connect(); mockWs.onopen(); await connected;
    const pending = client.finish();
    expect(client.finish()).toBe(pending);
    expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'FINISH' }));
    client.sendPcmChunk(new ArrayBuffer(3200));
    expect(mockWs.send).toHaveBeenCalledTimes(1);
    expect(mockWs.close).not.toHaveBeenCalled();
    mockWs.onmessage({ data: JSON.stringify({ type: 'FINAL', protocolVersion: 2,
      taskId: 'task', utteranceId: 't0', revision: 1, source: 'mic', beginTimeMs: 0, endTimeMs: 500,
      sentence: { text: '最后一句', timestamp: '00:00:00' } }) });
    expect(events).toHaveBeenCalledTimes(1);
    mockWs.onmessage({ data: JSON.stringify({ type: 'FINISHED', outcome: 'complete' }) });
    await expect(pending).resolves.toBe('complete');
    expect(mockWs.close).toHaveBeenCalledTimes(1);
  });

  it('014：finish超时不把草稿强制转final，旧socket事件隔离', async () => {
    vi.useFakeTimers();
    try {
      const final = vi.fn();
      const client = new RealStreamingAsrClient({ onFinalSentence: final });
      const connected = client.connect(); mockWs.onopen(); await connected;
      const oldMessage = mockWs.onmessage;
      const pending = client.finish(20);
      await vi.advanceTimersByTimeAsync(21);
      await expect(pending).resolves.toBe('timeout');
      oldMessage({ data: JSON.stringify({ type: 'FINAL', sentence: { text: '旧连接文字', timestamp: '' } }) });
      expect(final).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('014：拒绝畸形v2事件和供应商错误正文', async () => {
    const events = vi.fn(), error = vi.fn();
    const client = new RealStreamingAsrClient({ onTranscriptEvent: events, onError: error });
    const connected = client.connect(); mockWs.onopen(); await connected;
    mockWs.onmessage({ data: JSON.stringify({ type: 'INTERIM', protocolVersion: 2, text: {}, revision: -1 }) });
    expect(events).not.toHaveBeenCalled();
    mockWs.onmessage({ data: JSON.stringify({ type: 'ERROR', message: 'PRIVATE_TRANSCRIPT' }) });
    expect(error.mock.calls[0][0].message).not.toContain('PRIVATE_TRANSCRIPT');
    client.disconnect();
  });

  it('014：录音中意外FINISHED必须关闭并提示，不能保持假连接', async () => {
    const error = vi.fn();
    const client = new RealStreamingAsrClient({ onError: error });
    const connected = client.connect(); mockWs.onopen(); await connected;
    mockWs.onmessage({ data: JSON.stringify({ type: 'FINISHED', outcome: 'error' }) });
    expect(client.isConnected()).toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    expect(mockWs.close).toHaveBeenCalled();
  });
});
