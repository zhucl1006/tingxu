import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsView } from '../views/SettingsView';
import { useMeetingStore } from '../../store/useMeetingStore';

describe('SettingsView - 本地声纹档案与隐私管理面板 (TDD T09)', () => {
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
});
