import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealAudioCapture, floatTo16BitPCM } from '../realAudioCapture';

describe('RealAudioCapture 真实麦克风音频采集器测试 (T10)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('floatTo16BitPCM 应将 Float32 [-1, 1] 准确转换为 16-bit 线性 PCM Buffer', () => {
    const input = new Float32Array([0, 1.0, -1.0, 0.5, -0.5]);
    const pcmBuffer = floatTo16BitPCM(input);

    expect(pcmBuffer.byteLength).toBe(input.length * 2);
    const int16View = new Int16Array(pcmBuffer);
    expect(int16View[0]).toBe(0);
    expect(int16View[1]).toBe(32767); // 最大值
    expect(int16View[2]).toBe(-32768); // 最小值
    expect(int16View[3]).toBe(16383); // 0.5
    expect(int16View[4]).toBe(-16384); // -0.5
  });

  it('开启真实麦克风录制应调用 getUserMedia 并支持流式 PCM 与 RMS 回调', async () => {
    const mockTrack = { stop: vi.fn() };
    const mockStream = {
      getTracks: () => [mockTrack],
      getAudioTracks: () => [mockTrack],
    };

    // Mock navigator.mediaDevices.getUserMedia
    const getUserMediaMock = vi.fn().mockResolvedValue(mockStream);
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getUserMedia: getUserMediaMock },
      configurable: true,
      writable: true,
    });

    // Mock AudioContext
    const mockSource = { connect: vi.fn(), disconnect: vi.fn() };
    const mockProcessor = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      onaudioprocess: null as any,
    };

    class MockAudioContext {
      public sampleRate = 16000;
      public createMediaStreamSource = vi.fn().mockReturnValue(mockSource);
      public createScriptProcessor = vi.fn().mockReturnValue(mockProcessor);
      public destination = {};
      public close = vi.fn().mockResolvedValue(undefined);
    }

    (global as any).AudioContext = MockAudioContext;
    (global as any).webkitAudioContext = MockAudioContext;

    let receivedChunkCount = 0;
    let receivedRmsLevel = 0;

    const capture = new RealAudioCapture({
      onAudioChunk: (chunk) => {
        if (chunk.byteLength > 0) receivedChunkCount++;
      },
      onRmsLevel: (rms) => {
        receivedRmsLevel = rms;
      },
    });

    await capture.start();
    expect(getUserMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({ channelCount: 1 }),
      })
    );
    expect(capture.isCapturing()).toBe(true);

    // 模拟一段麦克风输入音频帧
    const mockAudioEvent = {
      inputBuffer: {
        getChannelData: () => new Float32Array([0.2, 0.4, 0.3, 0.1, -0.2]),
      },
    };
    mockProcessor.onaudioprocess(mockAudioEvent);

    expect(receivedChunkCount).toBe(1);
    expect(receivedRmsLevel).toBeGreaterThan(0);

    // 停止录制
    await capture.stop();
    expect(capture.isCapturing()).toBe(false);
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it('当音频音轨中断 (onended 蓝牙断开) 时应触发回调并支持平滑切回麦克风', async () => {
    let trackEndedCallback: (() => void) | null = null;
    const mockTrack = {
      stop: vi.fn(),
      set onended(fn: any) {
        trackEndedCallback = fn;
      },
    };
    const mockStream = {
      getTracks: () => [mockTrack],
      getAudioTracks: () => [mockTrack],
    };

    const getUserMediaMock = vi.fn().mockResolvedValue(mockStream);
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: getUserMediaMock,
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: 'audioinput', deviceId: 'mic_default', label: '内置麦克风' },
          { kind: 'audioinput', deviceId: 'mic_bluetooth', label: 'AirPods 蓝牙麦克风' },
        ]),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      configurable: true,
      writable: true,
    });

    const mockSource = { connect: vi.fn(), disconnect: vi.fn() };
    const mockProcessor = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null };
    class MockAudioContext {
      public sampleRate = 16000;
      public createMediaStreamSource = vi.fn().mockReturnValue(mockSource);
      public createScriptProcessor = vi.fn().mockReturnValue(mockProcessor);
      public destination = {};
      public close = vi.fn().mockResolvedValue(undefined);
    }
    (global as any).AudioContext = MockAudioContext;

    let deviceEndedCalled = false;
    const capture = new RealAudioCapture({
      deviceId: 'mic_bluetooth',
      onDeviceEnded: () => {
        deviceEndedCalled = true;
      },
    });

    await capture.start();
    expect(getUserMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({
          deviceId: { exact: 'mic_bluetooth' },
        }),
      })
    );

    // 模拟关闭蓝牙耳机 -> track 触发 ended 事件
    expect(trackEndedCallback).toBeDefined();
    trackEndedCallback!();
    expect(deviceEndedCalled).toBe(true);

    // 平滑切回默认系统麦克风
    await capture.switchDevice('mic_default');
    expect(getUserMediaMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({
          deviceId: { exact: 'mic_default' },
        }),
      })
    );

    // 测试枚举设备
    const devices = await RealAudioCapture.getAvailableMicrophones();
    expect(devices).toHaveLength(2);
    expect(devices[0].label).toBe('内置麦克风');

    await capture.stop();
  });
});
