import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MeetingSummaryModal } from '../MeetingSummaryModal';
import { useMeetingStore } from '../../store/useMeetingStore';
import { HistoryMeeting } from '../../types/meeting';

describe('MeetingSummaryModal - 会议纪要与四维结构化总结报告 (TDD)', () => {
  const mockMeeting: HistoryMeeting = {
    id: 'mtg_test_summary',
    title: 'AI 工具链与双轨音频架构规划 2026-11-01 10:30',
    date: '2026-11-01 10:30',
    durationSeconds: 900,
    summary: '本场会议深入研讨了双轨音频低延迟采集与 AI 网关增量提炼机制。',
    decisionsCount: 1,
    tasksCount: 1,
    structuredSummary: {
      suggestedTitle: 'AI 工具链与双轨音频架构规划',
      overview: '全场深入研讨了双轨音频低延迟采集与 AI 网关增量提炼机制，一致同意采用本地优先。',
      decisions: [
        {
          title: '坚持 Local-First 架构红线',
          content: '会议音视频与逐字稿绝不上云，仅本地 SQLite 持久化。',
          evidenceQuote: '朱工: 本地优先是第一铁律',
        },
      ],
      actions: [
        {
          title: '完成 WASAPI 与 CoreAudio 双轨测试',
          assignee: '朱工',
          dueDate: '2026-11-05',
          evidenceQuote: '下周前完成测试',
        },
      ],
      risks: [
        {
          title: '系统级麦克风权限偶发拦截',
          content: '部分老旧系统可能缺乏后台权限授权弹窗。',
        },
      ],
      facts: [
        {
          title: 'DashScope ASR 识别延迟基准',
          content: '实测首字延迟小于 400ms，吞吐稳定。',
        },
      ],
    },
    transcripts: [
      { id: 'seg_1', speaker: '朱工', channel: 'mic', text: '本地优先是第一铁律', timestamp: '00:01:10' },
      { id: 'seg_2', speaker: '李工', channel: 'mic', text: '同意，下周前完成测试', timestamp: '00:02:20' },
    ],
  };

  beforeEach(() => {
    useMeetingStore.getState().setActiveSummaryMeeting(null);
  });

  it('当 activeSummaryMeeting 为 null 时不渲染弹窗', () => {
    const { container } = render(<MeetingSummaryModal />);
    expect(container.firstChild).toBeNull();
  });

  it('展示切题会议标题、综述以及四维结构化总结（结论/待办/风险/事实）', () => {
    useMeetingStore.getState().setActiveSummaryMeeting(mockMeeting);
    render(<MeetingSummaryModal />);

    // 验证标题与元数据
    expect(screen.getByTestId('meeting-summary-modal-text-title')).toHaveTextContent('AI 工具链与双轨音频架构规划 2026-11-01 10:30');
    expect(screen.getByTestId('meeting-summary-modal-card-overview')).toHaveTextContent('全场深入研讨了双轨音频低延迟采集与 AI 网关增量提炼机制');

    // 验证四维总结板块
    expect(screen.getByTestId('meeting-summary-modal-section-decisions')).toHaveTextContent('坚持 Local-First 架构红线');
    expect(screen.getByTestId('meeting-summary-modal-section-actions')).toHaveTextContent('完成 WASAPI 与 CoreAudio 双轨测试');
    expect(screen.getByTestId('meeting-summary-modal-section-risks')).toHaveTextContent('系统级麦克风权限偶发拦截');
    expect(screen.getByTestId('meeting-summary-modal-section-facts')).toHaveTextContent('DashScope ASR 识别延迟基准');
  });

  it('支持切换至全场原始逐字稿 Tab 回溯查看', () => {
    useMeetingStore.getState().setActiveSummaryMeeting(mockMeeting);
    render(<MeetingSummaryModal />);

    // 点击切换至逐字稿 Tab
    const transcriptsTab = screen.getByTestId('meeting-summary-modal-tab-transcripts');
    fireEvent.click(transcriptsTab);

    // 验证逐字稿段落呈现
    expect(screen.getByTestId('meeting-summary-modal-list-transcripts')).toBeInTheDocument();
    expect(screen.getByText('本地优先是第一铁律')).toBeInTheDocument();
    expect(screen.getByText('同意，下周前完成测试')).toBeInTheDocument();
  });

  it('点击关闭按钮应重置 activeSummaryMeeting 为 null', () => {
    useMeetingStore.getState().setActiveSummaryMeeting(mockMeeting);
    render(<MeetingSummaryModal />);

    const closeBtn = screen.getByTestId('meeting-summary-modal-btn-close');
    fireEvent.click(closeBtn);

    expect(useMeetingStore.getState().activeSummaryMeeting).toBeNull();
  });

  it('导出 Markdown 按钮能够正常触发生成与下载', () => {
    useMeetingStore.getState().setActiveSummaryMeeting(mockMeeting);
    render(<MeetingSummaryModal />);

    const exportBtn = screen.getByTestId('meeting-summary-modal-btn-export-markdown');
    expect(exportBtn).toBeInTheDocument();
    
    // 模拟 Blob 与 URL
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURLMock = vi.fn();
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    fireEvent.click(exportBtn);
    expect(createObjectURLMock).toHaveBeenCalled();
  });

  it('支持切换至思维导图 Tab 并展示全景会议图谱', () => {
    useMeetingStore.getState().setActiveSummaryMeeting(mockMeeting);
    render(<MeetingSummaryModal />);

    const mindmapTab = screen.getByTestId('meeting-summary-modal-tab-mindmap');
    expect(mindmapTab).toBeInTheDocument();

    fireEvent.click(mindmapTab);
    expect(screen.getByTestId('meeting-mindmap-container')).toBeInTheDocument();
    expect(screen.getByTestId('meeting-mindmap-node-root')).toBeInTheDocument();
  });

  it('携带 activeTargetSegmentId 打开时自动定位至逐字稿选项卡并高亮对应段落', () => {
    useMeetingStore.getState().setActiveSummaryMeeting(mockMeeting, 'seg_1');
    render(<MeetingSummaryModal />);

    // 应自动激活逐字稿 Tab
    const transcriptsTab = screen.getByTestId('meeting-summary-modal-tab-transcripts');
    expect(transcriptsTab).toHaveClass('border-brand-blue');

    const highlightedRow = screen.getByTestId('meeting-summary-modal-row-transcript-seg_1');
    expect(highlightedRow).toHaveClass('border-brand-blue');
  });
});
