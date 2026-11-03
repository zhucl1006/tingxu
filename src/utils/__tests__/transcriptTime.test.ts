import { expect, it } from 'vitest';
import { parseTimecode, segmentPlaybackSeconds } from '../transcriptTime';
it('only accepts complete timecodes, never digits inside quoted evidence', () => {
 expect(parseTimecode('计划15秒内完成30项')).toBeNull(); expect(parseTimecode('(00:15)')).toBeNull();
 expect(parseTimecode('00:15')).toBe(15); expect(parseTimecode('01:02:03')).toBe(3723);
 expect(parseTimecode('01:99')).toBeNull(); expect(parseTimecode('-01:10')).toBeNull();
});
it('requires explicit recording timeline for new media and never guesses from ASR arrival time', () => {
 const seg = { id: 'x', speaker: 'a', text: 'x', channel: 'mic' as const, timestamp: '00:30', beginTimeMs: 5000 };
 expect(segmentPlaybackSeconds(seg)).toBeNull(); expect(segmentPlaybackSeconds({ ...seg, recordingBeginMs: 15000 })).toBe(15);
});
