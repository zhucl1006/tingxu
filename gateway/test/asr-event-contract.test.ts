import { afterEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { attachStreamingAsrServer } from '../src/asr/streamingAsrServer.js';

type Message = { type?: string; [key: string]: unknown };
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function harness(ready = true) {
  const upstreamHttp = http.createServer();
  const upstreamWss = new WebSocketServer({ server: upstreamHttp });
  await new Promise<void>(r => upstreamHttp.listen(0, '127.0.0.1', r));
  const server = http.createServer();
  const wss = attachStreamingAsrServer({ server, getAsrConfig: () => ({
    provider: 'dashscope', apiKey: 'local-fixture',
    endpoint: `ws://127.0.0.1:${(upstreamHttp.address() as AddressInfo).port}`,
  }) });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const upConnected = once(upstreamWss, 'connection');
  const client = new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/gateway/v1/asr/stream`);
  const clientOpen = once(client, 'open');
  const messages: Message[] = [];
  client.on('message', data => messages.push(JSON.parse(data.toString()) as Message));
  const [upstream] = await upConnected as [WebSocket];
  const upstreamMessages: Array<{ header?: { action?: string } }> = [];
  upstream.on('message', (data, binary) => { if (!binary) upstreamMessages.push(JSON.parse(data.toString())); });
  await clientOpen;
  cleanup.push(async () => {
    for (const socket of [...wss.clients, ...upstreamWss.clients, client]) socket.terminate();
    wss.close(); upstreamWss.close();
    await Promise.all([new Promise<void>(r => server.close(() => r())), new Promise<void>(r => upstreamHttp.close(() => r()))]);
  });
  const emit = (sentence: Record<string, unknown>) => upstream.send(JSON.stringify({
    header: { event: 'result-generated' }, payload: { output: { sentence } },
  }));
  const event = (name: string) => upstream.send(JSON.stringify({ header: { event: name } }));
  if (ready) event('task-started');
  return { client, upstream, messages, upstreamMessages, emit, event };
}

describe('014 ASR event contract with local upstream', () => {
  it('finish waits for upstream readiness and drains queued PCM before finish-task', async () => {
    const h = await harness(false);
    const received: string[] = [];
    h.upstream.on('message', (data, binary) => {
      if (binary) received.push('pcm');
      else if (JSON.parse(data.toString()).header?.action === 'finish-task') received.push('finish');
    });
    h.client.send(Buffer.alloc(3200));
    h.client.send(JSON.stringify({ type: 'FINISH' }));
    await new Promise(r => setTimeout(r, 20));
    expect(received).toEqual([]);
    h.event('task-started');
    await new Promise(r => setTimeout(r, 20));
    expect(received).toEqual(['pcm', 'finish']);
  });

  it('bounded drain timeout reports timeout rather than complete', async () => {
    const h = await harness();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      h.client.send(JSON.stringify({ type: 'FINISH' }));
      await new Promise<void>(resolve => h.upstream.once('message', () => resolve()));
      const reply = new Promise<Message>(resolve => {
        h.client.on('message', data => {
          const parsed = JSON.parse(data.toString()) as Message;
          if (parsed.type === 'FINISHED') resolve(parsed);
        });
      });
      await vi.advanceTimersByTimeAsync(5001);
      expect(await reply).toMatchObject({ type: 'FINISHED', outcome: 'timeout' });
    } finally { vi.useRealTimers(); }
  });
  it.each([true, false])('keeps sentence identity when begin time disappears or appears (%s)', async firstHasTime => {
    const h = await harness();
    h.emit({ text: '初稿', begin_time: firstHasTime ? 10 : null, sentence_end: false });
    h.emit({ text: '最终', begin_time: firstHasTime ? null : 10, sentence_end: true });
    await new Promise(r => setTimeout(r, 25));
    const results = h.messages.filter(m => m.type === 'INTERIM' || m.type === 'FINAL');
    expect(results).toHaveLength(2);
    expect(results[0].utteranceId).toBe(results[1].utteranceId);
    expect(results.map(m => m.revision)).toEqual([1, 2]);
  });
  it('associates revisions, keeps word times and suppresses duplicate final / heartbeat', async () => {
    const h = await harness();
    h.emit({ text: '测试初稿', begin_time: 0, sentence_end: false });
    h.emit({ text: '测试', begin_time: 0, sentence_end: false });
    const final = { text: '测试。', begin_time: 0, end_time: 500, sentence_end: true,
      words: [{ text: '测试', begin_time: 0, end_time: 500 }] };
    h.emit(final); h.emit(final);
    h.emit({ text: '心跳不显示', heartbeat: true, begin_time: 0 });
    await new Promise(r => setTimeout(r, 30));
    const results = h.messages.filter(m => m.type === 'INTERIM' || m.type === 'FINAL');
    expect(results).toHaveLength(3);
    expect(results.map(m => m.revision)).toEqual([1, 2, 3]);
    expect(new Set(results.map(m => m.utteranceId)).size).toBe(1);
    expect(results[0]).toMatchObject({ protocolVersion: 2, source: 'mic', beginTimeMs: 0 });
    expect(results[2]).toMatchObject({ sentence: { text: '测试。', words: [{ text: '测试', beginTimeMs: 0, endTimeMs: 500 }] } });
  });

  it('keeps the downstream open for a tail final before acknowledging finish', async () => {
    const h = await harness();
    h.client.send(JSON.stringify({ type: 'FINISH' }));
    await new Promise(r => setTimeout(r, 25));
    expect(h.upstreamMessages.some(m => m.header?.action === 'finish-task')).toBe(true);
    h.emit({ text: '最后一句。', begin_time: 800, end_time: 1200, sentence_end: true });
    h.event('task-finished');
    await new Promise(r => setTimeout(r, 25));
    expect(h.messages.filter(m => m.type === 'FINAL' || m.type === 'FINISHED').map(m => m.type)).toEqual(['FINAL', 'FINISHED']);
    expect(h.messages.find(m => m.type === 'FINISHED')).toMatchObject({ outcome: 'complete' });
  });

  it('does not forward provider error text or malformed word payloads', async () => {
    const h = await harness();
    h.emit({ text: '有效文字', begin_time: -1, end_time: 'bad', sentence_end: true, words: [{ text: 123 }] });
    h.upstream.send(JSON.stringify({ header: { event: 'task-failed', error_message: 'PRIVATE_TRANSCRIPT' } }));
    await new Promise(r => setTimeout(r, 25));
    expect(JSON.stringify(h.messages)).not.toContain('PRIVATE_TRANSCRIPT');
    const final = h.messages.find(m => m.type === 'FINAL');
    expect(final).toMatchObject({ beginTimeMs: null, endTimeMs: null, sentence: { words: [] } });
  });
});
