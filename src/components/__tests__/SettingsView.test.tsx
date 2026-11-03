import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsView } from '../views/SettingsView';
import { useMeetingStore } from '../../store/useMeetingStore';

describe('SettingsView - 本地声纹档案与隐私管理面板 (TDD T09)', () => {
  it('014：网关设置读写实际会话配置，而非仅修改健康检查地址', () => {
    useMeetingStore.getState().setGatewayUrl('http://127.0.0.1:3214');
    render(<SettingsView />);
    const input = screen.getByTestId('settings-input-gateway-url');
    expect(input).toHaveValue('http://127.0.0.1:3214');
    fireEvent.change(input, { target: { value: 'http://127.0.0.1:3215' } });
    expect(useMeetingStore.getState().gatewayUrl).toBe('http://127.0.0.1:3214');
    fireEvent.blur(input);
    expect(useMeetingStore.getState().gatewayUrl).toBe('http://127.0.0.1:3215');
    useMeetingStore.getState().setGatewayUrl('http://localhost:3201');
  });
  beforeEach(() => {
    const store = useMeetingStore.getState();
    store.clearSpeakerProfiles();
    const vec1 = new Array(192).fill(0);
    vec1[0] = 1.0;
    const vec2 = new Array(192).fill(0);
    vec2[10] = 1.0;

    store.registerSpeakerProfile({
      displayName: '张总',
      embedding: vec1,
      sampleDurationMs: 9200,
      consented: true,
    });
    store.registerSpeakerProfile({
      displayName: '李架构师',
      embedding: vec2,
      sampleDurationMs: 11400,
      consented: true,
    });
  });

  it('应展示已保存的本地声纹档案列表，并支持重命名、单条删除、导出与全部清空', () => {
    render(<SettingsView />);

    const profilesSection = screen.getByTestId('settings-page-section-voiceprints');
    expect(profilesSection).toBeInTheDocument();

    const profiles = useMeetingStore.getState().speakerProfiles;
    expect(profiles).toHaveLength(2);
    const firstId = profiles[0].profileId;
    const secondId = profiles[1].profileId;

    // 1. 验证档案条目渲染
    expect(screen.getByTestId(`settings-page-voiceprint-row-${firstId}`)).toHaveTextContent('张总');
    expect(screen.getByTestId(`settings-page-voiceprint-row-${secondId}`)).toHaveTextContent('李架构师');

    // 2. 点击重命名第一条声纹档案：张总 -> 张董事长
    fireEvent.click(screen.getByTestId(`settings-page-btn-rename-voiceprint-${firstId}`));
    const input = screen.getByTestId(`settings-page-input-rename-voiceprint-${firstId}`);
    fireEvent.change(input, { target: { value: '张董事长' } });
    fireEvent.click(screen.getByTestId(`settings-page-btn-save-voiceprint-${firstId}`));
    expect(screen.getByTestId(`settings-page-voiceprint-row-${firstId}`)).toHaveTextContent('张董事长');

    // 3. 删除第二条档案
    fireEvent.click(screen.getByTestId(`settings-page-btn-delete-voiceprint-${secondId}`));
    expect(useMeetingStore.getState().speakerProfiles).toHaveLength(1);

    // 4. 清空全部本地声纹档案
    fireEvent.click(screen.getByTestId('settings-page-btn-clear-all-voiceprints'));
    expect(useMeetingStore.getState().speakerProfiles).toHaveLength(0);
    expect(screen.getByTestId('settings-page-voiceprint-empty')).toBeInTheDocument();
  });

  it('016：本地录音存储用量展示、自动清理周期切换与手动清理确认 (TDD)', async () => {
    const { vi } = await import('vitest');
    const cleanupSpy = vi.fn().mockResolvedValue({
      freedBytes: 524288000,
      deletedCount: 3,
      deletedIds: ['r1', 'r2', 'r3'],
    });

    useMeetingStore.setState({
      storageUsage: { totalBytes: 524288000, recordingCount: 3 }, // ~500 MB, 3 场
      storageSettings: { autoCleanupDays: 0 },
      cleanupRecordings: cleanupSpy,
    });

    render(<SettingsView />);

    // 1. 验证存储管理区块存在
    const section = screen.getByTestId('settings-page-storage-section');
    expect(section).toBeInTheDocument();

    // 2. 验证容量与场数展示 (tabular-nums)
    expect(screen.getByTestId('settings-page-storage-text-total-bytes')).toHaveTextContent('500.0 MB');
    expect(screen.getByTestId('settings-page-storage-text-recording-count')).toHaveTextContent('3 场会议');

    // 3. 验证自动清理周期选择框
    const select = screen.getByTestId('settings-page-storage-select-autocleanup');
    expect(select).toHaveValue('0');
    fireEvent.change(select, { target: { value: '30' } });
    expect(useMeetingStore.getState().storageSettings.autoCleanupDays).toBe(30);

    // 4. 点击手动清理所有录音 -> 弹出二次确认 Modal
    fireEvent.click(screen.getByTestId('settings-page-storage-btn-cleanup-all'));
    const modal = screen.getByTestId('settings-page-storage-modal-confirm');
    expect(modal).toBeInTheDocument();

    // 5. 点击确认清理
    fireEvent.click(screen.getByTestId('settings-page-storage-btn-modal-confirm'));
    expect(cleanupSpy).toHaveBeenCalled();
  });
});
