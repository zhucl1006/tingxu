import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealStreamingAsrClient } from '../realStreamingAsrClient';

describe('RealStreamingAsrClient 流式 ASR 客户端测试 (T11)', () => {
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
});
