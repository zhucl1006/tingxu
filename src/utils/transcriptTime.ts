import type { TranscriptSegment } from '../types/meeting';
export function parseTimecode(value?: string): number | null {
 if (!value || !/^(?:\d{2,}:)?\d{2}:\d{2}$/.test(value)) return null;
 const parts = value.split(':').map(Number);
 if (parts[parts.length - 1] >= 60 || (parts.length === 3 && parts[1] >= 60)) return null;
 const seconds = parts.reduce((total, part) => total * 60 + part, 0);
 return Number.isSafeInteger(seconds) ? seconds : null;
}
export function segmentPlaybackSeconds(segment?: TranscriptSegment): number | null {
 const ms = segment?.recordingBeginMs;
 return typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 ? ms / 1000 : null;
}
export function playingSegment(segments: TranscriptSegment[], seconds: number): string | null {
 return [...segments].reverse().find(s => {
  const start = segmentPlaybackSeconds(s);
  return start !== null && seconds >= start && (s.recordingEndMs === undefined || seconds < s.recordingEndMs / 1000);
 })?.id || null;
}
