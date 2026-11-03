import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMeetingStore } from '../../src/store/useMeetingStore';

beforeEach(() => {
  useMeetingStore.getState().resetMeeting();
  useMeetingStore.setState({ currentUser: null, isGeneratingSummary: false, historyMeetings: [] });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline-fixture')));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('014 会话排空先于历史和纪要快照', () => {
  it('结束时冻结计时，纳入延迟final，重复结束不再请求或归档', async () => {
    const store = useMeetingStore.getState();
    store.startMeeting('synthetic');
    for (let i = 0; i < 5; i++) store.tickTimer();
    let release: (() => void) | undefined;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const drain = vi.fn(async () => {
      await waiting;
      useMeetingStore.getState().addTranscriptSegment({ id: 'tail', speaker: '未确定', channel: 'mic', timestamp: '00:00:04', text: '最后一句' });
      return 'complete' as const;
    });
    useMeetingStore.setState({ asrSessionDrain: drain });
    const pending = store.endMeeting();
    store.tickTimer();
    expect(useMeetingStore.getState().elapsedSeconds).toBe(5);
    expect(useMeetingStore.getState().historyMeetings).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    await store.endMeeting();
    expect(drain).toHaveBeenCalledTimes(1);
    release?.(); await pending;
    expect(useMeetingStore.getState().historyMeetings[0].transcripts?.map(s => s.id)).toEqual(['tail']);
    expect(useMeetingStore.getState().historyMeetings[0].durationSeconds).toBe(5);
    await store.endMeeting();
    expect(drain).toHaveBeenCalledTimes(1);
  });

  it('暂停排空期间不可恢复，超时只给出未定稿提示，不伪造正文', async () => {
    const store = useMeetingStore.getState(); store.startMeeting('synthetic');
    let release: ((value: 'timeout') => void) | undefined;
    useMeetingStore.setState({ asrSessionDrain: () => new Promise(resolve => { release = resolve; }) });
    const pending = store.pauseMeeting();
    store.resumeMeeting(); store.tickTimer();
    expect(useMeetingStore.getState().status).toBe('PAUSED');
    expect(useMeetingStore.getState().elapsedSeconds).toBe(0);
    release?.('timeout'); await pending;
    expect(useMeetingStore.getState().asrDrainWarning).toContain('未定稿');
    expect(useMeetingStore.getState().transcripts).toEqual([]);
    store.resumeMeeting();
    expect(useMeetingStore.getState().status).toBe('RECORDING');
  });
});
