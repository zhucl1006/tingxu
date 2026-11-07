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

  it('调用 disconnect() 能够优雅退出，状态流转为 DISCONNECTED', async () => {
    const client = new EmbeddedAsrClient();
    await client.connect();
    expect(client.getState()).toBe('CONNECTED');

    await client.disconnect();
    expect(client.getState()).toBe('DISCONNECTED');
    expect(client.isConnected()).toBe(false);
  });
});
