import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useMeetingStore } from '../../store/useMeetingStore';
import { MeetingPipelineService } from '../meetingPipelineService';
import { RealAudioCapture } from '../realAudioCapture';
import { RealStreamingAsrClient } from '../realStreamingAsrClient';
import { LocalAsrClient } from '../localAsrClient';

// Mock 底层类与原生通道
vi.mock('../realAudioCapture', () => {
  const mockCaptureInstance = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    startSystemAudioCapture: vi.fn().mockResolvedValue(undefined),
    stopSystemAudioCapture: vi.fn().mockResolvedValue(undefined),
    switchDevice: vi.fn().mockResolvedValue(undefined),
    setCaptureMode: vi.fn().mockResolvedValue(undefined),
    isCapturing: vi.fn().mockReturnValue(true),
  };
  const mockRealAudioCapture: any = vi.fn().mockImplementation((options: any) => {
    (mockCaptureInstance as any)._options = options;
    return mockCaptureInstance;
  });
  mockRealAudioCapture.getAvailableMicrophones = vi.fn().mockResolvedValue([
    { deviceId: 'mic-1', label: 'MacBook Pro 麦克风' },
    { deviceId: 'aux-teams-1', label: 'Microsoft Teams Audio Loopback' },
  ]);
  return {
    RealAudioCapture: mockRealAudioCapture,
    CaptureMode: {},
  };
});

vi.mock('../realStreamingAsrClient', () => {
  const mockAsrInstance = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
    sendPcmChunk: vi.fn(),
    finish: vi.fn().mockResolvedValue('complete'),
  };
  return {
    RealStreamingAsrClient: vi.fn().mockImplementation((options: any) => {
      (mockAsrInstance as any)._options = options;
      return mockAsrInstance;
    }),
    streamingAsrUrl: vi.fn().mockReturnValue('ws://127.0.0.1:8765/gateway/v1/streaming-asr'),
  };
});

vi.mock('../localAsrClient', () => {
  const mockLocalAsrInstance = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
    sendPcmChunk: vi.fn(),
    finish: vi.fn().mockResolvedValue('complete'),
  };
  return {
    LocalAsrClient: vi.fn().mockImplementation((options: any) => {
      (mockLocalAsrInstance as any)._options = options;
      return mockLocalAsrInstance;
    }),
  };
});

