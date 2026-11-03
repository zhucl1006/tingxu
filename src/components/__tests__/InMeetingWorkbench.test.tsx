import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { InMeetingWorkbench } from '../InMeetingWorkbench';
import { useMeetingStore } from '../../store/useMeetingStore';
import { RealAudioCapture } from '../../audio/realAudioCapture';
import { LocalSpeakerEmbeddingEngine } from '../../audio/speakerEmbeddingEngine';
import { SentenceAudioBuffer } from '../../audio/sentenceAudioBuffer';

describe('InMeetingWorkbench - 会中双栏工作台组件 (TDD)', () => {
  beforeEach(() => {
    useMeetingStore.getState().resetMeeting();
    useMeetingStore.getState().startMeeting('季度架构对齐会');
    useMeetingStore.getState().addTranscriptSegment({
      id: 'seg-101',
      speaker: '朱工 (我)',
      channel: 'mic',
      timestamp: '00:03:12',
      text: '本地优先（Local-First）是听序的核心铁律，用户逐字稿绝不上云。',
    });
    useMeetingStore.getState().addInsight({
      id: 'ins-101',
      type: 'decision',
      title: 'Local-First 数据隐私红线',
      content: '所有会议逐字稿与录音仅保存在本地 SQLite，杜绝云端留存。',
      timestamp: '00:03:12',
      evidenceSegmentId: 'seg-101',
    });
  });

  it('渲染双栏工作台结构，包含左侧洞察看板 (54%) 与右侧逐字稿 (46%)', () => {
    render(<InMeetingWorkbench />);
    
    // 验证左侧洞察面板
    const insightsPanel = screen.getByTestId('workbench-page-insights-panel-container');
    expect(insightsPanel).toBeInTheDocument();

    // 验证右侧逐字稿面板
    const transcriptPanel = screen.getByTestId('workbench-page-transcript-panel-container');
    expect(transcriptPanel).toBeInTheDocument();
  });

  it('所有交互按钮与输入控件均符合 QA data-testid 命名规范', () => {
    render(<InMeetingWorkbench />);

    expect(screen.getByTestId('workbench-page-header-btn-minimize-to-pill')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-page-header-btn-end-meeting')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-page-insights-panel-input-ask-question')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-page-insights-panel-btn-send-question')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-page-transcript-panel-input-filter')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-page-transcript-panel-text-status')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-page-transcript-panel-badge-channel-source')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-page-transcript-panel-select-mic-device')).toBeInTheDocument();
  });

  it('点击洞察卡片的“查看依据”按钮联动高亮对应逐字稿段落', () => {
    render(<InMeetingWorkbench />);

    const viewEvidenceBtn = screen.getByTestId('workbench-page-insights-panel-btn-view-evidence-ins-101');
    fireEvent.click(viewEvidenceBtn);

    // 检查 store 中的高亮 ID 更新
    expect(useMeetingStore.getState().highlightedTranscriptId).toBe('seg-101');

    // 检查逐字稿段落带有高亮样式或标识
    const segmentRow = screen.getByTestId('workbench-page-transcript-panel-row-segment-seg-101');
    expect(segmentRow.className).toContain('bg-active');
  });

  it('用户确认结论后显示受保护状态；产生事实冲突时渲染待复核修订区块', () => {
    render(<InMeetingWorkbench />);

    // 1. 点击确认结论
    const confirmBtn = screen.getByTestId('workbench-page-insights-panel-btn-confirm-decision-ins-101');
    fireEvent.click(confirmBtn);

    // 确认后应出现“已确认保护”徽章
    expect(screen.getByTestId('workbench-page-insights-panel-badge-confirmed-ins-101')).toBeInTheDocument();

    // 2. 模拟算法产生事实冲突的修订提议
    act(() => {
      useMeetingStore.getState().proposeInsightRevision('ins-101', {
        id: 'rev-201',
        proposedText: '企业专有云版本可开启受控加密同步',
        reason: '后续发言提及企业版功能',
        timestamp: '00:05:30',
        evidenceSegmentId: 'seg-101',
      });
    });

    // 重新获取渲染后的修订待复核区块
    expect(screen.getByTestId('workbench-page-insights-panel-div-pending-revision-ins-101')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-page-insights-panel-btn-keep-current-ins-101')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-page-insights-panel-btn-accept-revision-ins-101')).toBeInTheDocument();

    // 3. 点击“保留当前版本”
    fireEvent.click(screen.getByTestId('workbench-page-insights-panel-btn-keep-current-ins-101'));
    expect(screen.queryByTestId('workbench-page-insights-panel-div-pending-revision-ins-101')).toBeNull();
  });

  it('逐字稿向上滚动脱手检测与“回到最新发言”悬浮按钮交互', () => {
    render(<InMeetingWorkbench />);
    const listContainer = screen.getByTestId('workbench-page-transcript-panel-list-segments');

    // 默认在底部，不应显示“回到最新发言”按钮
    expect(screen.queryByTestId('workbench-page-transcript-panel-btn-scroll-bottom')).toBeNull();

    // 模拟用户向上翻阅逐字稿（scrollTop 远离底部）
    Object.defineProperty(listContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(listContainer, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(listContainer, 'scrollTop', { value: 200, configurable: true });

    fireEvent.scroll(listContainer);

    // 向上滑动后，应该出现“回到最新发言”悬浮按钮
    const scrollBottomBtn = screen.getByTestId('workbench-page-transcript-panel-btn-scroll-bottom');
    expect(scrollBottomBtn).toBeInTheDocument();

    // 点击按钮应平滑滚到底部并隐藏自身
    let scrolledToOptions: any = null;
    listContainer.scrollTo = ((options: any) => {
      scrolledToOptions = options;
    }) as any;

    fireEvent.click(scrollBottomBtn);
    expect(scrolledToOptions).toEqual({ top: 1000, behavior: 'smooth' });
    expect(screen.queryByTestId('workbench-page-transcript-panel-btn-scroll-bottom')).toBeNull();
  });

  it('支持关闭 ASR 错误提示条并保证 QA 元素合规', () => {
    render(<InMeetingWorkbench />);
    // 初始状态下无错误
    expect(screen.queryByTestId('workbench-page-transcript-panel-alert-asr-error')).toBeNull();
  });

  it('滑动窗口切片与 AI 增量洞察提取全链路测试', async () => {
    // 模拟 fetch 拦截 live-insights SSE
    const originalFetch = global.fetch;
    const encoder = new TextEncoder();
    const mockSseStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'event: insight_patch\ndata: {"action":"CREATE_TOPIC","topicId":"topic_auto_001","patch":{"title":"端到端增量洞察与待办对齐","status":"RESOLVED","decisions":["确认麦克风双轨音频无感直连","实现逐字稿平滑吸底与脱手暂停"],"evidenceRefs":[{"segmentId":"seg_live_1","quote":"本地优先是听序的核心铁律"}]}}\n\n'
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
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ code: 0, data: {} }) } as any);
    });

    try {
      render(<InMeetingWorkbench />);

      // 直接调用 store 的 applyInsightPatch 模拟增量补丁落地
      act(() => {
        useMeetingStore.getState().applyInsightPatch({
          op: 'add',
          card: {
            id: 'topic_auto_001',
            type: 'decision',
            title: '端到端增量洞察与待办对齐',
            content: '确认麦克风双轨音频无感直连；实现逐字稿平滑吸底与脱手暂停',
            timestamp: '00:01:20',
            evidenceSegmentId: 'seg_live_1',
          },
        });
      });

      // 验证新增洞察卡片已渲染
      expect(
        screen.getByTestId('workbench-page-insights-panel-card-topic_auto_001')
      ).toBeInTheDocument();
      expect(screen.getByText('端到端增量洞察与待办对齐')).toBeInTheDocument();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('会中即时提问与问答卡片渲染合规：渲染专属问答气泡，支持 Tab 筛选，不渲染确认结论按钮', () => {
    act(() => {
      useMeetingStore.getState().startMeeting('本场问答测试会议');
      useMeetingStore.getState().addInsight({
        id: 'qa_item_1',
        type: 'qa',
        title: '提问：上线排期确定了吗？',
        question: '上线排期确定了吗？',
        content: '根据当前讨论，听序定于本周五下午四点正式上线。',
        timestamp: '00:03:15',
        evidenceSegmentId: 'seg_1',
      });
    });

    render(<InMeetingWorkbench />);

    // 1. 验证问答卡片专属徽章与提问/回答区块
    expect(
      screen.getByTestId('workbench-page-insights-panel-badge-qa-qa_item_1')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('workbench-page-insights-panel-div-qa-question-qa_item_1')
    ).toHaveTextContent('上线排期确定了吗？');
    expect(
      screen.getByTestId('workbench-page-insights-panel-div-qa-answer-qa_item_1')
    ).toHaveTextContent('听序定于本周五下午四点正式上线');

    // 2. 问答卡片绝对不渲染“确认结论”按钮
    expect(
      screen.queryByTestId('workbench-page-insights-panel-btn-confirm-decision-qa_item_1')
    ).toBeNull();

    // 3. 验证本场问答 Tab
    const qaTab = screen.getByTestId('workbench-page-insights-panel-tab-qa');
    expect(qaTab).toBeInTheDocument();
    fireEvent.click(qaTab);
    expect(
      screen.getByTestId('workbench-page-insights-panel-card-qa_item_1')
    ).toBeInTheDocument();
  });

  it('014：本场问答遵循隔离网关配置，不调用固定旧端口', async () => {
    const original = global.fetch;
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { answer: '本地回放' } }) });
    global.fetch = request;
    useMeetingStore.getState().setGatewayUrl('http://127.0.0.1:3214');
    try {
      render(<InMeetingWorkbench />);
      fireEvent.change(screen.getByTestId('workbench-page-insights-panel-input-ask-question'), { target: { value: '测试' } });
      await act(async () => { fireEvent.click(screen.getByTestId('workbench-page-insights-panel-btn-send-question')); });
      expect(request.mock.calls.some(([url]) => url === 'http://127.0.0.1:3214/gateway/v1/meeting-chat')).toBe(true);
    } finally { global.fetch = original; useMeetingStore.getState().setGatewayUrl('http://localhost:3201'); }
  });

  it('支持选择麦克风音频输入设备热切换与 QA 规范合规', async () => {
    vi.spyOn(RealAudioCapture, 'getAvailableMicrophones').mockResolvedValue([
      { deviceId: 'mic-device-bt', label: 'AirPods Pro 蓝牙耳机' },
    ]);

    render(<InMeetingWorkbench />);
    const micSelect = screen.getByTestId('workbench-page-transcript-panel-select-mic-device') as HTMLSelectElement;
    expect(micSelect).toBeInTheDocument();

    // 等待设备列表加载落地
    await act(async () => {
      await Promise.resolve();
    });

    // 切换至蓝牙设备
    act(() => {
      fireEvent.change(micSelect, { target: { value: 'mic-device-bt' } });
    });
    expect(micSelect.value).toBe('mic-device-bt');
  });

  it('支持单麦克风多说话人声纹区分展示、匹配置信度徽章及按 speakerId 精准重命名 (T08)', () => {
    act(() => {
      useMeetingStore.getState().startMeeting('多说话人声纹分离评审会');
      useMeetingStore.getState().addTranscriptSegment({
        id: 'seg_spk_1',
        speaker: '发言人 1',
        speakerId: 'spk_1',
        speakerConfidence: 0.96,
        speakerColorIndex: 0,
        channel: 'mic',
        timestamp: '00:00:10',
        text: '我们先对齐端侧 CAM++ 声纹聚类的延迟预算。',
      });
      useMeetingStore.getState().addTranscriptSegment({
        id: 'seg_spk_2',
        speaker: '发言人 2',
        speakerId: 'spk_2',
        speakerConfidence: 0.91,
        speakerColorIndex: 1,
        channel: 'mic',
        timestamp: '00:00:22',
        text: '同意，单句声纹推理控制在 150ms 以内。',
      });
    });

    render(<InMeetingWorkbench />);

    // 1. 验证逐字稿行展示说话人彩色圆点与声纹匹配置信度徽章
    expect(
      screen.getByTestId('workbench-page-transcript-panel-badge-speaker-dot-seg_spk_1')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('workbench-page-transcript-panel-badge-speaker-confidence-seg_spk_1')
    ).toHaveTextContent('96%');
    expect(
      screen.getByTestId('workbench-page-transcript-panel-badge-speaker-confidence-seg_spk_2')
    ).toHaveTextContent('91%');

    // 2. 验证顶部参会人名单胶囊按钮展示两位说话人，并支持点击直接重命名
    const speakerChip2 = screen.getByTestId('workbench-page-header-btn-speaker-spk_2');
    expect(speakerChip2).toHaveTextContent('发言人 2');

    // 3. 在逐字稿行点击重命名 发言人 2 -> 王架构师
    fireEvent.click(screen.getByTestId('workbench-page-transcript-panel-btn-rename-speaker-seg_spk_2'));
    const renameInput = screen.getByTestId('workbench-page-transcript-panel-input-rename-speaker-seg_spk_2');
    fireEvent.change(renameInput, { target: { value: '王架构师' } });
    fireEvent.click(screen.getByTestId('workbench-page-transcript-panel-btn-save-speaker-seg_spk_2'));

    // 4. 验证 spk_2 已更新为 "王架构师"，而 spk_1 仍保持 "发言人 1"
    expect(
      screen.getByTestId('workbench-page-transcript-panel-text-speaker-seg_spk_2')
    ).toHaveTextContent('王架构师');
    expect(
      screen.getByTestId('workbench-page-transcript-panel-text-speaker-seg_spk_1')
    ).toHaveTextContent('发言人 1');
    expect(
      screen.getByTestId('workbench-page-header-btn-speaker-spk_2')
    ).toHaveTextContent('王架构师');
  });

  it('支持会中跨会议声纹待确认候选交互（确认/不是）与重命名弹窗首次授权记住声纹 (T09, T10)', () => {
    act(() => {
      useMeetingStore.getState().clearSpeakerProfiles();
      useMeetingStore.getState().startMeeting('声纹记忆与跨会议匹配评审');
      useMeetingStore.getState().addTranscriptSegment({
        id: 'seg_tentative_1',
        speaker: '发言人 1',
        speakerId: 'spk_1',
        speakerConfidence: 0.86,
        speakerColorIndex: 0,
        tentativeProfileId: 'vp_zhang_01',
        tentativeProfileName: '张总',
        channel: 'mic',
        timestamp: '00:00:15',
        text: '这段语音命中了本地声纹库中的张总候选。',
      });
    });

    render(<InMeetingWorkbench />);

    // 1. 验证逐字稿行展示“可能是 张总”及“确认 / 不是”操作按钮
    expect(
      screen.getByTestId('workbench-page-transcript-panel-div-tentative-match-seg_tentative_1')
    ).toHaveTextContent('可能是 张总');

    // 点击“确认”应将该说话人正式命名为“张总”并清除待确认提示
    fireEvent.click(
      screen.getByTestId('workbench-page-transcript-panel-btn-confirm-tentative-seg_tentative_1')
    );
    expect(
      screen.getByTestId('workbench-page-transcript-panel-text-speaker-seg_tentative_1')
    ).toHaveTextContent('张总');
    expect(
      screen.queryByTestId('workbench-page-transcript-panel-div-tentative-match-seg_tentative_1')
    ).toBeNull();

    // 2. 点击顶部参会人胶囊打开重命名弹窗，勾选“记住此人的声音（仅存本机）”
    fireEvent.click(screen.getByTestId('workbench-page-header-btn-speaker-spk_1'));
    const nameInput = screen.getByTestId('workbench-page-header-input-rename-speaker');
    fireEvent.change(nameInput, { target: { value: '张总 (CEO)' } });

    const rememberCheckbox = screen.getByTestId('workbench-page-header-checkbox-remember-voice');
    fireEvent.click(rememberCheckbox);
    fireEvent.click(screen.getByTestId('workbench-page-header-btn-confirm-rename-speaker'));

    // 首次保存声纹时必须弹出独立声纹隐私授权确认弹窗 (T09)
    expect(
      screen.getByTestId('workbench-page-modal-voiceprint-consent')
    ).toBeInTheDocument();

    // 点击“同意授权并保存在本机”后，声纹档案正式写入 store
    fireEvent.click(screen.getByTestId('workbench-page-btn-accept-voiceprint-consent'));
    expect(useMeetingStore.getState().speakerProfiles).toHaveLength(1);
    expect(useMeetingStore.getState().speakerProfiles[0].displayName).toBe('张总 (CEO)');
  });

  it('支持拾音模式切换（扬声器外放开会/仅麦克风）、免驱系统内录与收音排查指南交互', async () => {
    render(<InMeetingWorkbench />);

    // 1. 验证默认拾音模式为 speaker_meeting（扬声器外放开会，关闭回声消除）
    const captureModeSelect = screen.getByTestId(
      'workbench-page-transcript-panel-select-capture-mode'
    ) as HTMLSelectElement;
    expect(captureModeSelect).toBeInTheDocument();
    expect(captureModeSelect.value).toBe('speaker_meeting');

    // 切换为仅麦克风
    act(() => {
      fireEvent.change(captureModeSelect, { target: { value: 'mic_only' } });
    });
    expect(captureModeSelect.value).toBe('mic_only');

    // 2. 验证系统内录按钮
    const sysAudioBtn = screen.getByTestId(
      'workbench-page-transcript-panel-btn-toggle-system-audio'
    );
    expect(sysAudioBtn).toHaveTextContent('开启系统内录');

    // 3. 验证排查指南入口与弹窗
    const helpBtn = screen.getByTestId(
      'workbench-page-transcript-panel-btn-audio-troubleshoot'
    );
    expect(helpBtn).toBeInTheDocument();

    // 点击打开排查指南
    act(() => {
      fireEvent.click(helpBtn);
    });

    const helpModal = screen.getByTestId(
      'workbench-page-transcript-panel-modal-audio-help'
    );
    expect(helpModal).toBeInTheDocument();
    expect(helpModal).toHaveTextContent('场景一：使用电脑扬声器开会');
    expect(helpModal).toHaveTextContent('场景二：戴耳机开会');

    // 点击弹窗中的快捷一键切换外放开会按钮
    const switchSpeakerBtn = screen.getByTestId(
      'workbench-page-transcript-panel-btn-help-switch-speaker'
    );
    act(() => {
      fireEvent.click(switchSpeakerBtn);
    });
    expect(captureModeSelect.value).toBe('speaker_meeting');
    // 弹窗自动关闭
    expect(
      screen.queryByTestId('workbench-page-transcript-panel-modal-audio-help')
    ).toBeNull();
  });
});

