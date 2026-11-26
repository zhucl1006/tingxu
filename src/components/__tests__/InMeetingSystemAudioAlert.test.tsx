import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { InMeetingWorkbench } from '../InMeetingWorkbench';
import { useMeetingStore } from '../../store/useMeetingStore';

const toggleSystemAudioMock = vi.fn().mockResolvedValue(true);

vi.mock('../../audio/meetingPipelineService', () => ({
  getMeetingPipelineService: () => ({
    attach: vi.fn(),
    toggleSystemAudio: toggleSystemAudioMock,
    discoverDevices: vi.fn().mockResolvedValue({ availableMics: [] }),
    switchDevice: vi.fn().mockResolvedValue(undefined),
    setCaptureMode: vi.fn().mockResolvedValue(undefined),
    getAudioCapture: () => null,
    getSpeakerClusterer: () => ({ updateOptions: vi.fn() }),
  }),
}));

describe('InMeetingWorkbench - 系统音频权限告警与引导 (Issue #6 TDD)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMeetingStore.getState().resetMeeting();
    useMeetingStore.getState().startMeeting('Teams 远端收音测试会');
  });

  afterEach(() => {
    cleanup();
    useMeetingStore.getState().resetMeeting();
  });

  it('当系统音频内录权限被拒时，展示明确提示条、重试按钮与打开系统权限按钮，且支持忽略', () => {
    useMeetingStore
      .getState()
      .setSystemAudioStatus(
        'denied',
        '未获得 macOS「屏幕与系统音频录制」权限，远端参会者声音暂无法拾取。请在系统设置中勾选听序并完全退出（Cmd+Q）后重启。'
      );

    render(<InMeetingWorkbench />);

    const alert = screen.getByTestId('workbench-page-transcript-panel-alert-system-audio-error');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('屏幕与系统音频录制');
    expect(alert).toHaveTextContent('Cmd+Q');

    const settingsBtn = screen.getByTestId('workbench-page-transcript-panel-btn-open-system-audio-settings');
    expect(settingsBtn).toBeInTheDocument();

    const retryBtn = screen.getByTestId('workbench-page-transcript-panel-btn-retry-system-audio');
    fireEvent.click(retryBtn);
    expect(toggleSystemAudioMock).toHaveBeenCalledTimes(1);

    const dismissBtn = screen.getByTestId('workbench-page-transcript-panel-btn-dismiss-system-audio-error');
    fireEvent.click(dismissBtn);
    expect(screen.queryByTestId('workbench-page-transcript-panel-alert-system-audio-error')).not.toBeInTheDocument();
  });
});
