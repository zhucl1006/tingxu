import { describe, it, expect, beforeEach } from 'vitest';
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
});
