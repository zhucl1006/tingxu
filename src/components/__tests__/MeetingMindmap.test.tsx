import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MeetingMindmap } from '../MeetingMindmap';
import { HistoryMeeting } from '../../types/meeting';

describe('MeetingMindmap - 会议思维导图组件 (TDD)', () => {
  const mockMeeting: HistoryMeeting = {
    id: 'mtg_mindmap_test',
    title: '季末业务复盘与 AI 工具链规划',
    date: '2026-11-01 11:20',
    durationSeconds: 240,
    summary: '本次会议复盘了第三季度整体交付质量，确认打通自动化门禁。',
    decisionsCount: 2,
    tasksCount: 1,
    speakers: ['张三', '李四', '王五'],
    structuredSummary: {
      suggestedTitle: '季末业务复盘与 AI 工具链规划',
      overview: '本次会议复盘了第三季度整体交付质量，确认打通自动化门禁。',
      decisions: [
        {
          title: '周五前打通所有门禁',
          content: '全员遵循 TDD 规范，不通过门禁禁止合并。',
          evidenceQuote: '01:20',
        },
      ],
      actions: [
        {
          title: '王五负责补充 data-testid',
          assignee: '王五',
          dueDate: '周五下班前',
        },
      ],
      risks: [
        {
          title: '弱网环境自愈风险',
          content: '持续观测断网重连一致性。',
        },
      ],
      facts: [
        {
          title: '本地 SQLite 沙箱已就绪',
          content: '毫秒级本地加密存储。',
        },
      ],
    },
    transcripts: [
      { id: 's1', speaker: '张三', channel: 'mic', timestamp: '00:01:20', text: '周五前打通所有门禁' },
      { id: 's2', speaker: '王五', channel: 'mic', timestamp: '00:02:10', text: '我来补充 data-testid' },
    ],
  };

  it('正确渲染思维导图根节点、各主分支及参会人信息', () => {
    render(<MeetingMindmap meeting={mockMeeting} />);

    // 1. 根节点
    expect(screen.getByTestId('meeting-mindmap-node-root')).toBeInTheDocument();
    expect(screen.getByText('季末业务复盘与 AI 工具链规划')).toBeInTheDocument();
    expect(screen.getByText('3 位参会人')).toBeInTheDocument();

    // 2. 主分支
    expect(screen.getByTestId('meeting-mindmap-branch-branch-overview')).toBeInTheDocument();
    expect(screen.getByTestId('meeting-mindmap-branch-branch-decisions')).toBeInTheDocument();
    expect(screen.getByTestId('meeting-mindmap-branch-branch-actions')).toBeInTheDocument();
    expect(screen.getByTestId('meeting-mindmap-branch-branch-risks')).toBeInTheDocument();
    expect(screen.getByTestId('meeting-mindmap-branch-branch-facts')).toBeInTheDocument();
    expect(screen.getByTestId('meeting-mindmap-branch-branch-participants')).toBeInTheDocument();

    // 3. 子要点内容
    expect(screen.getByText('• 周五前打通所有门禁')).toBeInTheDocument();
    expect(screen.getByText('• 王五负责补充 data-testid')).toBeInTheDocument();
    expect(screen.getByText('👤 王五')).toBeInTheDocument();
  });

  it('支持分支折叠与展开交互', () => {
    render(<MeetingMindmap meeting={mockMeeting} />);

    const collapseBtn = screen.getByTestId('meeting-mindmap-btn-collapse-branch-decisions');
    expect(screen.getByText('• 周五前打通所有门禁')).toBeInTheDocument();

    // 点击折叠
    fireEvent.click(collapseBtn);
    expect(screen.queryByText('• 周五前打通所有门禁')).toBeNull();

    // 再次点击展开
    fireEvent.click(collapseBtn);
    expect(screen.getByText('• 周五前打通所有门禁')).toBeInTheDocument();
  });

  it('渲染双向发散平衡树结构、SVG 曲线连接层与时码小气泡 (讯飞听见模式)', () => {
    const onSeekMock = vi.fn();
    render(<MeetingMindmap meeting={mockMeeting} onSeekTimestamp={onSeekMock} />);

    // 1. 验证双向发散容器 (左翼与右翼)
    expect(screen.getByTestId('meeting-mindmap-side-left')).toBeInTheDocument();
    expect(screen.getByTestId('meeting-mindmap-side-right')).toBeInTheDocument();

    // 2. 验证 SVG 平滑贝塞尔曲线连线层
    expect(screen.getByTestId('meeting-mindmap-svg-curves')).toBeInTheDocument();

    // 3. 验证时码小气泡渲染与点击穿透
    const timePill = screen.getByTestId('meeting-mindmap-badge-time-node-decision-0');
    expect(timePill).toBeInTheDocument();
    expect(timePill.textContent).toContain('01:20');

    fireEvent.click(timePill);
    expect(onSeekMock).toHaveBeenCalledWith('01:20');
  });

  it('支持全屏展开与退出全屏操作', () => {
    render(<MeetingMindmap meeting={mockMeeting} />);

    const fullscreenBtn = screen.getByTestId('meeting-mindmap-btn-fullscreen');
    expect(fullscreenBtn).toBeInTheDocument();

    fireEvent.click(fullscreenBtn);
    expect(screen.getByTestId('meeting-mindmap-container')).toHaveClass('fixed');

    // 再次点击退出全屏
    fireEvent.click(fullscreenBtn);
    expect(screen.getByTestId('meeting-mindmap-container')).not.toHaveClass('fixed');
  });

  it('支持缩放调节控制器', () => {
    render(<MeetingMindmap meeting={mockMeeting} />);

    const zoomIn = screen.getByTestId('meeting-mindmap-btn-zoom-in');
    const zoomOut = screen.getByTestId('meeting-mindmap-btn-zoom-out');
    const zoomReset = screen.getByTestId('meeting-mindmap-btn-zoom-reset');

    fireEvent.click(zoomIn);
    expect(screen.getByText('110%')).toBeInTheDocument();

    fireEvent.click(zoomOut);
    expect(screen.getByText('100%')).toBeInTheDocument();

    fireEvent.click(zoomOut);
    expect(screen.getByText('90%')).toBeInTheDocument();

    fireEvent.click(zoomReset);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('支持一键复制 Markdown 大纲树与 Mermaid 脑图代码', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<MeetingMindmap meeting={mockMeeting} />);

    // 复制 Mermaid
    const copyMermaidBtn = screen.getByTestId('meeting-mindmap-btn-copy-mermaid');
    fireEvent.click(copyMermaidBtn);
    expect(writeTextMock).toHaveBeenCalled();
    expect(writeTextMock.mock.calls[0][0]).toContain('mindmap');

    // 复制 Markdown
    const copyMdBtn = screen.getByTestId('meeting-mindmap-btn-copy-markdown');
    fireEvent.click(copyMdBtn);
    expect(writeTextMock.mock.calls[1][0]).toContain('# 季末业务复盘与 AI 工具链规划');
  });
});
