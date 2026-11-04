import { describe, it, expect, beforeEach } from 'vitest';
import { useMeetingStore } from '../useMeetingStore';

describe('useMeetingStore - 状态管理与人工保护逻辑 (TDD)', () => {
  it('014：重复final幂等，身份补全不覆盖已手工命名的片段', () => {
    const store = useMeetingStore.getState(); store.startMeeting('synthetic');
    const segment = { id: 'fixed', speaker: '识别中', channel: 'mic' as const, timestamp: '00:00:00', text: '文字保持' };
    store.addTranscriptSegment(segment); store.addTranscriptSegment(segment);
    expect(useMeetingStore.getState().transcripts).toHaveLength(1);
    store.renameSpeaker('识别中', '用户命名');
    store.updateTranscriptSpeaker('fixed', { speaker: '算法结果', speakerId: 'spk_1', speakerStatus: 'assigned' });
    expect(useMeetingStore.getState().transcripts[0].speaker).toBe('用户命名');
    expect(useMeetingStore.getState().transcripts[0].text).toBe('文字保持');
  });
  beforeEach(() => {
    useMeetingStore.getState().resetMeeting();
  });

  it('初始状态应为 IDLE 且时间为 0', () => {
    const state = useMeetingStore.getState();
    expect(state.status).toBe('IDLE');
    expect(state.elapsedSeconds).toBe(0);
    expect(state.insights).toHaveLength(0);
    expect(state.transcripts).toHaveLength(0);
  });

  it('启动会议应流转至 RECORDING 状态并初始化标题', () => {
    const store = useMeetingStore.getState();
    store.startMeeting('2026-10-30 战略对齐会');
    
    const state = useMeetingStore.getState();
    expect(state.status).toBe('RECORDING');
    expect(state.title).toBe('2026-10-30 战略对齐会');
    expect(state.meetingId).not.toBeNull();
  });

  it('计时器 tickTimer 增加秒数', () => {
    const store = useMeetingStore.getState();
    store.startMeeting('测试会议');
    store.tickTimer();
    store.tickTimer();
    expect(useMeetingStore.getState().elapsedSeconds).toBe(2);
  });

  it('添加逐字稿片段与洞察卡片', () => {
    const store = useMeetingStore.getState();
    store.startMeeting('测试');
    store.addTranscriptSegment({
      id: 'seg-1',
      speaker: '朱工',
      channel: 'mic',
      timestamp: '00:01:15',
      text: '我们本周五前完成跨平台双栏工作台的骨架搭建。',
    });

    store.addInsight({
      id: 'ins-1',
      type: 'decision',
      title: '周五完成双栏骨架搭建',
      content: '确定本周五前完成 Tauri 跨平台骨架并打通窗口通讯',
      timestamp: '00:01:15',
      evidenceSegmentId: 'seg-1',
    });

    const state = useMeetingStore.getState();
    expect(state.transcripts).toHaveLength(1);
    expect(state.insights).toHaveLength(1);
    expect(state.insights[0].isConfirmed).toBe(false);
  });

  it('铁律测试：人工确认或编辑保护（Human Protection）机制', () => {
    const store = useMeetingStore.getState();
    store.startMeeting('保护测试');
    store.addInsight({
      id: 'ins-1',
      type: 'decision',
      title: '原定交付时间',
      content: '周五下班前全量提测',
      timestamp: '00:02:00',
      evidenceSegmentId: 'seg-1',
    });

    // 1. 用户手动点击“确认”该结论
    store.confirmInsight('ins-1');
    expect(useMeetingStore.getState().insights[0].isConfirmed).toBe(true);

    // 2. 后续算法产生冲突事实，尝试算法原地覆盖 -> 必须生成 Pending Revision 而非覆盖原内容！
    store.proposeInsightRevision('ins-1', {
      id: 'rev-1',
      proposedText: '因架构重构，推迟至下周二提测',
      reason: '后续发言第 45 段提到时间调整',
      timestamp: '00:04:30',
      evidenceSegmentId: 'seg-45',
    });

    const currentCard = useMeetingStore.getState().insights[0];
    // 原卡片内容绝不可被覆盖！
    expect(currentCard.content).toBe('周五下班前全量提测');
    expect(currentCard.pendingRevision).toBeDefined();
    expect(currentCard.pendingRevision?.proposedText).toBe('因架构重构，推迟至下周二提测');

    // 3. 用户裁决：若点击“保留当前版本”，修订建议被丢弃，原内容保留
    store.keepCurrentInsightVersion('ins-1');
    expect(useMeetingStore.getState().insights[0].content).toBe('周五下班前全量提测');
    expect(useMeetingStore.getState().insights[0].pendingRevision).toBeUndefined();

    // 4. 再次触发修订并选择“采用新版本”
    store.proposeInsightRevision('ins-1', {
      id: 'rev-2',
      proposedText: '协商一致延至周六上午',
      reason: '补充确认',
      timestamp: '00:05:00',
      evidenceSegmentId: 'seg-50',
    });
    store.acceptInsightRevision('ins-1');
    const updatedCard = useMeetingStore.getState().insights[0];
    expect(updatedCard.content).toBe('协商一致延至周六上午');
    expect(updatedCard.isEdited).toBe(true);
    expect(updatedCard.pendingRevision).toBeUndefined();
  });

  it('证据高亮定位状态与窗口切换', () => {
    const store = useMeetingStore.getState();
    store.setHighlightedTranscriptId('seg-12');
    expect(useMeetingStore.getState().highlightedTranscriptId).toBe('seg-12');

    store.setActiveWindow('floating-pill');
    expect(useMeetingStore.getState().activeWindow).toBe('floating-pill');
  });

  it('结束会议时应结合逐字稿自动生成切题标题与四维结构化纪要', async () => {
    const store = useMeetingStore.getState();
    // 初始标题为默认日期时间标题
    store.startMeeting('会议记录 11-01 10:30');
    store.tickTimer();
    store.addTranscriptSegment({
      id: 'seg_1',
      speaker: '朱工',
      channel: 'mic',
      timestamp: '00:01:00',
      text: '今天探讨 AI 工具链与双轨音频低延迟方案',
    });

    // 模拟 fetch 返回 meeting-summary
    const originalFetch = global.fetch;
    global.fetch = async (url: any) => {
      if (String(url).includes('/meeting-summary')) {
        return {
          ok: true,
          json: async () => ({
            code: 0,
            data: {
              suggestedTitle: 'AI 工具链与双轨音频方案探讨',
              overview: '讨论了双轨音频低延迟采集与 AI 增量提炼方案。',
              decisions: [{ title: '采用双轨音频方案', content: '确认低延迟管道', evidenceQuote: '今天探讨' }],
              actions: [{ title: '完成链路联调', assignee: '朱工', dueDate: '周五' }],
              risks: [{ title: '网络波动风险', content: '需增加重连' }],
              facts: [{ title: '本地沙箱存储', content: '完全保障数据主权' }],
            },
          }),
        } as any;
      }
      return { ok: true, json: async () => ({ code: 0, data: {} }) } as any;
    };

    try {
      await store.endMeeting();
      const state = useMeetingStore.getState();

      // 验证标题已升级为：切题主题 + 日期时间
      expect(state.title).toContain('AI 工具链与双轨音频方案探讨');
      expect(state.title).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);

      // 验证历史会议中包含四维结构化总结
      expect(state.historyMeetings).toHaveLength(1);
      const history = state.historyMeetings[0];
      expect(history.structuredSummary).toBeDefined();
      expect(history.structuredSummary?.suggestedTitle).toBe('AI 工具链与双轨音频方案探讨');
      expect(history.structuredSummary?.decisions).toHaveLength(1);
      expect(history.structuredSummary?.actions).toHaveLength(1);

      // 验证待办自动录入 tasks
      expect(state.tasks.some((t) => t.title.includes('完成链路联调'))).toBe(true);

      // 验证 activeSummaryMeeting 已激活
      expect(state.activeSummaryMeeting).toBe(history);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('会议进行中随着秒数增加实时动态递减 quotaMinutes，并在结束会议时结算扣减', async () => {
    const store = useMeetingStore.getState();
    store.loginUser({
      userId: 'usr_deduct_test',
      phone: '13811112222',
      token: 'jwt_mock_token',
    });
    store.setQuotaMinutes(60);

    store.startMeeting('时长扣减验证会议');
    expect(useMeetingStore.getState().quotaMinutes).toBe(60);

    // 开会进行了 65 秒 (超过 1 分钟)
    for (let i = 0; i < 65; i++) {
      useMeetingStore.getState().tickTimer();
    }

    // 应该动态递减为 58 或 59 分钟 (3600 - 65 = 3535 秒 -> 58 分钟)
    expect(useMeetingStore.getState().quotaMinutes).toBe(58);

    // 模拟 endMeeting 发起服务端核销
    let deductPayload: any = null;
    const originalFetch = global.fetch;
    global.fetch = async (url: any, init: any) => {
      if (String(url).includes('/v1/billing/deduct')) {
        deductPayload = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            code: 0,
            data: { totalAvailableSeconds: 3535, reservedSeconds: 0 },
          }),
        } as any;
      }
      return { ok: true, json: async () => ({ code: 0, data: {} }) } as any;
    };

    try {
      await store.endMeeting();
      expect(deductPayload).toBeDefined();
      expect(deductPayload.userId).toBe('usr_deduct_test');
      expect(deductPayload.seconds).toBe(65);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('支持按稳定 speakerId 精准重命名说话人，避免误改其他同名或不同 ID 的发言人 (T07)', () => {
    const store = useMeetingStore.getState();
    store.startMeeting('多说话人重命名测试');

    store.addTranscriptSegment({
      id: 'seg_spk1_a',
      speaker: '发言人 1',
      speakerId: 'spk_1',
      speakerConfidence: 0.94,
      speakerColorIndex: 0,
      channel: 'mic',
      timestamp: '00:00:05',
      text: '大家好，我是第一位说话人。',
    });

    store.addTranscriptSegment({
      id: 'seg_spk2_a',
      speaker: '发言人 2',
      speakerId: 'spk_2',
      speakerConfidence: 0.91,
      speakerColorIndex: 1,
      channel: 'mic',
      timestamp: '00:00:12',
      text: '我是第二位说话人。',
    });

    store.addTranscriptSegment({
      id: 'seg_spk2_b',
      speaker: '发言人 2',
      speakerId: 'spk_2',
      speakerConfidence: 0.93,
      speakerColorIndex: 1,
      channel: 'mic',
      timestamp: '00:00:20',
      text: '我补充一下架构细节。',
    });

    // 按 speakerId 将 spk_2 重命名为 "张总"
    store.renameSpeaker('spk_2', '张总');

    const updated = useMeetingStore.getState().transcripts;
    expect(updated[0].speaker).toBe('发言人 1');
    expect(updated[0].speakerId).toBe('spk_1');
    expect(updated[1].speaker).toBe('张总');
    expect(updated[1].speakerId).toBe('spk_2');
    expect(updated[2].speaker).toBe('张总');
    expect(updated[2].speakerId).toBe('spk_2');

    const speakerMap = useMeetingStore.getState().speakerNames;
    expect(speakerMap['spk_2']).toBe('张总');
  });

  it('Local-First 历史会议与待办持久化落盘，页面刷新后完整恢复不丢失 (TDD)', async () => {
    const store = useMeetingStore.getState();
    store.clearAllHistory();
    store.startMeeting('数据持久化保证会议');
    store.tickTimer();
    store.addTranscriptSegment({
      id: 'seg_persist_1',
      speaker: '我',
      channel: 'mic',
      timestamp: '00:00:01',
      text: '本地优先，绝不丢数据。',
    });
    store.addInsight({
      id: 'ins_persist_1',
      type: 'action',
      title: '落地 LocalStorage 持久化',
      content: '完成历史会议与待办落盘',
      timestamp: '00:00:01',
      evidenceSegmentId: 'seg_persist_1',
    });

    await store.endMeeting();

    // 1. 验证已序列化保存到 localStorage
    const savedMeetingsRaw = localStorage.getItem('tingxu_history_meetings');
    const savedTasksRaw = localStorage.getItem('tingxu_tasks');
    expect(savedMeetingsRaw).not.toBeNull();
    expect(savedTasksRaw).not.toBeNull();

    const savedMeetings = JSON.parse(savedMeetingsRaw!);
    expect(savedMeetings).toHaveLength(1);
    expect(savedMeetings[0].title).toContain('数据持久化保证会议');

    // 2. 即使 elapsedSeconds 为 0，但有逐字稿内容，也不得被直接丢弃
    store.startMeeting('零秒短语速记会议');
    store.addTranscriptSegment({
      id: 'seg_zero_sec',
      speaker: '我',
      channel: 'mic',
      timestamp: '00:00:00',
      text: '紧急记录一条关键事实。',
    });
    await store.endMeeting();

    const updatedSaved = JSON.parse(localStorage.getItem('tingxu_history_meetings')!);
    expect(updatedSaved).toHaveLength(2);
    expect(updatedSaved[0].title).toContain('零秒短语速记会议');

    // 3. 支持删除历史会议并同步更新本地存储
    store.deleteHistoryMeeting(updatedSaved[0].id);
    const afterDelete = JSON.parse(localStorage.getItem('tingxu_history_meetings')!);
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0].title).toContain('数据持久化保证会议');
  });

  it('支持本地声纹档案显式授权注册、持久化恢复、重命名、单条删除与全部清空 (T09)', () => {
    const store = useMeetingStore.getState();
    store.clearSpeakerProfiles();

    const dummyEmbedding = new Array(192).fill(0);
    dummyEmbedding[0] = 1.0;

    // 1. 未显式授权 (consented = false) 严禁写入声纹档案 (AC-05)
    const unconsented = store.registerSpeakerProfile({
      displayName: '未授权用户',
      embedding: dummyEmbedding,
      sampleDurationMs: 5000,
      consented: false,
    });
    expect(unconsented).toBeNull();
    expect(useMeetingStore.getState().speakerProfiles).toHaveLength(0);

    // 2. 显式授权 (consented = true) 成功保存声纹档案并落盘至 localStorage
    const profile1 = store.registerSpeakerProfile({
      displayName: '张总',
      embedding: dummyEmbedding,
      sampleDurationMs: 8600,
      consented: true,
    });
    expect(profile1).not.toBeNull();
    expect(profile1?.displayName).toBe('张总');
    expect(useMeetingStore.getState().speakerProfiles).toHaveLength(1);
    expect(useMeetingStore.getState().voiceprintConsentAt).toBeGreaterThan(0);

    const savedRaw = localStorage.getItem('tingxu_speaker_profiles');
    expect(savedRaw).not.toBeNull();
    expect(JSON.parse(savedRaw!)).toHaveLength(1);

    // 3. 支持重命名已保存的声纹档案
    store.renameSpeakerProfile(profile1!.profileId, '张董事长');
    expect(useMeetingStore.getState().speakerProfiles[0].displayName).toBe('张董事长');

    // 4. 支持单条删除与全部清空
    store.deleteSpeakerProfile(profile1!.profileId);
    expect(useMeetingStore.getState().speakerProfiles).toHaveLength(0);
  });

  it('016：本地录音存储管理与自动/手动清理，保留文字纪要 (TDD)', async () => {
    const { vi } = await import('vitest');
    const store = useMeetingStore.getState();
    expect(store.storageSettings.autoCleanupDays).toBe(0);

    store.updateStorageSettings({ autoCleanupDays: 30 });
    expect(useMeetingStore.getState().storageSettings.autoCleanupDays).toBe(30);

    const mockMeeting = {
      id: 'm-cleanup-1',
      title: '要被清理录音的会议',
      date: '2026-10-01',
      durationSeconds: 120,
      summary: '重要纪要内容保留',
      decisionsCount: 1,
      tasksCount: 0,
      recording: { id: 'rec-cleanup-uuid-1', samples: 32000, sampleRate: 16000 },
      transcripts: [{ id: 't1', speaker: 'Alice', text: '文字必须保留', timestamp: '00:01', channel: 'mic' as const }],
    };
    useMeetingStore.setState({ historyMeetings: [mockMeeting] });

    const localMedia = await import('../../audio/localRecording');
    const pruneSpy = vi.spyOn(localMedia, 'pruneLocalRecordings').mockResolvedValue({
      freedBytes: 1048576,
      deletedCount: 1,
      deletedIds: ['rec-cleanup-uuid-1'],
    });

    const res = await useMeetingStore.getState().cleanupRecordings({ targetIds: ['rec-cleanup-uuid-1'] });
    expect(res.deletedCount).toBe(1);

    const updatedMeetings = useMeetingStore.getState().historyMeetings;
    expect(updatedMeetings).toHaveLength(1);
    expect(updatedMeetings[0].id).toBe('m-cleanup-1');
    expect(updatedMeetings[0].recording).toBeUndefined();
    expect(updatedMeetings[0].recordingWarning).toContain('本地录音已清理');
    expect(updatedMeetings[0].transcripts).toHaveLength(1);
    expect(updatedMeetings[0].summary).toBe('重要纪要内容保留');

    pruneSpy.mockRestore();
  });

  it('第三方会议感知边沿触发：入会设置应用，散会传 null 时清空应用并重置防打扰锁', () => {
    const store = useMeetingStore.getState();
    const app = {
      appName: 'Microsoft Teams',
      appId: 'teams',
      processName: 'MSTeams',
    };

    // 1. 入会探测
    store.setDetectedMeetingApp(app);
    expect(useMeetingStore.getState().detectedMeetingApp).toEqual(app);

    // 2. 用户忽略 30 分钟
    store.dismissDetectedMeetingApp('teams');
    expect(useMeetingStore.getState().detectedMeetingApp).toBeNull();
    expect(useMeetingStore.getState().dismissedMeetingAppUntil.teams).toBeGreaterThan(Date.now());

    // 3. 散会或麦克风释放（传 null）
    store.setDetectedMeetingApp(null);
    expect(useMeetingStore.getState().detectedMeetingApp).toBeNull();
    expect(useMeetingStore.getState().dismissedMeetingAppUntil).toEqual({});

    // 4. 下一场会议再次进入，能够重新灵敏提示
    store.setDetectedMeetingApp(app);
    expect(useMeetingStore.getState().detectedMeetingApp).toEqual(app);
  });
});
