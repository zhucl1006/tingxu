import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RealAudioCapture,
  floatTo16BitPCM,
  downsampleTo16kHz,
  DualTrackAudioMixer,
} from '../realAudioCapture';

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

  it('014：stop必须等待原生停止确认，重复停止共用同一原生请求', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    let release: (() => void) | undefined;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const invoke = vi.fn((command: string) => command === 'stop_system_audio_capture' ? pending : Promise.resolve());
    vi.doMock('@tauri-apps/api/core', () => ({ invoke }));
    vi.doMock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(vi.fn()) }));
    try {
      const capture = new RealAudioCapture();
      await capture.startSystemAudioCapture();
      let done = false;
      const stopping = capture.stop().then(() => { done = true; });
      const again = capture.stopSystemAudioCapture();
      await Promise.resolve(); await Promise.resolve();
      expect(done).toBe(false);
      expect(invoke.mock.calls.filter(args => args[0] === 'stop_system_audio_capture')).toHaveLength(1);
      release?.(); await Promise.all([stopping, again]);
      expect(done).toBe(true);
    } finally {
      release?.();
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    }
  });

  it('014：AudioContext恢复永不完成时有界失败并释放麦克风', async () => {
    vi.useFakeTimers();
    const track = { stop: vi.fn() };
    const auxTrack = { stop: vi.fn() };
    const close = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: vi.fn().mockResolvedValueOnce({ getTracks: () => [track], getAudioTracks: () => [track] })
        .mockResolvedValueOnce({ getTracks: () => [auxTrack], getAudioTracks: () => [auxTrack] }),
    } });
    class SuspendedContext {
      state = 'suspended'; sampleRate = 16000; destination = {};
      resume = () => new Promise<void>(() => {});
      close = close;
      createMediaStreamSource = () => ({ connect: vi.fn(), disconnect: vi.fn() });
      createScriptProcessor = () => ({ connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null });
    }
    vi.stubGlobal('AudioContext', SuspendedContext);
    try {
      const capture = new RealAudioCapture({ auxDeviceId: 'teams-test-device' });
      const result = capture.start().then(() => 'unexpected-success', () => 'bounded-failure');
      await vi.advanceTimersByTimeAsync(3100);
      expect(await Promise.race([result, Promise.resolve('still-pending')])).toBe('bounded-failure');
      expect(track.stop).toHaveBeenCalled();
      expect(auxTrack.stop).toHaveBeenCalled();
      expect(close).toHaveBeenCalled();
      expect(capture.isCapturing()).toBe(false);
    } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
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

  it('拾音模式为 speaker_meeting（扬声器外放开会）时应关闭回声消除，确保 Teams/远程他人声音不被过滤', async () => {
    const mockTrack = { stop: vi.fn() };
    const mockStream = {
      getTracks: () => [mockTrack],
      getAudioTracks: () => [mockTrack],
    };
    const getUserMediaMock = vi.fn().mockResolvedValue(mockStream);
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getUserMedia: getUserMediaMock },
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

    // 1. 创建外放开会模式采集器
    const capture = new RealAudioCapture({
      captureMode: 'speaker_meeting',
    });

    await capture.start();
    // 关键断言：echoCancellation 必须为 false，避免扬声器声音被当作回声消除
    expect(getUserMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({
          echoCancellation: false,
          noiseSuppression: false,
        }),
      })
    );
    expect(capture.getCaptureMode()).toBe('speaker_meeting');

    // 2. 动态切换为仅个人麦克风模式（开启回声消除）
    await capture.setCaptureMode('mic_only');
    expect(getUserMediaMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({
          echoCancellation: true,
          noiseSuppression: true,
        }),
      })
    );
    expect(capture.getCaptureMode()).toBe('mic_only');

    await capture.stop();
  });

  it('支持调用 getDisplayMedia 捕获系统扬声器数字内录并与麦克风本地混音', async () => {
    const mockMicTrack = { stop: vi.fn() };
    const mockMicStream = {
      getTracks: () => [mockMicTrack],
      getAudioTracks: () => [mockMicTrack],
    };
    const getUserMediaMock = vi.fn().mockResolvedValue(mockMicStream);

    const mockSysAudioTrack = { stop: vi.fn(), onended: null as any };
    const mockSysVideoTrack = { stop: vi.fn() };
    const mockDisplayStream = {
      active: true,
      getTracks: () => [mockSysAudioTrack, mockSysVideoTrack],
      getAudioTracks: () => [mockSysAudioTrack],
      getVideoTracks: () => [mockSysVideoTrack],
    };
    const getDisplayMediaMock = vi.fn().mockResolvedValue(mockDisplayStream);

    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: getUserMediaMock,
        getDisplayMedia: getDisplayMediaMock,
      },
      configurable: true,
      writable: true,
    });

    const mockMicSource = { connect: vi.fn(), disconnect: vi.fn() };
    const mockSysSource = { connect: vi.fn(), disconnect: vi.fn() };
    const mockProcessor = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null };
    class MockAudioContext {
      public sampleRate = 16000;
      public createMediaStreamSource = vi.fn().mockImplementation((stream) => {
        if (stream === mockDisplayStream) return mockSysSource;
        return mockMicSource;
      });
      public createScriptProcessor = vi.fn().mockReturnValue(mockProcessor);
      public destination = {};
      public close = vi.fn().mockResolvedValue(undefined);
    }
    (global as any).AudioContext = MockAudioContext;

    let systemActiveState = false;
    const capture = new RealAudioCapture({
      onSystemAudioStateChange: (active) => {
        systemActiveState = active;
      },
    });

    await capture.start();
    expect(capture.isCapturing()).toBe(true);

    // 开启系统音频内录
    await capture.startSystemAudioCapture();
    expect(getDisplayMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: true,
      })
    );
    expect(capture.isSystemAudioCapturing()).toBe(true);
    expect(systemActiveState).toBe(true);
    // 验证 video track 是否被释放
    expect(mockSysVideoTrack.stop).toHaveBeenCalled();
    // 验证两个音源是否均接入了同一个 processor 进行混音
    expect(mockMicSource.connect).toHaveBeenCalledWith(mockProcessor);
    expect(mockSysSource.connect).toHaveBeenCalledWith(mockProcessor);

    // 停止系统内录
    capture.stopSystemAudioCapture();
    expect(capture.isSystemAudioCapturing()).toBe(false);
    expect(systemActiveState).toBe(false);

    await capture.stop();
  });

  it('支持指定 auxDeviceId 辅助音频通道（如 Teams/虚拟声卡），实现主麦克风与辅助通道双路本地混音', async () => {
    const mockMicTrack = { stop: vi.fn() };
    const mockMicStream = {
      getTracks: () => [mockMicTrack],
      getAudioTracks: () => [mockMicTrack],
    };
    const mockAuxTrack = { stop: vi.fn() };
    const mockAuxStream = {
      active: true,
      getTracks: () => [mockAuxTrack],
      getAudioTracks: () => [mockAuxTrack],
    };

    const getUserMediaMock = vi.fn().mockImplementation((constraints) => {
      if (constraints?.audio?.deviceId?.exact === 'device-teams-audio') {
        return Promise.resolve(mockAuxStream);
      }
      return Promise.resolve(mockMicStream);
    });

    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: getUserMediaMock,
      },
      configurable: true,
      writable: true,
    });

    const mockMicSource = { connect: vi.fn(), disconnect: vi.fn() };
    const mockAuxSource = { connect: vi.fn(), disconnect: vi.fn() };
    const mockProcessor = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null };
    class MockAudioContext {
      public sampleRate = 16000;
      public createMediaStreamSource = vi.fn().mockImplementation((stream) => {
        if (stream === mockAuxStream) return mockAuxSource;
        return mockMicSource;
      });
      public createScriptProcessor = vi.fn().mockReturnValue(mockProcessor);
      public destination = {};
      public close = vi.fn().mockResolvedValue(undefined);
    }
    (global as any).AudioContext = MockAudioContext;

    const capture = new RealAudioCapture({
      deviceId: 'device-airpods',
      auxDeviceId: 'device-teams-audio',
    });

    await capture.start();

    // 验证两次 getUserMedia 调用：一次为主麦克风，一次为 Teams 辅助内录通道
    expect(getUserMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({
          deviceId: { exact: 'device-airpods' },
        }),
      })
    );
    expect(getUserMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({
          deviceId: { exact: 'device-teams-audio' },
          echoCancellation: false,
        }),
      })
    );

    // 验证两路音频源均连接至同一个 processor 进行混音
    expect(mockMicSource.connect).toHaveBeenCalledWith(mockProcessor);
    expect(mockAuxSource.connect).toHaveBeenCalledWith(mockProcessor);
    expect(capture.isAuxAudioCapturing()).toBe(true);

    // 动态移除辅助通道
    await capture.switchAuxDevice(undefined);
    expect(capture.isAuxAudioCapturing()).toBe(false);
    expect(mockAuxTrack.stop).toHaveBeenCalled();

    await capture.stop();
  });

  it('在 Tauri 桌面环境下，调用 startSystemAudioCapture 应通过原生 invoke 和 listen 捕获系统音频 (TDD)', async () => {
    (window as any).__TAURI_INTERNALS__ = {};

    const mockInvoke = vi.fn().mockResolvedValue(undefined);
    let eventCallback: ((event: { payload: string }) => void) | null = null;
    const mockUnlisten = vi.fn();
    const mockListen = vi.fn().mockImplementation((event: string, cb: any) => {
      if (event === 'tingxu://system-audio-chunk') {
        eventCallback = cb;
      }
      return Promise.resolve(mockUnlisten);
    });

    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: mockInvoke,
    }));
    vi.doMock('@tauri-apps/api/event', () => ({
      listen: mockListen,
    }));

    let receivedChunkLength = 0;
    let receivedRms = 0;
    let systemAudioActive = false;

    const capture = new RealAudioCapture({
      onAudioChunk: (chunk) => {
        receivedChunkLength = chunk.byteLength;
      },
      onRmsLevel: (rms) => {
        receivedRms = rms;
      },
      onSystemAudioStateChange: (active) => {
        systemAudioActive = active;
      },
    });

    await capture.startSystemAudioCapture();

    expect(mockListen).toHaveBeenCalledWith('tingxu://system-audio-chunk', expect.any(Function));
    expect(mockInvoke).toHaveBeenCalledWith('start_system_audio_capture');
    expect(capture.isSystemAudioCapturing()).toBe(true);
    expect(systemAudioActive).toBe(true);

    // 模拟从 Rust 原生端推来的 PCM 数据（base64 编码的 16 位 PCM）
    const testPcmInt16 = new Int16Array([1000, 2000, -1500, 3000]);
    const uint8Bytes = new Uint8Array(testPcmInt16.buffer);
    let binaryStr = '';
    for (let i = 0; i < uint8Bytes.length; i++) {
      binaryStr += String.fromCharCode(uint8Bytes[i]);
    }
    const base64Data = btoa(binaryStr);

    expect(eventCallback).toBeDefined();
    eventCallback!({ payload: base64Data });

    expect(receivedChunkLength).toBe(testPcmInt16.byteLength);
    expect(receivedRms).toBeGreaterThan(0);

    // 停止系统内录
    capture.stopSystemAudioCapture();
    expect(mockInvoke).toHaveBeenCalledWith('stop_system_audio_capture');
    expect(mockUnlisten).toHaveBeenCalled();
    expect(capture.isSystemAudioCapturing()).toBe(false);
    expect(systemAudioActive).toBe(false);

    delete (window as any).__TAURI_INTERNALS__;
  });

  it('downsampleTo16kHz 应能将 48kHz/44.1kHz 音频抗混叠重采样至 16kHz (TDD)', () => {
    // 1. 16kHz 原样直接返回
    const sameRateBuffer = new Float32Array([0.1, 0.2, 0.3]);
    expect(downsampleTo16kHz(sameRateBuffer, 16000)).toBe(sameRateBuffer);

    // 2. 48kHz 下采样到 16kHz (3:1 降采样)
    const const48k = new Float32Array(300).fill(0.75);
    const resampledConst = downsampleTo16kHz(const48k, 48000);
    expect(resampledConst.length).toBe(100);
    expect(resampledConst[0]).toBeCloseTo(0.75, 4);
    expect(resampledConst[50]).toBeCloseTo(0.75, 4);

    // 3. 44.1kHz 下采样到 16kHz (441 样点降为 160 样点)
    const input44k = new Float32Array(441).fill(0.5);
    const resampled44k = downsampleTo16kHz(input44k, 44100);
    expect(resampled44k.length).toBe(160);
    expect(resampled44k[0]).toBeCloseTo(0.5, 2);
  });

  it('真实录制时应建立增益为 0 的 GainNode 静音隔离层，并在 onaudioprocess 清空所有声道，杜绝向耳机硬件泄露杂音 (TDD)', async () => {
    const mockTrack = { stop: vi.fn() };
    const mockStream = {
      getTracks: () => [mockTrack],
      getAudioTracks: () => [mockTrack],
    };
    const getUserMediaMock = vi.fn().mockResolvedValue(mockStream);
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getUserMedia: getUserMediaMock },
      configurable: true,
      writable: true,
    });

    const mockSource = { connect: vi.fn(), disconnect: vi.fn() };
    const mockProcessor = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null as any };
    const mockGainNode = {
      gain: { setValueAtTime: vi.fn(), value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    class MockAudioContextWithGain {
      public state = 'suspended';
      public resume = vi.fn().mockImplementation(async () => { this.state = 'running'; });
      public sampleRate = 48000;
      public currentTime = 0;
      public createMediaStreamSource = vi.fn().mockReturnValue(mockSource);
      public createScriptProcessor = vi.fn().mockReturnValue(mockProcessor);
      public createGain = vi.fn().mockReturnValue(mockGainNode);
      public destination = {};
      public close = vi.fn().mockResolvedValue(undefined);
    }
    (global as any).AudioContext = MockAudioContextWithGain;

    const capture = new RealAudioCapture();
    await capture.start();

    // 验证核心防杂音防护：
    // 1. 必须创建 Gain 节点并将增益设置为 0
    expect(capture.isCapturing()).toBe(true);
    expect(capture['audioContext']?.state).toBe('running');
    expect(mockGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);

    // 2. 节点链路必须经过 GainNode 阻断，杜绝直连 destination 泄漏
    expect(mockProcessor.connect).toHaveBeenCalledWith(mockGainNode);
    expect(mockGainNode.connect).toHaveBeenCalled();

    // 3. 模拟双声道 (立体声耳机) onaudioprocess，验证所有通道均被填 0
    const leftFill = vi.fn();
    const rightFill = vi.fn();
    const mockAudioEvent = {
      inputBuffer: {
        getChannelData: () => new Float32Array([0.1, 0.2, 0.3]),
      },
      outputBuffer: {
        numberOfChannels: 2,
        getChannelData: (ch: number) => ({
          fill: ch === 0 ? leftFill : rightFill,
        }),
      },
    };

    mockProcessor.onaudioprocess(mockAudioEvent);
    expect(leftFill).toHaveBeenCalledWith(0);
    expect(rightFill).toHaveBeenCalledWith(0);

    await capture.stop();
    expect(mockGainNode.disconnect).toHaveBeenCalled();
  });

  it('DualTrackAudioMixer 应能将麦克风与系统远端音频在统一时钟下对齐混音，防止采样率翻倍与时序交织 (TDD)', () => {
    const mixer = new DualTrackAudioMixer();

    // 1. 未激活系统音频时，透传麦克风
    const micData = new Int16Array([100, 200, 300]);
    const res1 = mixer.mixWithMic(micData.buffer);
    expect(new Int16Array(res1)[0]).toBe(100);

    // 2. 激活系统音频并推入远端数据
    mixer.setSystemActive(true);
    const sysData = new Int16Array([50, -50, 32700]);
    mixer.pushSysChunk(sysData.buffer);

    // 混音：100+50=150, 200+(-50)=150, 300+32700=33000(截断到32767)
    const res2 = mixer.mixWithMic(micData.buffer);
    const view2 = new Int16Array(res2);
    expect(view2[0]).toBe(150);
    expect(view2[1]).toBe(150);
    expect(view2[2]).toBe(32767); // 溢出软保护
  });

  describe('Plan 019: 真实声学场景外放扬声器回声消除 (AEC) 与杂音抑制优化', () => {
    it('应支持显式开启声学回声消除与降噪配置，并在 getUserMedia 约束中精准下发', async () => {
      const mockTrack = { stop: vi.fn() };
      const getUserMediaMock = vi.fn().mockResolvedValue({
        getTracks: () => [mockTrack],
        getAudioTracks: () => [mockTrack],
      });
      Object.defineProperty(global.navigator, 'mediaDevices', {
        value: { getUserMedia: getUserMediaMock },
        configurable: true,
        writable: true,
      });

      const mockFilter = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        frequency: { value: 0 },
        type: 'highpass',
      };
      class MockAudioContext {
        public state = 'running';
        public sampleRate = 48000;
        public destination = {};
        public createMediaStreamSource = vi.fn().mockReturnValue({ connect: vi.fn(), disconnect: vi.fn() });
        public createBiquadFilter = vi.fn().mockReturnValue(mockFilter);
        public createGain = vi.fn().mockReturnValue({
          connect: vi.fn(),
          disconnect: vi.fn(),
          gain: { value: 0, setValueAtTime: vi.fn() },
        });
        public createScriptProcessor = vi.fn().mockReturnValue({ connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null });
        public resume = vi.fn().mockResolvedValue(undefined);
        public close = vi.fn().mockResolvedValue(undefined);
      }
      (global as any).AudioContext = MockAudioContext;

      // 显式配置 AEC, NS, AGC
      const capture = new RealAudioCapture({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });

      await capture.start();

      expect(getUserMediaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: expect.objectContaining({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }),
        })
      );

      // 验证是否创建了 80Hz 高通滤波消除桌面与风扇低频机械杂音
      const ctxInstance = (capture as any).audioContext;
      expect(ctxInstance.createBiquadFilter).toHaveBeenCalled();
      expect(mockFilter.type).toBe('highpass');
      expect(mockFilter.frequency.value).toBe(80);

      await capture.stop();
    });

    it('floatTo16BitPCM 在超大爆音信号下平滑软饱和，防止硬截断产生的金属谐波刺耳杂音', () => {
      // 输入包含超出 [-1.0, 1.0] 动态范围的爆破音，例如 1.5, -1.8
      const input = new Float32Array([0.0, 0.5, 1.0, 1.5, -1.8]);
      const pcmBuffer = floatTo16BitPCM(input);
      const view = new Int16Array(pcmBuffer);

      // 0 与 0.5 在线性范围内
      expect(view[0]).toBe(0);
      expect(Math.abs(view[1] - 16383)).toBeLessThan(500);

      // 1.5 爆破音软饱和后应接近但绝对不超过 32767
      expect(view[3]).toBeLessThanOrEqual(32767);
      expect(view[3]).toBeGreaterThan(30000);

      // -1.8 爆破音软饱和后应接近但绝对不低于 -32768
      expect(view[4]).toBeGreaterThanOrEqual(-32768);
      expect(view[4]).toBeLessThan(-30000);
    });
  });
});
