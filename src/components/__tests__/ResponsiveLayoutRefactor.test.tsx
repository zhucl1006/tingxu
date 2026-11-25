import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../Sidebar';
import { AppLayout } from '../AppLayout';
import { MeetingSummaryView } from '../views/MeetingSummaryView';
import { InMeetingWorkbench } from '../InMeetingWorkbench';
import { MeetingAudioPlayer } from '../MeetingAudioPlayer';
import { useMeetingStore } from '../../store/useMeetingStore';
import { HistoryMeeting } from '../../types/meeting';

vi.mock('../../audio/localRecording', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../audio/localRecording')>()),
  openLocalMedia: vi.fn(async () => ({
    url: 'tingxu-media://localhost/layout-test',
    release: vi.fn(),
  })),
}));

const sampleMeeting: HistoryMeeting = {
  id: 'mtg_layout_01',
  title: '钉钉实时会议布局优化评审',
  date: '2026-11-25 18:00',
  durationSeconds: 620,
  summary: '讨论桌面端小窗及大字号场景下的双栏布局重构。',
  decisionsCount: 1,
  tasksCount: 1,
  speakers: ['本人麦克风', '远端同事'],
  structuredSummary: {
    suggestedTitle: '钉钉实时会议布局优化评审',
    overview: '采用方案 A：可折叠侧边栏 + 缩放解耦 + 紧凑自适应工具栏。',
    decisions: [{ title: '锁定侧边栏物理宽度为 220px', content: '折叠态 60px，不随字号膨胀' }],
    actions: [{ title: '重构会中与会后顶栏', assignee: '前端组', dueDate: '本周' }],
    risks: [],
    facts: [],
  },
  transcripts: [
    {
      id: 'seg_l1',
      speaker: '本人麦克风',
      channel: 'mic',
      timestamp: '00:12',
      text: '大字号下侧边栏不能撑爆主视口。',
    },
  ],
};

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}

