import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMeetingStore } from '../useMeetingStore';
import type { HistoryMeeting } from '../../types/meeting';

describe('useMeetingStore - 10 大会议模板切换与重生成 (T03 TDD)', () => {
  const mockMeeting: HistoryMeeting = {
    id: 'mtg_tmpl_test_1',
    title: '高校课题研讨与评审会',
    date: '2026-11-16 14:00',
    durationSeconds: 1800,
    summary: '关于大模型学术研究的讨论。',
    decisionsCount: 1,
    tasksCount: 1,
    templateId: 'drucker',
    structuredSummary: {
      suggestedTitle: '高校课题研讨与评审会',
      overview: '全场会议确立了下阶段实验规划。',
      templateId: 'drucker',
      decisions: [{ title: '选定方向', content: '集中精力攻克多模态' }],
      actions: [{ title: '文献检索', assignee: '张同学', dueDate: '周五' }],
      risks: [],
      facts: [],
      templatePayload: {
        corePurpose: '确立多模态学术方向',
        decisions: [{ title: '选定方向', content: '集中精力攻克多模态' }],
        dissentingViewsAndRisks: [],
        accountabilityMatrix: [],
      },
    },
    transcripts: [
      { id: 'seg_1', speaker: '导师', text: '张同学，你这周的多模态进展如何？', timestamp: '00:01', channel: 'mic' },
      { id: 'seg_2', speaker: '张同学', text: '模型在图文检索指标上有提升，但多语言推理有瓶颈。', timestamp: '00:15', channel: 'mic' },
      { id: 'seg_3', speaker: '导师', text: '建议研读最新的 McPhee 结构法与 DeepSeek 论文，本周五提交修改后代码。', timestamp: '00:30', channel: 'mic' },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    useMeetingStore.setState({
      historyMeetings: [mockMeeting],
      activeSummaryMeeting: mockMeeting,
      byokSettings: {
        mode: 'standalone',
        llmProvider: 'deepseek',
        llmApiKey: 'sk-test-key-valid',
        llmBaseUrl: 'https://api.deepseek.com/v1',
        llmModel: 'deepseek-flash',
        asrProvider: 'dashscope',
        asrApiKey: '',
        asrEndpoint: '',
      },
    });
  });

  it('regenerateSummaryWithTemplate: 应能切换模板并调用大模型生成对应高校学术模板 Payload', async () => {
    const academicAiOutput = {
      suggestedTitle: '多模态课题研讨组会',
      overview: '讨论了图文检索提升与多语言瓶颈，导师给出了具体文献建议。',
      templateId: 'academic',
      templatePayload: {
        researchProgress: [
          { topic: '图文检索指标', progress: '图文检索有提升但多语言推理遇阻', speaker: '张同学', evidenceSegmentId: 'seg_2' },
        ],
        advisorGuidance: [
          { advisorName: '导师', feedback: '研读 DeepSeek 论文并本周五提交代码', suggestedReadings: ['DeepSeek论文'], evidenceSegmentId: 'seg_3' },
        ],
        academicDebates: [],
        nextExperiments: [
          { task: '提交修改后多模态代码', owner: '张同学', targetDeadline: '周五', evidenceSegmentId: 'seg_3' },
        ],
      },
    };

    // Mock fetch
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify(academicAiOutput),
            },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 150,
          total_tokens: 250,
        },
      }),
    } as any);

    const success = await useMeetingStore
      .getState()
      .regenerateSummaryWithTemplate('mtg_tmpl_test_1', 'academic');

    expect(success).toBe(true);

    const active = useMeetingStore.getState().activeSummaryMeeting;
    expect(active?.templateId).toBe('academic');
    expect(active?.structuredSummary?.templateId).toBe('academic');
    expect(active?.structuredSummary?.templatePayload).toBeDefined();

    const academicPayload = active?.structuredSummary?.templatePayload as any;
    expect(academicPayload.researchProgress[0].speaker).toBe('张同学');
    expect(academicPayload.advisorGuidance[0].advisorName).toBe('导师');
    expect(academicPayload.nextExperiments[0].owner).toBe('张同学');

    // 验证 historyMeetings 数组中的对应会议也完成同步更新
    const history = useMeetingStore.getState().historyMeetings.find((m) => m.id === 'mtg_tmpl_test_1');
    expect(history?.templateId).toBe('academic');
  });

  it('regenerateSummaryWithTemplate: 当会议不存在或无逐字稿时应安全返回 false', async () => {
    const success = await useMeetingStore
      .getState()
      .regenerateSummaryWithTemplate('non_existent_id', 'cornell');

    expect(success).toBe(false);
  });
});
