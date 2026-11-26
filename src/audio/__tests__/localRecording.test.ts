import { describe, it, expect, vi } from 'vitest';
import { LocalRecordingSession } from '../localRecording';
describe('bounded local recording session', () => {
 it('orders writes, checkpoints and finalization; tracks exact sample clock', async () => {
  const calls: string[] = [];
  const invoke = vi.fn(async (name: string) => { calls.push(name); if (name === 'start_local_recording') return 'abc'; if (name === 'finish_local_recording') return { id: 'abc', samples: 1600, sampleRate: 16000 }; });
  const s = new LocalRecordingSession(invoke);
  await s.start('token'); s.append(new ArrayBuffer(3200));
  expect(s.samples).toBe(1600); await s.checkpoint(); const meta = await s.finish();
  expect(meta?.samples).toBe(1600); expect(calls).toEqual(['bind_recording_identity', 'start_local_recording', 'append_local_recording', 'checkpoint_local_recording', 'finish_local_recording']);
  s.append(new ArrayBuffer(10)); expect(s.samples).toBe(1600);
 });
 it('fails closed on write error without discarding text or accumulating an unlimited queue', async () => {
  const s = new LocalRecordingSession(async name => { if (name === 'start_local_recording') return 'id'; if (name === 'append_local_recording') throw Error('disk'); });
  await s.start('token'); s.append(new ArrayBuffer(100)); await s.checkpoint();
  expect(s.error).toBeTruthy(); expect(await s.finish()).toBeUndefined();
 });
 it('cancel during native identity validation cannot create a late writer', async () => {
  let release!: () => void;
  const invoke = vi.fn(async (name: string) => { if (name === 'bind_recording_identity') await new Promise<void>(resolve => { release = resolve; }); });
  const session = new LocalRecordingSession(invoke); const starting = session.start('token'); session.cancel(); release(); await starting;
  expect(invoke).toHaveBeenCalledTimes(1);
 });
 it('delegates storage usage and pruning calls to native invoke with bound identity', async () => {
  const { getRecordingStorageUsage, pruneLocalRecordings } = await import('../localRecording');
  expect(await getRecordingStorageUsage()).toEqual({ totalBytes: 0, recordingCount: 0 });
  expect(await pruneLocalRecordings({})).toEqual({ freedBytes: 0, deletedCount: 0, deletedIds: [] });
 });
 it('append 应直接透传高效二进制 Uint8Array 直通 IPC，杜绝普通大数组 JSON 序列化导致 GC 卡顿 (TDD)', async () => {
  let passedPcm: unknown = null;
  const invoke = vi.fn(async (name: string, args?: Record<string, unknown>) => {
   if (name === 'start_local_recording') return 'rec_id_binary';
   if (name === 'append_local_recording') { passedPcm = args?.pcm; return undefined; }
   return undefined;
  });
  const s = new LocalRecordingSession(invoke);
  await s.start('test-token');
  const buffer = new ArrayBuffer(640);
  s.append(buffer);
  await s.checkpoint();

  expect(passedPcm).toBeInstanceOf(Uint8Array);
  expect(Array.isArray(passedPcm)).toBe(false);
 });
 it('单机模式下直接绑定本地沙箱身份，即使存在过期云端 token 也不调用控制面校验 (Issue #6 TDD)', async () => {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const invoke = vi.fn(async (name: string, args?: Record<string, unknown>) => {
   calls.push({ name, args });
   if (name === 'bind_standalone_recording_identity') return 7;
   if (name === 'start_local_recording') return 'rec_standalone_1';
   return undefined;
  });
  const s = new LocalRecordingSession(invoke);
  await s.start('stale-cloud-token', { standalone: true });

  expect(s.error).toBeNull();
  expect(calls.map((c) => c.name)).toEqual([
   'bind_standalone_recording_identity',
   'start_local_recording',
  ]);
 });
 it('区分磁盘不可写与登录态失效错误，避免笼统误报 (Issue #6 TDD)', async () => {
  const diskSession = new LocalRecordingSession(async () => {
   throw new Error('本机录音目录不可写，请检查磁盘空间或读写权限');
  });
  await diskSession.start(undefined, { standalone: true });
  expect(diskSession.error).toContain('磁盘');
  expect(diskSession.error).not.toContain('登录');

  const authSession = new LocalRecordingSession(async () => {
   throw new Error('录音登录态校验失败，请重新登录');
  });
  await authSession.start('expired-token');
  expect(authSession.error).toContain('登录');
  expect(authSession.error).not.toContain('磁盘');
 });
});