describe('014 final先显示，身份后补齐', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('声纹未完成也显示final，重复final不重复插入，离开会议后推理不写新会话', async () => {
    useMeetingStore.getState().resetMeeting();
    useMeetingStore.getState().startMeeting('synthetic');
    const socket = { readyState: 1, send: vi.fn(), close: vi.fn(),
      onopen: null as (() => void) | null, onmessage: null as ((event: { data: string }) => void) | null,
      onerror: null as (() => void) | null, onclose: null as (() => void) | null };
    vi.stubGlobal('WebSocket', vi.fn(() => socket));
    vi.spyOn(RealAudioCapture, 'getAvailableMicrophones').mockResolvedValue([]);
    vi.spyOn(RealAudioCapture.prototype, 'start').mockResolvedValue();
    vi.spyOn(RealAudioCapture.prototype, 'stop').mockResolvedValue();
    vi.spyOn(RealAudioCapture.prototype, 'startSystemAudioCapture').mockResolvedValue();
    vi.spyOn(SentenceAudioBuffer.prototype, 'sliceByTimeMs').mockReturnValue(new Float32Array(32000));
    let resolveEmbedding: ((value: number[] | null) => void) | undefined;
    vi.spyOn(LocalSpeakerEmbeddingEngine.prototype, 'embedSamples').mockImplementation(() => new Promise(resolve => { resolveEmbedding = resolve; }));
    const view = render(<InMeetingWorkbench />);
    await act(async () => { socket.onopen?.(); });
    const data = JSON.stringify({ type: 'FINAL', protocolVersion: 2, taskId: 'task', utteranceId: 't0',
      source: 'mic', revision: 1, beginTimeMs: 0, endTimeMs: 2000,
      sentence: { text: '最终文字立即显示', timestamp: '00:00:00', beginTimeMs: 0, endTimeMs: 2000 } });
    await act(async () => { socket.onmessage?.({ data }); });
    expect(screen.getByText('最终文字立即显示')).toBeInTheDocument();
    expect(useMeetingStore.getState().transcripts).toHaveLength(1);
    await act(async () => { socket.onmessage?.({ data }); });
    expect(useMeetingStore.getState().transcripts).toHaveLength(1);
    view.unmount();
    useMeetingStore.getState().resetMeeting();
    useMeetingStore.getState().startMeeting('another');
    await act(async () => { resolveEmbedding?.(new Array<number>(192).fill(0.1)); });
    expect(useMeetingStore.getState().transcripts).toEqual([]);
  });

  it('暂停时连接保持到尾句与FINISHED，确认后停止且保留正文', async () => {
    useMeetingStore.getState().resetMeeting();
    useMeetingStore.getState().startMeeting('synthetic');
    const socket = { readyState: 1, send: vi.fn(), close: vi.fn(), onopen: null as (() => void) | null,
      onmessage: null as ((event: { data: string }) => void) | null };
    vi.stubGlobal('WebSocket', vi.fn(() => socket));
    vi.spyOn(RealAudioCapture, 'getAvailableMicrophones').mockResolvedValue([]);
    vi.spyOn(RealAudioCapture.prototype, 'start').mockResolvedValue();
    vi.spyOn(RealAudioCapture.prototype, 'stop').mockResolvedValue();
    vi.spyOn(RealAudioCapture.prototype, 'startSystemAudioCapture').mockResolvedValue();
    render(<InMeetingWorkbench />);
    await act(async () => { socket.onopen?.(); });
    await act(async () => { fireEvent.click(screen.getByTestId('workbench-page-header-btn-pause-record')); });
    expect(socket.close).not.toHaveBeenCalled();
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'FINISH' }));
    await act(async () => {
      socket.onmessage?.({ data: JSON.stringify({ type: 'FINAL', protocolVersion: 2, taskId: 'task', utteranceId: 't0',
        source: 'mic', revision: 1, beginTimeMs: null, endTimeMs: null,
        sentence: { text: '暂停前的尾句', timestamp: '00:00:00' } }) });
      socket.onmessage?.({ data: JSON.stringify({ type: 'FINISHED', outcome: 'complete' }) });
    });
    expect(screen.getByText('暂停前的尾句')).toBeInTheDocument();
    expect(useMeetingStore.getState().isDrainingAsr).toBe(false);
    expect(socket.close).toHaveBeenCalled();
  });

  it('声纹超时后本会话停止新推理，不累计不可取消的原生任务', async () => {
    vi.useFakeTimers();
    try {
      useMeetingStore.getState().resetMeeting(); useMeetingStore.getState().startMeeting('synthetic');
      const socket = { readyState: 1, send: vi.fn(), close: vi.fn(), onopen: null as (() => void) | null,
        onmessage: null as ((event: { data: string }) => void) | null };
      vi.stubGlobal('WebSocket', vi.fn(() => socket));
      vi.spyOn(RealAudioCapture, 'getAvailableMicrophones').mockResolvedValue([]);
      vi.spyOn(RealAudioCapture.prototype, 'start').mockResolvedValue();
      vi.spyOn(RealAudioCapture.prototype, 'stop').mockResolvedValue();
      vi.spyOn(RealAudioCapture.prototype, 'startSystemAudioCapture').mockResolvedValue();
      vi.spyOn(SentenceAudioBuffer.prototype, 'sliceByTimeMs').mockReturnValue(new Float32Array(32000));
      const embed = vi.spyOn(LocalSpeakerEmbeddingEngine.prototype, 'embedSamples').mockImplementation(() => new Promise(() => {}));
      render(<InMeetingWorkbench />);
      await act(async () => { socket.onopen?.(); });
      await act(async () => {
        for (let i = 0; i < 3; i++) socket.onmessage?.({ data: JSON.stringify({ type: 'FINAL', protocolVersion: 2,
          taskId: 'task', utteranceId: `t${i}`, revision: 1, source: 'mic', beginTimeMs: i * 2000, endTimeMs: (i + 1) * 2000,
          sentence: { text: `第${i}句`, timestamp: '00:00:00' } }) });
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(6100); });
      expect(embed).toHaveBeenCalledTimes(1);
      expect(useMeetingStore.getState().transcripts).toHaveLength(3);
      expect(useMeetingStore.getState().transcripts.every(s => s.speakerStatus === 'unknown')).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('草稿更新合并刷新，final即时替换且取消待刷新的草稿', async () => {
    vi.useFakeTimers();
    try {
      useMeetingStore.getState().resetMeeting(); useMeetingStore.getState().startMeeting('synthetic');
      const socket = { readyState: 1, send: vi.fn(), close: vi.fn(), onopen: null as (() => void) | null,
        onmessage: null as ((event: { data: string }) => void) | null };
      vi.stubGlobal('WebSocket', vi.fn(() => socket));
      vi.spyOn(RealAudioCapture, 'getAvailableMicrophones').mockResolvedValue([]);
      vi.spyOn(RealAudioCapture.prototype, 'start').mockResolvedValue();
      vi.spyOn(RealAudioCapture.prototype, 'stop').mockResolvedValue();
      vi.spyOn(RealAudioCapture.prototype, 'startSystemAudioCapture').mockResolvedValue();
      render(<InMeetingWorkbench />);
      await act(async () => { socket.onopen?.(); });
      const send = (type: 'INTERIM' | 'FINAL', revision: number, text: string) => socket.onmessage?.({ data: JSON.stringify({
        type, protocolVersion: 2, taskId: 'task', utteranceId: 't0', revision, source: 'mic', beginTimeMs: null, endTimeMs: null,
        text, sentence: { text, timestamp: '00:00:00' },
      }) });
      act(() => { send('INTERIM', 1, '初稿'); send('INTERIM', 2, '修订'); });
      expect(screen.getByTestId('workbench-page-transcript-panel-text-interim-content')).toHaveTextContent('初稿');
      act(() => { send('FINAL', 3, '定稿'); });
      expect(screen.getByText('定稿')).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(200); });
      expect(screen.queryByTestId('workbench-page-transcript-panel-div-interim')).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('ASR已确认但设备stop尚未完成时不可恢复，旧stop只能执行一次', async () => {
    useMeetingStore.getState().resetMeeting(); useMeetingStore.getState().startMeeting('synthetic');
    const socket = { readyState: 1, send: vi.fn(), close: vi.fn(), onopen: null as (() => void) | null,
      onmessage: null as ((event: { data: string }) => void) | null };
    vi.stubGlobal('WebSocket', vi.fn(() => socket));
    vi.spyOn(RealAudioCapture, 'getAvailableMicrophones').mockResolvedValue([]);
    vi.spyOn(RealAudioCapture.prototype, 'start').mockResolvedValue();
    vi.spyOn(RealAudioCapture.prototype, 'startSystemAudioCapture').mockResolvedValue();
    let release: (() => void) | undefined;
    const stop = vi.spyOn(RealAudioCapture.prototype, 'stop').mockImplementation(() => new Promise(resolve => { release = resolve; }));
    render(<InMeetingWorkbench />);
    await act(async () => { socket.onopen?.(); });
    await act(async () => {
      fireEvent.click(screen.getByTestId('workbench-page-header-btn-pause-record'));
      socket.onmessage?.({ data: JSON.stringify({ type: 'FINISHED', outcome: 'complete' }) });
    });
    act(() => { useMeetingStore.getState().resumeMeeting(); });
    expect(useMeetingStore.getState().status).toBe('PAUSED');
    await act(async () => { release?.(); });
    expect(stop).toHaveBeenCalledTimes(1);
    act(() => { useMeetingStore.getState().resumeMeeting(); });
    expect(useMeetingStore.getState().status).toBe('RECORDING');
    stop.mockResolvedValue();
  });

  it('手动开启系统内录尚未完成时暂停，须等待该启动后再释放设备', async () => {
    useMeetingStore.getState().resetMeeting(); useMeetingStore.getState().startMeeting('synthetic');
    const socket = { readyState: 1, send: vi.fn(), close: vi.fn(), onopen: null as (() => void) | null,
      onmessage: null as ((event: { data: string }) => void) | null };
    vi.stubGlobal('WebSocket', vi.fn(() => socket));
    vi.spyOn(RealAudioCapture, 'getAvailableMicrophones').mockResolvedValue([]);
    vi.spyOn(RealAudioCapture.prototype, 'start').mockResolvedValue();
    const stop = vi.spyOn(RealAudioCapture.prototype, 'stop').mockResolvedValue();
    vi.spyOn(RealAudioCapture.prototype, 'stopSystemAudioCapture').mockResolvedValue();
    let release: (() => void) | undefined;
    vi.spyOn(RealAudioCapture.prototype, 'startSystemAudioCapture').mockResolvedValueOnce()
      .mockImplementation(() => new Promise(resolve => { release = resolve; }));
    render(<InMeetingWorkbench />);
    await act(async () => { socket.onopen?.(); });
    await act(async () => { fireEvent.click(screen.getByTestId('workbench-page-transcript-panel-btn-toggle-system-audio')); });
    act(() => { fireEvent.click(screen.getByTestId('workbench-page-transcript-panel-btn-toggle-system-audio')); });
    await act(async () => {
      fireEvent.click(screen.getByTestId('workbench-page-header-btn-pause-record'));
      socket.onmessage?.({ data: JSON.stringify({ type: 'FINISHED', outcome: 'complete' }) });
    });
    expect(stop).not.toHaveBeenCalled();
    act(() => { useMeetingStore.getState().resumeMeeting(); });
    expect(useMeetingStore.getState().status).toBe('PAUSED');
    await act(async () => { release?.(); });
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it('慢握手超过50块只落本地，READY后的首块建立采样偏移，毫秒句时码正确取整', async () => {
    useMeetingStore.getState().resetMeeting(); useMeetingStore.getState().startMeeting('015 clock');
    const socket = { readyState: 1, send: vi.fn(), close: vi.fn(), onopen: null as (() => void) | null,
      onmessage: null as ((event: { data: string }) => void) | null };
    vi.stubGlobal('WebSocket', vi.fn(() => socket));
    vi.spyOn(RealAudioCapture, 'getAvailableMicrophones').mockResolvedValue([]);
    let push!: (chunk: ArrayBuffer) => void;
    vi.spyOn(RealAudioCapture.prototype, 'start').mockImplementation(function(this: RealAudioCapture) {
      push = (this as unknown as { options: { onAudioChunk: (c: ArrayBuffer) => void } }).options.onAudioChunk;
      return Promise.resolve();
    });
    vi.spyOn(RealAudioCapture.prototype, 'stop').mockResolvedValue();
    vi.spyOn(RealAudioCapture.prototype, 'startSystemAudioCapture').mockResolvedValue();
    render(<InMeetingWorkbench />); await act(async () => { socket.onopen?.(); });
    act(() => { for (let i = 0; i < 60; i++) push(new ArrayBuffer(3200)); });
    expect(socket.send).not.toHaveBeenCalled();
    act(() => { socket.onmessage?.({ data: JSON.stringify({ type: 'STATUS', status: 'READY' }) }); push(new ArrayBuffer(3200)); });
    expect(socket.send).toHaveBeenCalledTimes(1);
    await act(async () => { socket.onmessage?.({ data: JSON.stringify({ type: 'FINAL', protocolVersion: 2, taskId: 'task', utteranceId: 'u', revision: 1, source: 'mic', beginTimeMs: 234, endTimeMs: 834, sentence: { text: '采样时钟', timestamp: '00:00:00' } }) }); });
    const segment = useMeetingStore.getState().transcripts[0];
    expect(segment.recordingBeginMs).toBe(6234); expect(segment.timestamp).toBe('00:06');
  });

});
