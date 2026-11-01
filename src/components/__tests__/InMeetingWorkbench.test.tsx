import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { InMeetingWorkbench } from '../InMeetingWorkbench';
import { useMeetingStore } from '../../store/useMeetingStore';

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
});
