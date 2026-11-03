import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { RecordingReference } from '../types/meeting';
import { openLocalMedia } from '../audio/localRecording';
import { formatSeconds } from '../utils/formatTime';
export interface MeetingAudioHandle { seek: (seconds: number) => void }
interface Props {
 meetingId: string;
 recording?: RecordingReference;
 token?: string;
 warning?: string;
 seekTo?: { seconds: number; revision: number };
 onTime: (seconds: number) => void;
 onDeleteRecording?: () => void;
}
export const MeetingAudioPlayer = forwardRef<MeetingAudioHandle, Props>(({ meetingId, recording, token, warning, seekTo, onTime, onDeleteRecording }, ref) => {
 const audioRef = useRef<HTMLAudioElement>(null);
 const pendingSeek = useRef<number | null>(null);
 const [source, setSource] = useState<string>();
 const [ready, setReady] = useState(false);
 const [playing, setPlaying] = useState(false);
 const [seconds, setSeconds] = useState(0);
 const [duration, setDuration] = useState(0);
 const [rate, setRate] = useState(1);
 const [error, setError] = useState<string | null>(null);
 const onTimeRef = useRef(onTime); onTimeRef.current = onTime;
 useEffect(() => {
  let disposed = false; let release: (() => void) | undefined;
  const audio = audioRef.current;
  setSource(undefined); setReady(false); setPlaying(false); setSeconds(0); setDuration(0); setRate(1); setError(null); pendingSeek.current = null;
  if (recording && token) {
   void openLocalMedia(recording.id, token).then(media => {
    if (disposed) { media.release(); return; }
    release = media.release; setSource(media.url);
   }).catch(() => { if (!disposed) setError('本机录音不可用，请检查文件或登录状态'); });
  }
  return () => {
   disposed = true;
   if (audio?.getAttribute('src')) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
   release?.();
  };
 }, [meetingId, recording?.id, token]);
 const seek = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return;
  const audio = audioRef.current;
  if (!audio || !ready || !Number.isFinite(audio.duration)) { pendingSeek.current = value; return; }
  audio.currentTime = Math.max(0, Math.min(audio.duration, value));
  setSeconds(audio.currentTime); onTimeRef.current(audio.currentTime);
 };
 useImperativeHandle(ref, () => ({ seek }));
 useEffect(() => { if (seekTo) seek(seekTo.seconds); }, [seekTo?.revision]);
 const status = !recording ? warning || '本场会议未保存录音' : !token ? '请登录后读取本机录音' : error || (!ready ? '正在加载本机录音' : '录音仅保存在本机');
 const disabled = !ready || !source;
 return <div data-testid="summary-page-audio-player" className="p-3 bg-canvas border-t border-border-subtle flex flex-col gap-2 shrink-0">
  <audio key={meetingId} ref={audioRef} src={source} preload="metadata" data-testid="summary-page-audio-player-media"
   onLoadedMetadata={event => {
    const audio = event.currentTarget;
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) { setError('本机录音文件损坏'); return; }
    setDuration(audio.duration); setReady(true);
    if (pendingSeek.current !== null) { audio.currentTime = Math.min(audio.duration, pendingSeek.current); pendingSeek.current = null; setSeconds(audio.currentTime); onTimeRef.current(audio.currentTime); }
   }}
   onTimeUpdate={e => { setSeconds(e.currentTarget.currentTime); onTimeRef.current(e.currentTarget.currentTime); }}
   onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
   onError={() => { setPlaying(false); setReady(false); setError('本机录音不可用，请检查文件或登录状态'); }} />
  <p role="status" data-testid="summary-page-audio-player-text-status" className="text-[11px] text-text-tertiary">{status}</p>
  <div data-testid="summary-page-audio-player-div-progress" className="flex items-center gap-2 text-[11px] text-text-tertiary tabular-nums">
   <span data-testid="summary-page-audio-player-text-current">{formatSeconds(Math.floor(seconds))}</span>
   <input data-testid="summary-page-audio-player-input-seek" aria-label="录音播放位置" type="range" min="0" max={duration || 1} step="0.1" value={seconds} disabled={disabled} onChange={e => seek(Number(e.target.value))} className="min-w-0 flex-1 accent-brand-blue" />
   <span data-testid="summary-page-audio-player-text-duration">{formatSeconds(Math.floor(duration))}</span>
  </div>
  <div data-testid="summary-page-audio-player-div-controls" className="flex items-center gap-2 flex-wrap">
   <button data-testid="summary-page-btn-audio-play" disabled={disabled} type="button" className="px-3 py-1 rounded-md bg-brand-blue text-white text-xs disabled:opacity-40" onClick={() => {
    const audio = audioRef.current; if (!audio) return;
    if (playing) audio.pause(); else { setError(null); void audio.play().catch(() => { setPlaying(false); setError('播放失败，请重试'); }); }
   }}>{playing ? '⏸ 暂停' : '▶ 播放'}</button>
   <button data-testid="summary-page-audio-player-btn-back" type="button" disabled={disabled} aria-label="后退15秒" onClick={() => seek(Math.max(0, seconds - 15))} className="text-xs text-text-secondary disabled:opacity-40">−15s</button>
   <button data-testid="summary-page-audio-player-btn-forward" type="button" disabled={disabled} aria-label="前进15秒" onClick={() => seek(seconds + 15)} className="text-xs text-text-secondary disabled:opacity-40">+15s</button>
   {[1, 1.25, 1.5, 2].map(value => <button key={value} data-testid={`summary-page-audio-player-btn-rate-${value}`} type="button" aria-label={`${value}倍速`} aria-pressed={rate === value} disabled={disabled} onClick={() => { if (audioRef.current) audioRef.current.playbackRate = value; setRate(value); }} className={`text-[11px] px-1 py-0.5 rounded disabled:opacity-40 ${rate === value ? 'bg-brand-blue text-white' : 'text-text-tertiary'}`}>{value}x</button>)}
   {recording && onDeleteRecording && (
    <button
      data-testid="summary-page-audio-player-btn-delete-recording"
      type="button"
      title="释放本场录音文件（文字纪要将完整保留）"
      onClick={() => {
        if (window.confirm('确定要清理本场录音文件吗？此操作将释放本场录音的磁盘空间，文字逐字稿与纪要将完整保留。')) {
          onDeleteRecording();
        }
      }}
      className="ml-auto text-[11px] text-text-tertiary hover:text-status-danger px-1.5 py-0.5 rounded transition-colors"
    >
      🗑 释放音频
    </button>
   )}
  </div>
 </div>;
});
MeetingAudioPlayer.displayName = 'MeetingAudioPlayer';
