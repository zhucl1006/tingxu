import { createRef } from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MeetingAudioPlayer, type MeetingAudioHandle } from '../MeetingAudioPlayer';
const release = vi.fn();
vi.mock('../../audio/localRecording', () => ({ openLocalMedia: vi.fn(async () => ({ url: 'tingxu-media://localhost/test', release })) }));
beforeEach(() => { vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {}); vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const recording = { id: 'id', samples: 320000, sampleRate: 16000 };
it('disables unavailable recordings rather than simulating playback', () => {
 render(<MeetingAudioPlayer meetingId="old" onTime={() => {}} />);
 expect(screen.getByTestId('summary-page-btn-audio-play')).toBeDisabled(); expect(screen.getByText('本场会议未保存录音')).toBeInTheDocument();
});
it('uses real media events, pending seek, rate and releases on unmount', async () => {
 const ref = createRef<MeetingAudioHandle>(); const onTime = vi.fn();
 const { unmount } = render(<MeetingAudioPlayer ref={ref} meetingId="new" recording={recording} token="token" onTime={onTime} />);
 const audio = screen.getByTestId('summary-page-audio-player-media') as HTMLAudioElement;
 await waitFor(() => expect(audio.src).toContain('tingxu-media'));
 ref.current?.seek(15); Object.defineProperty(audio, 'duration', { configurable: true, value: 20 }); fireEvent.loadedMetadata(audio);
 expect(audio.currentTime).toBe(15);
 fireEvent.click(screen.getByTestId('summary-page-audio-player-btn-forward')); expect(audio.currentTime).toBe(20);
 fireEvent.change(screen.getByTestId('summary-page-audio-player-input-seek'), { target: { value: '5' } }); expect(audio.currentTime).toBe(5);
 fireEvent.click(screen.getByTestId('summary-page-audio-player-btn-rate-1.5')); expect(audio.playbackRate).toBe(1.5);
 fireEvent.timeUpdate(audio); expect(onTime).toHaveBeenCalledWith(5);
 fireEvent.play(audio); expect(screen.getByTestId('summary-page-btn-audio-play')).toHaveTextContent('暂停');
 fireEvent.ended(audio); expect(screen.getByTestId('summary-page-btn-audio-play')).toHaveTextContent('播放');
 unmount(); expect(release).toHaveBeenCalled();
});
it('play rejection reports an error and does not claim playback', async () => {
 vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(Error('blocked'));
 render(<MeetingAudioPlayer meetingId="new" recording={recording} token="token" onTime={() => {}} />);
 const audio = screen.getByTestId('summary-page-audio-player-media'); await waitFor(() => expect(audio).toHaveAttribute('src'));
 Object.defineProperty(audio, 'duration', { configurable: true, value: 20 }); fireEvent.loadedMetadata(audio);
 fireEvent.click(screen.getByTestId('summary-page-btn-audio-play'));
 await screen.findByText('播放失败，请重试'); expect(screen.getByTestId('summary-page-btn-audio-play')).toHaveTextContent('播放');
});
