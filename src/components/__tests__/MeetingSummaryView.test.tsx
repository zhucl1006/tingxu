import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MeetingSummaryView } from '../views/MeetingSummaryView';
import { useMeetingStore } from '../../store/useMeetingStore';
import { HistoryMeeting } from '../../types/meeting';

const mediaRelease = vi.fn();
vi.mock('../../audio/localRecording', async importOriginal => ({ ...await importOriginal<typeof import('../../audio/localRecording')>(), openLocalMedia: vi.fn(async () => ({ url: 'tingxu-media://localhost/synthetic', release: mediaRelease })) }));

describe('MeetingSummaryView - 全屏沉浸式会议总结与思维导图视图 (TDD)', () => {
  const mockMeeting: HistoryMeeting = {
    id: 'mtg_summary_01',
    title: '听序核心架构与隐私合规评审 11-01 11:15',
    date: '2026-11-01 11:18',
    durationSeconds: 245,
    summary: '全场会议围绕本地优先架构与双轨音频捕获展开，确认了核心结论并排期待办。',
    decisionsCount: 2,
    tasksCount: 1,
    speakers: ['本人麦克风', '对方声卡'],
    structuredSummary: {
      suggestedTitle: '听序核心架构与隐私合规评审',
      overview: '全场会议深入探讨了本地优先隐私合规与双轨音频捕获方案，明确了架构基准。',
      decisions: [
        {
          title: '系统架构原则达成一致',
          content: '确认本地优先与隐私合规基准，关键业务逻辑实施 TDD 测试保护。',
          evidenceQuote: '本地逐字稿不上传云端',
          evidenceSegmentId: 'seg_1',
        },
      ],
      actions: [
        {
          title: '跟进全链路门禁联调',
          assignee: '张经理',
          dueDate: '本周五',
          evidenceQuote: '周五前完成联调',
          evidenceSegmentId: 'seg_2',
        },
      ],
      risks: [
        {
          title: '弱网环境连接自愈风险',
          content: '需持续观测 WebSocket 心跳断线重连下的增量补丁一致性。',
        },
      ],
      facts: [
        {
          title: '本地 SQLite 存储已就绪',
          content: '会议音视频与逐字稿均存储于客户端本地沙箱，云端零留存。',
        },
      ],
    },
    transcripts: [
      {
        id: 'seg_1',
        speaker: '本人麦克风',
        channel: 'mic',
        timestamp: '00:15',
        text: '确认本地优先与隐私合规基准，关键业务逻辑实施 TDD 测试保护。',
      },
      {
        id: 'seg_2',
        speaker: '对方声卡',
        channel: 'system',
        timestamp: '01:20',
        text: '我来负责跟进全链路门禁联调，预计本周五交付。',
      },
    ],
  };

  beforeEach(() => {
    useMeetingStore.setState({
      activeSummaryMeeting: mockMeeting,
      activeTargetSegmentId: null,
      currentRoute: 'summary',
    });
  });

  it('应该渲染沉浸式全屏页面（非 Modal 弹窗）及完整的 QA data-testid', () => {
    render(<MeetingSummaryView />);

    expect(screen.getByTestId('summary-page-container')).toBeDefined();
    expect(screen.getByTestId('summary-page-header')).toBeDefined();
    expect(screen.getByTestId('summary-page-text-title').textContent).toContain('听序核心架构与隐私合规评审');
    expect(screen.getByTestId('summary-page-btn-back')).toBeDefined();
    expect(screen.getByTestId('summary-page-btn-copy')).toBeDefined();
    expect(screen.getByTestId('summary-page-btn-export-markdown')).toBeDefined();
  });

  it('应该渲染结构化总结报告四大象限：决策、待办、风险与事实', () => {
    render(<MeetingSummaryView />);

    expect(screen.getByTestId('summary-page-card-overview')).toBeDefined();
    expect(screen.getByTestId('summary-page-section-decisions')).toBeDefined();
    expect(screen.getByTestId('summary-page-section-actions')).toBeDefined();
    expect(screen.getByTestId('summary-page-section-risks')).toBeDefined();
    expect(screen.getByTestId('summary-page-section-facts')).toBeDefined();

    expect(screen.getByText('系统架构原则达成一致')).toBeDefined();
    expect(screen.getByText('跟进全链路门禁联调')).toBeDefined();
    expect(screen.getByText('弱网环境连接自愈风险')).toBeDefined();
    expect(screen.getByText('本地 SQLite 存储已就绪')).toBeDefined();
  });

  it('桌面总结占2/3，录音与逐字稿占1/3，长文本不撑破分栏', () => {
    render(<MeetingSummaryView />);
    expect(screen.getByTestId('summary-page-panel-left')).toHaveClass('md:w-2/3', 'md:flex-none', 'min-w-0');
    expect(screen.getByTestId('summary-page-panel-right')).toHaveClass('md:w-1/3', 'md:flex-none', 'min-w-0');
  });

  it('应该支持点击切换到【听序思维导图】选项卡并展示特色脑图分支', () => {
    render(<MeetingSummaryView />);

    const mindmapTab = screen.getByTestId('summary-page-tab-mindmap');
    fireEvent.click(mindmapTab);

    // 脑图容器必须呈现
    expect(screen.getByTestId('meeting-mindmap-container')).toBeDefined();
    expect(screen.getByTestId('meeting-mindmap-node-root')).toBeDefined();
    expect(screen.getAllByText('听序核心架构与隐私合规评审 11-01 11:15').length).toBeGreaterThanOrEqual(2);

    // 检查听序特色参会人分支
    expect(screen.getByTestId('meeting-mindmap-branch-branch-participants')).toBeDefined();
  });

  it('应该支持点击参会人一键快速重命名，全场联动更新', () => {
    render(<MeetingSummaryView />);

    const speakerTag = screen.getByText('对方声卡');
    fireEvent.click(speakerTag);

    const input = screen.getByTestId('summary-page-input-rename-speaker');
    fireEvent.change(input, { target: { value: '李架构师' } });

    const saveBtn = screen.getByTestId('summary-page-btn-confirm-rename');
    fireEvent.click(saveBtn);

    // 校验 store 中全场逐字稿与参会人已联动改名
    const updated = useMeetingStore.getState().activeSummaryMeeting;
    expect(updated?.speakers).toContain('李架构师');
    expect(updated?.transcripts?.some((t) => t.speaker === '李架构师')).toBe(true);
  });

  it('应该支持切换到全场逐字稿明细选项卡，并高亮指定依据段落', () => {
    render(<MeetingSummaryView />);

    const transcriptsTab = screen.getByTestId('summary-page-tab-transcripts');
    fireEvent.click(transcriptsTab);

    expect(screen.getByTestId('summary-page-list-transcripts')).toBeDefined();
    const targetSegment = screen.getByTestId('summary-page-row-transcript-seg_2');
    expect(targetSegment).toBeDefined();
  });

  it('点击返回工作台按钮时，应清空当前选中并安全切回工作台路由', () => {
    render(<MeetingSummaryView />);

    const backBtn = screen.getByTestId('summary-page-btn-back');
    fireEvent.click(backBtn);

    expect(useMeetingStore.getState().currentRoute).toBe('home');
    expect(useMeetingStore.getState().activeSummaryMeeting).toBeNull();
  });

  it('应该支持讯飞听见同款卡片看板与层级大纲视图切换 (Cards vs Outline)', () => {
    render(<MeetingSummaryView />);

    // 默认展示卡片看板
    expect(screen.getByTestId('summary-page-btn-mode-cards')).toBeInTheDocument();
    expect(screen.getByTestId('summary-page-btn-mode-outline')).toBeInTheDocument();
    expect(screen.getByTestId('summary-page-topic-cards-container')).toBeInTheDocument();

    // 切换至大纲模式
    fireEvent.click(screen.getByTestId('summary-page-btn-mode-outline'));
    expect(screen.getByTestId('summary-page-structured-outline')).toBeInTheDocument();

    // 切回卡片模式
    fireEvent.click(screen.getByTestId('summary-page-btn-mode-cards'));
    expect(screen.getByTestId('summary-page-topic-cards-container')).toBeInTheDocument();
  });

  it('应该支持左右双栏工作台联动：点击时码气泡触发右侧逐字稿高亮与播放器控制器', () => {
    render(<MeetingSummaryView />);

    // 左右双栏容器必须存在
    expect(screen.getByTestId('summary-page-panel-left')).toBeInTheDocument();
    expect(screen.getByTestId('summary-page-panel-right')).toBeInTheDocument();

    // 播放器控制器
    expect(screen.getByTestId('summary-page-audio-player')).toBeInTheDocument();

    // 点击决策卡片中的时间戳小气泡
    const timePill = screen.getByTestId('summary-pill-time-seg_1');
    expect(timePill).toBeInTheDocument();
    fireEvent.click(timePill);

    // 验证右侧逐字稿该行获得高亮状态
    const targetTranscriptRow = screen.getByTestId('summary-page-row-transcript-seg_1');
    expect(targetTranscriptRow).toHaveClass('ring-2');
  });

  it('应该渲染分步行动流时间线（Step 1/2/3）与讯飞同款加粗高亮键名标签', () => {
    render(<MeetingSummaryView />);

    // 分步执行行动流
    expect(screen.getByTestId('summary-page-section-action-steps')).toBeInTheDocument();
    expect(screen.getByText('第一步：跟进全链路门禁联调')).toBeInTheDocument();

    // 键名高亮标签
    expect(screen.getByText('【核心要点】：')).toBeInTheDocument();
  });
  it('证据ID定位15秒，引用数字不作时码，播放高亮不强抢滚动', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const meeting = { ...mockMeeting, recording: { id: 'media', samples: 3200000, sampleRate: 16000 }, transcripts: mockMeeting.transcripts!.map((t, i) => ({ ...t, recordingBeginMs: i ? 80000 : 15000, recordingEndMs: i ? 90000 : 20000 })) };
    useMeetingStore.setState({ activeSummaryMeeting: meeting, currentUser: { userId: 'owner', phone: '', token: 'token' } });
    render(<MeetingSummaryView />);
    const audio = screen.getByTestId('summary-page-audio-player-media') as HTMLAudioElement;
    await waitFor(() => expect(audio).toHaveAttribute('src'));
    Object.defineProperty(audio, 'duration', { configurable: true, value: 100 }); fireEvent.loadedMetadata(audio);
    fireEvent.click(screen.getByTestId('summary-page-transcript-btn-seek-seg_1')); expect(audio.currentTime).toBe(15);
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView'); scroll.mockClear();
    audio.currentTime = 81; fireEvent.timeUpdate(audio);
    expect(screen.getByTestId('summary-page-row-transcript-seg_2')).toHaveClass('bg-brand-blue/10'); expect(scroll).not.toHaveBeenCalled();
  });

});
