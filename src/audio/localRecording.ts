import type { RecordingReference } from '../types/meeting';
type NativeInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
const nativeInvoke: NativeInvoke = async (command, args) => {
 const { invoke } = await import('@tauri-apps/api/core'); return invoke(command, args);
};
export const isNativeRecording = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export class LocalRecordingSession {
 public samples = 0;
 public error: string | null = null;
 private id: string | null = null;
 private tail: Promise<unknown> = Promise.resolve();
 private queuedBytes = 0;
 private closed = false;
 private finishPromise: Promise<RecordingReference | undefined> | null = null;
 cancel(): void { this.closed = true; }
 constructor(private invoke: NativeInvoke = nativeInvoke) {}
 async start(token: string): Promise<void> {
  try {
   const identity = await this.invoke('bind_recording_identity', { token });
   if (this.closed) return;
   this.id = await this.invoke('start_local_recording', { identity }) as string;
   if (this.closed && this.id) await this.invoke('finish_local_recording', { id: this.id });
  } catch { this.error = '本机录音未能开始，请检查登录状态和磁盘'; }
 }
 append(chunk: ArrayBuffer): void {
  if (this.closed) return;
  this.samples += chunk.byteLength / 2;
  if (!this.id || this.error) return;
  if (this.queuedBytes + chunk.byteLength > 1024 * 1024) { this.error = '本机录音写入跟不上，录音不完整'; return; }
  const pcm = Array.from(new Uint8Array(chunk)); this.queuedBytes += chunk.byteLength;
  this.tail = this.tail.then(() => this.invoke('append_local_recording', { id: this.id, pcm }))
   .catch(() => { this.error = '本机录音写入失败，录音不完整'; })
   .finally(() => { this.queuedBytes -= chunk.byteLength; });
 }
 async checkpoint(): Promise<void> {
  await this.tail;
  if (this.id && !this.closed) {
   try { await this.invoke('checkpoint_local_recording', { id: this.id }); }
   catch { this.error = '本机录音保存失败'; }
  }
 }
 finish(): Promise<RecordingReference | undefined> {
  if (this.finishPromise) return this.finishPromise;
  this.closed = true;
  this.finishPromise = (async () => {
   await this.tail;
   if (!this.id) return;
   try {
    const result = await this.invoke('finish_local_recording', { id: this.id }) as RecordingReference;
    if (!this.error && result.samples > 0) return result;
   } catch { this.error = '本机录音保存失败'; }
  })();
  return this.finishPromise;
 }
}
let current: { meetingId: string; session: LocalRecordingSession; ready: Promise<void> } | null = null;
export function getLocalRecording(meetingId: string, token?: string): { session: LocalRecordingSession; ready: Promise<void> } {
 if (current?.meetingId === meetingId) return current;
 const session = new LocalRecordingSession();
 const ready = isNativeRecording() && token ? session.start(token) : Promise.resolve();
 current = { meetingId, session, ready }; return current;
}
export async function finishLocalRecording(meetingId: string): Promise<{ recording?: RecordingReference; warning?: string }> {
 if (current?.meetingId !== meetingId) return {};
 const captured = current; await captured.ready;
 const recording = await captured.session.finish();
 if (current === captured) current = null;
 return { recording, warning: captured.session.error || undefined };
}
export function clearLocalMedia(): void {
 current?.session.cancel();
 current = null;
 if (isNativeRecording()) void nativeInvoke('clear_recording_identity').catch(() => {});
}
export async function openLocalMedia(id: string, token: string): Promise<{ url: string; release: () => void }> {
 const identity = await nativeInvoke('bind_recording_identity', { token });
 const lease = await nativeInvoke('open_local_recording', { id, identity }) as string;
 const { convertFileSrc } = await import('@tauri-apps/api/core');
 return { url: convertFileSrc(lease, 'tingxu-media'), release: () => { void nativeInvoke('release_local_recording', { lease }).catch(() => {}); } };
}

export async function deleteLocalMedia(id: string, token?: string): Promise<void> {
 if (!isNativeRecording()) throw new Error('请在桌面端删除包含录音的会议');
 if (!token) throw new Error('请登录后删除本机录音');
 const identity = await nativeInvoke('bind_recording_identity', { token });
 await nativeInvoke('delete_local_recording', { id, identity });
}

export interface StorageUsage {
 totalBytes: number;
 recordingCount: number;
}

export interface PruneResult {
 freedBytes: number;
 deletedCount: number;
 deletedIds: string[];
}

export async function getRecordingStorageUsage(token?: string): Promise<StorageUsage> {
 if (!isNativeRecording() || !token) return { totalBytes: 0, recordingCount: 0 };
 try {
  const identity = await nativeInvoke('bind_recording_identity', { token });
  return (await nativeInvoke('get_recording_storage_usage', { identity })) as StorageUsage;
 } catch {
  return { totalBytes: 0, recordingCount: 0 };
 }
}

export async function pruneLocalRecordings(options: {
 token?: string;
 olderThanSecs?: number;
 targetIds?: string[];
}): Promise<PruneResult> {
 if (!isNativeRecording() || !options.token) return { freedBytes: 0, deletedCount: 0, deletedIds: [] };
 try {
  const identity = await nativeInvoke('bind_recording_identity', { token: options.token });
  return (await nativeInvoke('prune_local_recordings', {
   identity,
   olderThanSecs: options.olderThanSecs,
   targetIds: options.targetIds,
  })) as PruneResult;
 } catch {
  return { freedBytes: 0, deletedCount: 0, deletedIds: [] };
 }
}
