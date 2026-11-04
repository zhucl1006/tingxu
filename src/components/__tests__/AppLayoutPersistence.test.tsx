import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App } from '../../App';
import { useMeetingStore } from '../../store/useMeetingStore';
import { getMeetingPipelineService, resetMeetingPipelineService } from '../../audio/meetingPipelineService';

const startDraggingMock = vi.fn().mockResolvedValue(undefined);
const invokeMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => invokeMock(...args),
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(() => ({
    startDragging: startDraggingMock,
    label: 'main',
    hide: vi.fn().mockResolvedValue(undefined),
    show: vi.fn().mockResolvedValue(undefined),
    setFocus: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('AppLayoutPersistence - 跨页面切换与桌面悬浮药丸形态后台持续录音分析 (Plan 020 T06)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetMeetingPipelineService();

    // 模拟网关健康与余额接口响应
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('/gateway/v1/health')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', service: 'tingxu-ai-gateway' }),
        } as any;
      }
      if (typeof url === 'string' && url.includes('/v1/billing/balance')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 0,
            data: {
              remainingMinutes: 120,
              planType: 'PRO',
            },
          }),
        } as any;
      }
      return { ok: true, status: 200, json: async () => ({ code: 0 }) } as any;
    });

    useMeetingStore.getState().resetMeeting();
    useMeetingStore.getState().loginUser({
      userId: 'test_user_persistence',
      token: 'jwt_valid_persistence',
      phone: '13812345678',
    });
  });

  afterEach(() => {
    resetMeetingPipelineService();
    vi.restoreAllMocks();
  });

  it('在会议录制中切换至我的待办、系统设置等不同导航视图，录音与分析状态绝不中断，且切回后实时呈现后台累积数据', async () => {
    const pipeline = getMeetingPipelineService();
    const stopSpy = vi.spyOn(pipeline, 'stop');

    // 开启会议
    useMeetingStore.getState().startMeeting('跨页面持续录音测试');
    useMeetingStore.getState().setCurrentRoute('record');

    const { unmount } = render(<App />);

    // 1. 验证初次挂载处于进行中工作台（需等待网关健康探活通过）
    await waitFor(() => {
      expect(screen.getByTestId('workbench-page-insights-panel-container')).toBeInTheDocument();
    });
    expect(screen.getByTestId('workbench-page-transcript-panel-container')).toBeInTheDocument();
    expect(useMeetingStore.getState().status).toBe('RECORDING');

    // 2. 模拟用户点击侧边栏菜单切换至“我的待办” (tasks)
    const navTasksBtn = screen.getByTestId('app-sidebar-btn-nav-tasks');
    fireEvent.click(navTasksBtn);

    // 验证当前视图切换为 TasksView，InMeetingWorkbench 已卸载
    expect(screen.getByTestId('tasks-page-container')).toBeInTheDocument();
    expect(screen.queryByTestId('workbench-page-insights-panel-container')).not.toBeInTheDocument();

    // 关键断言：会议状态依然为 RECORDING，后台 Pipeline 服务绝未调用 stop()
    expect(useMeetingStore.getState().status).toBe('RECORDING');
    expect(stopSpy).not.toHaveBeenCalled();

    // 3. 模拟后台录音与 ASR 持续工作，在用户浏览待办期间产生了新的逐字稿段落与洞察卡片
    act(() => {
      useMeetingStore.getState().addTranscriptSegment({
        id: 'bg-seg-001',
        speaker: '李工 (远程)',
        channel: 'system',
        timestamp: '00:01:15',
        text: '后台持续录音测试：在浏览任务页面期间，这条发言应在后台顺利解析并保留。',
      });

      useMeetingStore.getState().addInsight({
        id: 'bg-ins-001',
        type: 'action',
        title: '后台洞察捕获验证',
        content: '李工提出的任务跟进事项，由后台洞察调度引擎自动提取。',
        timestamp: '00:01:15',
        evidenceSegmentId: 'bg-seg-001',
      });
    });

    // 4. 模拟用户再切换到系统设置页面 (settings)
    const navSettingsBtn = screen.getByTestId('app-sidebar-btn-nav-settings');
    fireEvent.click(navSettingsBtn);

    expect(screen.getByTestId('settings-page-container')).toBeInTheDocument();
    expect(useMeetingStore.getState().status).toBe('RECORDING');
    expect(stopSpy).not.toHaveBeenCalled();

    // 5. 用户通过侧边栏或进行中横幅切回进行中会议 (record)
    act(() => {
      useMeetingStore.getState().setCurrentRoute('record');
    });

    // 验证工作台重新挂载，且后台期间收到的逐字稿与洞察卡片完好呈现
    await waitFor(() => {
      expect(screen.getByTestId('workbench-page-insights-panel-container')).toBeInTheDocument();
    });

    expect(
      screen.getByTestId('workbench-page-transcript-panel-row-segment-bg-seg-001')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('workbench-page-transcript-panel-row-segment-bg-seg-001')
    ).toHaveTextContent('后台持续录音测试：在浏览任务页面期间');

    expect(
      screen.getByTestId('workbench-page-insights-panel-btn-view-evidence-bg-ins-001')
    ).toBeInTheDocument();

    unmount();
  });

  it('在会议录制中缩小至桌面微型悬浮胶囊 (Floating Pill)，后台继续持续收音，展开后内容无损恢复', async () => {
    const pipeline = getMeetingPipelineService();
    const stopSpy = vi.spyOn(pipeline, 'stop');

    useMeetingStore.getState().startMeeting('胶囊持续收音测试');
    useMeetingStore.getState().setCurrentRoute('record');

    const { rerender } = render(<App />);

    // 初始处于双栏工作台（需等待网关健康探活通过）
    await waitFor(() => {
      expect(screen.getByTestId('workbench-page-insights-panel-container')).toBeInTheDocument();
    });

    // 1. 用户点击最小化至悬浮药丸按钮
    const minBtn = screen.getByTestId('workbench-page-header-btn-minimize-to-pill');
    fireEvent.click(minBtn);

    // 验证 store 中 activeWindow 变为 floating-pill
    expect(useMeetingStore.getState().activeWindow).toBe('floating-pill');

    // 2. 重新渲染 App，切换为悬浮药丸视图
    rerender(<App />);

    // 主视图结构已卸载，悬浮药丸容器挂载并处于录音进行态
    expect(screen.queryByTestId('workbench-page-insights-panel-container')).not.toBeInTheDocument();
    expect(screen.getByTestId('floating-pill-section-container')).toBeInTheDocument();
    expect(screen.getByTestId('floating-pill-section-badge-record-dot')).toBeInTheDocument();

    // 关键断言：缩小至胶囊期间，pipeline 绝未停止
    expect(useMeetingStore.getState().status).toBe('RECORDING');
    expect(stopSpy).not.toHaveBeenCalled();

    // 3. 在悬浮胶囊后台模式下，模拟录音与 ASR 写入新的发言
    act(() => {
      useMeetingStore.getState().addTranscriptSegment({
        id: 'pill-seg-001',
        speaker: '王总 (远程)',
        channel: 'system',
        timestamp: '00:02:40',
        text: '在悬浮条贴边开会模式下，所有音频实时分析与摘要不得发生中断。',
      });
    });

    // 4. 用户点击悬浮胶囊上的“展开主窗口”按钮
    const expandBtn = screen.getByTestId('floating-pill-section-btn-expand-workbench');
    fireEvent.click(expandBtn);

    expect(useMeetingStore.getState().activeWindow).toBe('workbench');
    rerender(<App />);

    // 5. 验证主工作台重新渲染，刚才在胶囊态录制的数据完整无损
    await waitFor(() => {
      expect(screen.getByTestId('workbench-page-insights-panel-container')).toBeInTheDocument();
    });

    expect(
      screen.getByTestId('workbench-page-transcript-panel-row-segment-pill-seg-001')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('workbench-page-transcript-panel-row-segment-pill-seg-001')
    ).toHaveTextContent('在悬浮条贴边开会模式下');

    // 6. 只有显式结束会议时，才真正触发 stop
    const endBtn = screen.getByTestId('workbench-page-header-btn-end-meeting');
    act(() => {
      fireEvent.click(endBtn);
    });

    await waitFor(() => {
      expect(useMeetingStore.getState().status).toBe('ENDED');
    });
    expect(stopSpy).toHaveBeenCalled();
  });
});