describe('Issue #3 方案 A：响应式布局重整与缩放解耦 (TDD)', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    vi.restoreAllMocks();
    setViewportWidth(1280);
    useMeetingStore.getState().resetMeeting();
    useMeetingStore.getState().resetAppearanceSettings();
    useMeetingStore.setState({
      currentRoute: 'home',
      activeSummaryMeeting: sampleMeeting,
      historyMeetings: [sampleMeeting],
    });
  });

  afterEach(() => {
    setViewportWidth(originalInnerWidth);
  });

  describe('1. 侧边栏物理宽度锁定与可折叠能力', () => {
    it('侧边栏应使用不随 rem 膨胀的固定 220px 宽度，并支持点击折叠为 60px 图标栏', () => {
      render(<Sidebar />);

      const aside = screen.getByTestId('app-sidebar-container');
      expect(aside).toHaveClass('w-[220px]');
      expect(aside).not.toHaveClass('w-64');
      expect(aside).toHaveAttribute('data-collapsed', 'false');

      const toggleBtn = screen.getByTestId('app-sidebar-btn-toggle-collapse');
      expect(toggleBtn).toBeInTheDocument();

      fireEvent.click(toggleBtn);
      expect(aside).toHaveClass('w-[60px]');
      expect(aside).toHaveAttribute('data-collapsed', 'true');

      // 折叠态下所有导航按钮依然保留并可点击
      expect(screen.getByTestId('app-sidebar-btn-nav-home')).toBeInTheDocument();
      expect(screen.getByTestId('app-sidebar-btn-nav-record')).toBeInTheDocument();
      expect(screen.getByTestId('app-sidebar-btn-nav-settings')).toBeInTheDocument();

      // 再次点击恢复展开
      fireEvent.click(toggleBtn);
      expect(aside).toHaveClass('w-[220px]');
      expect(aside).toHaveAttribute('data-collapsed', 'false');
    });

    it('窗口宽度小于 1120px 且进入双栏工作台(record/summary)时应自动折叠侧边栏以释放横向空间', () => {
      setViewportWidth(1000);
      useMeetingStore.setState({ currentRoute: 'record' });

      render(<AppLayout />);

      const aside = screen.getByTestId('app-sidebar-container');
      expect(aside).toHaveAttribute('data-collapsed', 'true');
      expect(aside).toHaveClass('w-[60px]');

      // 用户手动点击展开后可覆盖自动折叠
      fireEvent.click(screen.getByTestId('app-sidebar-btn-toggle-collapse'));
      expect(aside).toHaveAttribute('data-collapsed', 'false');
      expect(aside).toHaveClass('w-[220px]');
    });

    it('主视口与子视图应使用弹性高度(min-h-0)避免与顶部拖拽条叠加产生 h-screen 底部溢出', () => {
      useMeetingStore.setState({ currentRoute: 'summary' });
      render(<AppLayout />);

      expect(screen.getByTestId('app-layout-main-viewport')).toHaveClass('min-w-0');
      const summaryContainer = screen.getByTestId('summary-page-container');
      expect(summaryContainer).toHaveClass('min-h-0');
      expect(summaryContainer).not.toHaveClass('h-screen');
    });
  });

  describe('2. 会后总结页与播放器防重叠/防折行重构', () => {
    it('顶栏应采用自适应防溢出布局而非死高度 h-12，并支持一键收起/展开右栏', () => {
      render(<MeetingSummaryView />);

      const topBar = screen.getByTestId('summary-page-header-topbar');
      expect(topBar).toHaveClass('flex-wrap');
      expect(topBar).not.toHaveClass('h-12');

      // 右栏默认展开，且在桌面宽屏保留最小宽度防挤压，窄窗贴合 1/3 不越界裁切
      const rightPanel = screen.getByTestId('summary-page-panel-right');
      expect(rightPanel).toHaveClass('lg:min-w-[300px]');

      // 点击切换按钮收起右栏
      const toggleRightBtn = screen.getByTestId('summary-page-btn-toggle-right-panel');
      fireEvent.click(toggleRightBtn);
      expect(screen.queryByTestId('summary-page-panel-right')).not.toBeInTheDocument();

      // 收起状态下点击顶栏「会后 Copilot 助手」应自动重新展开右栏并切到 Copilot
      fireEvent.click(screen.getByTestId('summary-page-btn-call-copilot'));
      expect(screen.getByTestId('summary-page-panel-right')).toBeInTheDocument();
      expect(screen.getByTestId('summary-page-copilot-container')).toBeInTheDocument();
    });

    it('音频播放器倍速按钮组应包裹在同一不可拆分的分组容器中防止 2x 孤立掉行', () => {
      render(<MeetingAudioPlayer meetingId="m1" onTime={() => {}} />);

      const rateGroup = screen.getByTestId('summary-page-audio-player-group-rates');
      expect(rateGroup).toHaveClass('shrink-0');
      expect(rateGroup).toContainElement(screen.getByTestId('summary-page-audio-player-btn-rate-1'));
      expect(rateGroup).toContainElement(screen.getByTestId('summary-page-audio-player-btn-rate-2'));
    });
  });

  describe('3. 会中实时工作台顶栏减负、右栏零裁切与双行提问输入区', () => {
    it('顶栏应支持 flex-wrap、展示紧凑字号胶囊并确保参会人列表在窄宽下不被 hidden 隐藏', () => {
      useMeetingStore.setState({
        transcripts: [
          {
            id: 't1',
            speaker: '张总',
            speakerId: 'spk_1',
            channel: 'mic',
            timestamp: '00:05',
            text: '开始评审',
          },
        ],
      });

      render(<InMeetingWorkbench />);

      const header = screen.getByTestId('workbench-page-header-container');
      expect(header).toHaveClass('flex-wrap');

      const fontBadge = screen.getByTestId('workbench-page-header-badge-font-size');
      expect(fontBadge.textContent?.trim()).toBe('14px');

      const speakersBadge = screen.getByTestId('workbench-page-header-badge-speakers');
      expect(speakersBadge).not.toHaveClass('hidden');
    });

    it('左栏底部提问区应为双行紧凑布局，右栏工具条应自然换行而非 overflow-x-auto 静默裁切', () => {
      render(<InMeetingWorkbench />);

      const askForm = screen.getByTestId('workbench-page-insights-panel-form-ask');
      expect(askForm).toHaveClass('flex-col');

      const audioToolbar = screen.getByTestId('workbench-page-transcript-panel-toolbar-audio');
      expect(audioToolbar).toHaveClass('flex-wrap');
      expect(audioToolbar).not.toHaveClass('overflow-x-auto');
    });
  });
});