describe('MeetingPipelineService - 全局常驻会议流与洞察管道服务 (TDD)', () => {
  let service: MeetingPipelineService;

  beforeEach(() => {
    vi.clearAllMocks();
    useMeetingStore.getState().resetMeeting();
    useMeetingStore.getState().resetByokSettings();
    service = new MeetingPipelineService();
  });

  afterEach(async () => {
    await service.destroy();
    useMeetingStore.getState().resetMeeting();
    useMeetingStore.getState().resetByokSettings();
  });

  it('会议状态流转至 RECORDING 时，自动启动麦克风物理采集与 ASR 连接', async () => {
    service.attach();

    useMeetingStore.getState().startMeeting('全局管道测试会');

    await vi.waitFor(() => {
      expect(RealAudioCapture).toHaveBeenCalled();
      expect(RealStreamingAsrClient).toHaveBeenCalled();
      expect(useMeetingStore.getState().micStatus).toBe('recording');
      expect(useMeetingStore.getState().asrStatus).toBe('connected');
    });
  });

  it('当 byokSettings.asrProvider 为 local_endpoint 时，应动态挂载 LocalAsrClient (T03)', async () => {
    useMeetingStore.getState().updateByokSettings({
      asrProvider: 'local_endpoint',
      asrEndpoint: 'http://127.0.0.1:8000/v1/audio/transcriptions',
      localAsrProtocol: 'openai_http',
    });

    service.attach();
    useMeetingStore.getState().startMeeting('本地离线 ASR 会议');

    await vi.waitFor(() => {
      expect(LocalAsrClient).toHaveBeenCalled();
      expect(RealStreamingAsrClient).not.toHaveBeenCalled();
      expect(useMeetingStore.getState().asrStatus).toBe('connected');
    });
  });

  it('关键核心特性：切换页面（路由）或缩至胶囊窗体时，录音与 ASR 连接持续存活，不被销毁', async () => {
    service.attach();
    useMeetingStore.getState().startMeeting('跨页面持续录音测试');

    await vi.waitFor(() => {
      expect(useMeetingStore.getState().micStatus).toBe('recording');
    });

    const mockCaptureInstance = (RealAudioCapture as any).mock.results[0].value;
    const mockAsrInstance = (RealStreamingAsrClient as any).mock.results[0].value;

    // 1. 模拟用户点击侧边栏，切换路由至“任务中心”与“系统设置”
    useMeetingStore.getState().setCurrentRoute('tasks');
    expect(useMeetingStore.getState().currentRoute).toBe('tasks');
    expect(mockCaptureInstance.stop).not.toHaveBeenCalled();
    expect(mockAsrInstance.disconnect).not.toHaveBeenCalled();

    useMeetingStore.getState().setCurrentRoute('settings');
    expect(useMeetingStore.getState().currentRoute).toBe('settings');
    expect(mockCaptureInstance.stop).not.toHaveBeenCalled();
    expect(mockAsrInstance.disconnect).not.toHaveBeenCalled();

    // 2. 模拟用户将窗口缩至微型悬浮药丸（Floating Pill）
    useMeetingStore.getState().setActiveWindow('floating-pill');
    expect(useMeetingStore.getState().activeWindow).toBe('floating-pill');
    expect(mockCaptureInstance.stop).not.toHaveBeenCalled();
    expect(mockAsrInstance.disconnect).not.toHaveBeenCalled();

    // 3. 模拟在胶囊模式下收到 ASR 转写片段
    const asrOptions = (mockAsrInstance as any)._options;
    expect(asrOptions).toBeDefined();

    asrOptions.onTranscriptEvent({
      taskId: 'task-test-01',
      utteranceId: 101,
      revision: 1,
      source: 'mic',
      type: 'FINAL',
      text: '即使缩小为胶囊，听序依然在后台持续稳定记录。',
      beginTimeMs: 1000,
      endTimeMs: 3500,
    });

    // 验证逐字稿成功落稿进入全局 Store
    await vi.waitFor(() => {
      const segs = useMeetingStore.getState().transcripts;
      expect(segs.some((s) => s.text.includes('即使缩小为胶囊'))).toBe(true);
    });

    // 4. 用户展开回工作台，数据完整保留且录音依旧持续
    useMeetingStore.getState().setActiveWindow('workbench');
    useMeetingStore.getState().setCurrentRoute('record');
    expect(mockCaptureInstance.stop).not.toHaveBeenCalled();
    expect(useMeetingStore.getState().transcripts.length).toBeGreaterThan(0);
  });

  it('声学防变小特性：在默认 high_fidelity 模式下，麦克风初始化关闭 echoCancellation 与 autoGainControl', async () => {
    useMeetingStore.getState().setAudioAcousticMode('high_fidelity');
    service.attach();
    useMeetingStore.getState().startMeeting('高保真防闪避声学测试');

    await vi.waitFor(() => {
      expect(RealAudioCapture).toHaveBeenCalled();
    });

    const captureCallArgs = (RealAudioCapture as any).mock.calls[0][0];
    // 默认高保真防系统音频变小模式下，必须传递 false，杜绝触发 macOS CoreAudio VoiceProcessingIO Ducking
    expect(captureCallArgs.echoCancellation).toBe(false);
    expect(captureCallArgs.autoGainControl).toBe(false);
  });

  it('声学外放消回声模式：当切换至 speaker_aec 模式时，按需开启 echoCancellation', async () => {
    useMeetingStore.getState().setAudioAcousticMode('speaker_aec');
    service.attach();
    useMeetingStore.getState().startMeeting('扬声器消回声模式测试');

    await vi.waitFor(() => {
      expect(RealAudioCapture).toHaveBeenCalled();
    });

    const captureCallArgs = (RealAudioCapture as any).mock.calls[0][0];
    expect(captureCallArgs.echoCancellation).toBe(true);
  });

  it('会中实时洞察：正确解析 Gateway 推送的 CREATE_TOPIC SSE 补丁并注入全局 Store', async () => {
    service.attach();
    useMeetingStore.getState().startMeeting('洞察解析测试会');

    const encoder = new TextEncoder();
    const mockSseStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'event: insight_patch\ndata: {"action":"CREATE_TOPIC","topicId":"topic_101","patch":{"title":"端侧实时洞察对齐","type":"decision","status":"RESOLVED","decisions":["确认解决补丁映射断链问题"],"evidenceRefs":[{"segmentId":"seg_1","quote":"本地优先"}]}}\n\n'
          )
        );
        controller.enqueue(encoder.encode('event: done\ndata: {"tokensUsed":120}\n\n'));
        controller.close();
      },
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/gateway/v1/live-insights')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          body: mockSseStream,
        } as any);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as any);
    });

    // 触发 triggerLiveInsight
    await (service as any).triggerLiveInsight(
      {
        segments: [{ id: 'seg_1', text: '本地优先是听序的核心铁律', speaker: '朱工', timestamp: '00:01' }],
        combinedText: '朱工: 本地优先是听序的核心铁律',
        endTimestampSeconds: 15,
      },
      'meeting-101'
    );

    // 验证洞察卡片已落稿到 store
    const insights = useMeetingStore.getState().insights;
    expect(insights).toHaveLength(1);
    expect(insights[0].id).toBe('topic_101');
    expect(insights[0].title).toBe('端侧实时洞察对齐');
    expect(insights[0].content).toContain('确认解决补丁映射断链问题');
  });

  it('会中实时洞察：当 Gateway 返回 503 繁忙或网络失败时，能够将错误信息记录到 insightError', async () => {
    service.attach();
    useMeetingStore.getState().startMeeting('洞察错误提示测试会');

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/gateway/v1/live-insights')) {
        return Promise.resolve({
          ok: false,
          status: 503,
          text: () => Promise.resolve('Service is too busy (DeepSeek 503)'),
        } as any);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as any);
    });

    await (service as any).triggerLiveInsight(
      {
        segments: [{ id: 'seg_1', text: '测试语句', speaker: '朱工', timestamp: '00:01' }],
        combinedText: '朱工: 测试语句',
        endTimestampSeconds: 15,
      },
      'meeting-101'
    );

    expect(useMeetingStore.getState().insightError).toBeTruthy();
    expect(useMeetingStore.getState().insightError).toContain('503');
  });

  it('设备探查：discoverDevices 能枚举麦克风并自动识别 Teams/内录辅助音频通道', async () => {
    const res = await service.discoverDevices();
    expect(res.availableMics).toHaveLength(2);
    expect(res.availableMics[0].deviceId).toBe('mic-1');
    expect(res.autoDetectedAuxId).toBe('aux-teams-1');
  });

  it('设备探查异常降级：当硬件枚举报错时安全返回空数组与 undefined', async () => {
    vi.spyOn(RealAudioCapture, 'getAvailableMicrophones').mockRejectedValueOnce(new Error('Permission denied'));
    const res = await service.discoverDevices();
    expect(res.availableMics).toEqual([]);
    expect(res.autoDetectedAuxId).toBeUndefined();
  });
});
