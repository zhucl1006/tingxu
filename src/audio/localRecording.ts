import type { RecordingReference } from '../types/meeting';
type NativeInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
const nativeInvoke: NativeInvoke = async (command, args) => {
 const { invoke } = await import('@tauri-apps/api/core'); return invoke(command, args);
};
export const isNativeRecording = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export interface LocalRecordingIdentityOptions {
 standalone?: boolean;
}
function extractInvokeErrorMessage(err: unknown): string {
 if (!err) return '';
 if (typeof err === 'string') return err;
 if (err instanceof Error) return err.message;
 if (typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
  return (err as { message: string }).message;
 }
 return String(err);
}
function formatLocalRecordingStartError(err: unknown, standalone: boolean): string {
 const msg = extractInvokeErrorMessage(err);
 if (/磁盘|不可写|目录|disk|space|no such file|read-only|EACCES|EROFS|ENOSPC|DiskIoError/i.test(msg)) {
  return '本机录音目录不可写，请检查磁盘空间或读写权限';
 }
 if (!standalone && /登录|校验|身份|auth|token|session|unauthorized|401/i.test(msg)) {
  return '本机录音登录态已失效，请重新登录或切换单机模式';
 }
 return standalone
  ? '本机录音未能开始，请检查本地存储目录与磁盘空间'
  : '本机录音未能开始，请检查登录状态或本地存储目录';
}
async function bindIdentity(
 invoke: NativeInvoke,
 token?: string,
 options?: LocalRecordingIdentityOptions
): Promise<unknown> {
 if (options?.standalone || !token) {
  return invoke('bind_standalone_recording_identity');
 }
 return invoke('bind_recording_identity', { token });
}
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
 async start(token?: string, options?: LocalRecordingIdentityOptions): Promise<void> {
  const standalone = Boolean(options?.standalone || !token);
  try {
   const identity = await bindIdentity(this.invoke, token, options);
   if (this.closed) return;
   this.id = await this.invoke('start_local_recording', { identity }) as string;
   if (this.closed && this.id) await this.invoke('finish_local_recording', { id: this.id });
  } catch (err) {
   this.error = formatLocalRecordingStartError(err, standalone);
  }
 }
 append(chunk: ArrayBuffer): void {
  if (this.closed) return;
  this.samples += chunk.byteLength / 2;
  if (!this.id || this.error) return;
  if (this.queuedBytes + chunk.byteLength > 1024 * 1024) { this.error = '本机录音写入跟不上，录音不完整'; return; }
  const pcm = new Uint8Array(chunk); this.queuedBytes += chunk.byteLength;
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
export function getLocalRecording(
 meetingId: string,
 token?: string,
 options?: LocalRecordingIdentityOptions
): { session: LocalRecordingSession; ready: Promise<void> } {
 if (current?.meetingId === meetingId) return current;
 const session = new LocalRecordingSession();
 const shouldStart = isNativeRecording() && (Boolean(options?.standalone) || Boolean(token));
 const ready = shouldStart ? session.start(token, options) : Promise.resolve();
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
export async function openLocalMedia(
 id: string,
 token?: string,
 options?: LocalRecordingIdentityOptions
): Promise<{ url: string; release: () => void }> {
 const identity = await bindIdentity(nativeInvoke, token, options);
 const lease = await nativeInvoke('open_local_recording', { id, identity }) as string;
 const { convertFileSrc } = await import('@tauri-apps/api/core');
 return { url: convertFileSrc(lease, 'tingxu-media'), release: () => { void nativeInvoke('release_local_recording', { lease }).catch(() => {}); } };
}

export async function deleteLocalMedia(
 id: string,
 token?: string,
 options?: LocalRecordingIdentityOptions
): Promise<void> {
 if (!isNativeRecording()) throw new Error('请在桌面端删除包含录音的会议');
 if (!options?.standalone && !token) throw new Error('请登录后删除本机录音');
 const identity = await bindIdentity(nativeInvoke, token, options);
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

export async function getRecordingStorageUsage(
 token?: string,
 options?: LocalRecordingIdentityOptions
): Promise<StorageUsage> {
 if (!isNativeRecording() || (!options?.standalone && !token)) return { totalBytes: 0, recordingCount: 0 };
 try {
  const identity = await bindIdentity(nativeInvoke, token, options);
  return (await nativeInvoke('get_recording_storage_usage', { identity })) as StorageUsage;
 } catch {
  return { totalBytes: 0, recordingCount: 0 };
 }
}

export async function pruneLocalRecordings(options: {
 token?: string;
 standalone?: boolean;
 olderThanSecs?: number;
 targetIds?: string[];
}): Promise<PruneResult> {
 if (!isNativeRecording() || (!options.standalone && !options.token)) return { freedBytes: 0, deletedCount: 0, deletedIds: [] };
 try {
  const identity = await bindIdentity(nativeInvoke, options.token, { standalone: options.standalone });
  return (await nativeInvoke('prune_local_recordings', {
   identity,
   olderThanSecs: options.olderThanSecs,
   targetIds: options.targetIds,
  })) as PruneResult;
 } catch {
  return { freedBytes: 0, deletedCount: 0, deletedIds: [] };
 }
}
