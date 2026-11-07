import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddedAsrClient } from '../embeddedAsrClient';
import type { AsrTranscriptEvent } from '../realStreamingAsrClient';

describe('EmbeddedAsrClient - 内嵌轻量 ASR 引擎客户端 (TDD)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初始状态应为 DISCONNECTED，isConnected() 为 false', () => {
    const client = new EmbeddedAsrClient();
    expect(client.getState()).toBe('DISCONNECTED');
    expect(client.isConnected()).toBe(false);
  });

  it('调用 connect() 成功连接，状态流转为 CONNECTED，且绝不报错抛出 404', async () => {
    const client = new EmbeddedAsrClient();
    const stateChanges: string[] = [];
    client.onStateChange((state) => stateChanges.push(state));

    await client.connect();

    expect(client.getState()).toBe('CONNECTED');
    expect(client.isConnected()).toBe(true);
    expect(stateChanges).toContain('CONNECTING');
    expect(stateChanges).toContain('CONNECTED');
  });

  it('能正确注册并触发 onTranscriptEvent 逐字稿事件', async () => {
    const client = new EmbeddedAsrClient();
    await client.connect();

    const events: AsrTranscriptEvent[] = [];
    client.onTranscriptEvent((ev) => events.push(ev));

    client.emitTranscriptForTest({
      type: 'INTERIM',
      taskId: 'test_task',
      utteranceId: 'utt_1',
      revision: 1,
      source: 'mic',
      beginTimeMs: null,
      endTimeMs: null,
      text: '正在使用内嵌轻量模型转写',
    });

    client.emitTranscriptForTest({
      type: 'FINAL',
      taskId: 'test_task',
      utteranceId: 'utt_1',
      revision: 2,
      source: 'mic',
      beginTimeMs: null,
      endTimeMs: null,
      text: '正在使用内嵌轻量模型转写。',
      sentence: {
        text: '正在使用内嵌轻量模型转写。',
        timestamp: new Date().toISOString(),
      },
    });

    expect(events.length).toBe(2);
    expect(events[0].type).toBe('INTERIM');
    expect(events[0].text).toBe('正在使用内嵌轻量模型转写');
    expect(events[1].type).toBe('FINAL');
    expect(events[1].sentence?.text).toBe('正在使用内嵌轻量模型转写。');
  });

  it('调用 sendPcmChunk() 与 finish() 正常工作且不崩溃', async () => {
    const client = new EmbeddedAsrClient();
    await client.connect();

    const dummyChunk = new Uint8Array([0, 1, 2, 3, 4, 5]);
    expect(() => client.sendPcmChunk(dummyChunk)).not.toThrow();

    const res = await client.finish();
    expect(res).toBeDefined();
  });

  it('sendPcmChunk 能够累积音频数据并在 flush 时触发转写生成逐字稿 (TDD)', async () => {
    const finalSentences: any[] = [];
    const transcriptEvents: any[] = [];

    // Mock fetch 返回 OpenAI 兼容格式
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ text: '今天我们开会讨论听序架构' }),
    } as any);

    try {
      const client = new EmbeddedAsrClient({
        endpoint: 'http://127.0.0.1:8009/v1/audio/transcriptions',
        onFinalSentence: (s) => finalSentences.push(s),
        onTranscriptEvent: (ev) => transcriptEvents.push(ev),
      });

      await client.connect();

      // 发送 0.5 秒 16kHz 16-bit 单声道音频 (16000 字节)
      const mockPcm = new Uint8Array(16000);
      client.sendPcmChunk(mockPcm);

      expect(client.getBufferedBytes()).toBe(16000);

      // 手动执行 flush 排空转写
      await client.flush();

      expect(client.getBufferedBytes()).toBe(0);
      expect(finalSentences.length).toBe(1);
      expect(finalSentences[0].text).toBe('今天我们开会讨论听序架构');
      expect(transcriptEvents.length).toBeGreaterThanOrEqual(1);
      expect(transcriptEvents[0].type).toBe('FINAL');
      expect(transcriptEvents[0].text).toBe('今天我们开会讨论听序架构');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('自动端点探测：自动发现 8009/8000 候选端点并绑定就绪引擎 (TDD)', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('8009')) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ text: 'you' }),
        } as any);
      }
      return Promise.reject(new Error('Connection refused'));
    });

    try {
      const client = new EmbeddedAsrClient({
        endpoint: '', // 未显式配置，依赖自动发现
      });

      await client.connect();
      expect(client.isConnected()).toBe(true);
      expect(client.getActiveEndpoint()).toBe('http://127.0.0.1:8009/v1/audio/transcriptions');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('支持设置并维护前文 prompt 上下文记忆以提升转写准确率 (T02)', async () => {
    let capturedPrompt: string | null = null;
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((_url: string, init: any) => {
      capturedPrompt = init?.body?.get?.('prompt') || null;
      return Promise.resolve({
        ok: true,
        text: async () => JSON.stringify({ text: '我们继续听序讨论' }),
      } as any);
    });

    try {
      const client = new EmbeddedAsrClient({
        endpoint: 'http://127.0.0.1:8009/v1/audio/transcriptions',
      });
      client.setContextPrompt('前文主题');
      await client.connect();

      const pcm = new Uint8Array(16000);
      client.sendPcmChunk(pcm);
      await client.flush();

      expect(capturedPrompt).toBe('前文主题');
      expect(client.getContextPrompt()).toContain('我们继续听序讨论');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('调用 disconnect() 能够优雅退出，状态流转为 DISCONNECTED', async () => {
    const client = new EmbeddedAsrClient();
    await client.connect();
    expect(client.getState()).toBe('CONNECTED');

    await client.disconnect();
    expect(client.getState()).toBe('DISCONNECTED');
    expect(client.isConnected()).toBe(false);
  });
});
