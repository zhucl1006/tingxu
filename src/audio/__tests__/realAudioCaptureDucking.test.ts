import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RealAudioCapture } from '../realAudioCapture';

describe('RealAudioCapture - 自适应声学约束与防系统音频衰减 (Ducking Mitigation) (TDD)', () => {
  let mockGetUserMedia: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [{ onended: null, stop: vi.fn() }],
      getTracks: () => [{ onended: null, stop: vi.fn() }],
      active: true,
    });

    if (typeof navigator === 'undefined') {
      (global as any).navigator = {};
    }
    (navigator as any).mediaDevices = {
      getUserMedia: mockGetUserMedia,
      enumerateDevices: vi.fn().mockResolvedValue([]),
    };

    // Mock AudioContext
    (window as any).AudioContext = vi.fn().mockImplementation(() => ({
      sampleRate: 48000,
      state: 'running',
      createMediaStreamSource: vi.fn().mockReturnValue({ connect: vi.fn() }),
      createBiquadFilter: vi.fn().mockReturnValue({
        connect: vi.fn(),
        type: 'highpass',
        frequency: { value: 80 },
      }),
      createGain: vi.fn().mockReturnValue({
        gain: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
      createScriptProcessor: vi.fn().mockReturnValue({
        connect: vi.fn(),
        disconnect: vi.fn(),
        onaudioprocess: null,
      }),
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('防声音变小：默认高保真拾音策略下，getUserMedia 不应启用 echoCancellation 与 autoGainControl', async () => {
    const capture = new RealAudioCapture({
      sampleRate: 16000,
      // 未显式指定 echoCancellation，应默认避免触发 macOS Voice Ducking 衰减
    });

    await capture.start();

    expect(mockGetUserMedia).toHaveBeenCalledTimes(1);
    const constraints = mockGetUserMedia.mock.calls[0][0].audio;
    // 杜绝 macOS Voice Ducking（音量下压 3~6dB）
    expect(constraints.echoCancellation).toBe(false);
    expect(constraints.autoGainControl).toBe(false);

    await capture.stop();
  });

  it('开启系统数字内录时，默认声学策略依然保持关闭侵入式回声消除，确保系统播放音量 100% 原始大小', async () => {
    const capture = new RealAudioCapture({
      sampleRate: 16000,
      captureMode: 'speaker_meeting',
    });

    // 模拟原生环境系统数字内录已开启
    vi.spyOn(capture, 'isSystemAudioCapturing').mockReturnValue(true);

    await capture.start();

    const constraints = mockGetUserMedia.mock.calls[0][0].audio;
    expect(constraints.echoCancellation).toBe(false);
    expect(constraints.autoGainControl).toBe(false);

    await capture.stop();
  });

  it('显式选择外放强力消回声模式 (speaker_aec) 时，应按需开启 echoCancellation', async () => {
    const capture = new RealAudioCapture({
      sampleRate: 16000,
      echoCancellation: true,
      autoGainControl: true,
    });

    await capture.start();

    const constraints = mockGetUserMedia.mock.calls[0][0].audio;
    expect(constraints.echoCancellation).toBe(true);
    expect(constraints.autoGainControl).toBe(true);

    await capture.stop();
  });
});
