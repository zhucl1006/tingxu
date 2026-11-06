import { describe, it, expect, beforeEach } from 'vitest';
import {
  MeetingRepository,
  WebStorageAdapter,
  getMeetingRepository,
  setMeetingRepository,
  resetMeetingRepository,
} from '../meetingRepository';
import type { HistoryMeeting, TaskItem } from '../../types/meeting';

describe('MeetingRepository 本地存储仓储接缝测试 (TDD Red -> Green)', () => {
  beforeEach(() => {
    resetMeetingRepository();
    localStorage.clear();
  });

  it('WebStorageAdapter 应支持历史会议读取与写入', () => {
    const repo = new MeetingRepository(new WebStorageAdapter());

    const sampleMeeting: HistoryMeeting = {
      id: 'mtg_repo_01',
      title: '架构重构研讨会',
      date: '2026-11-04',
      durationSeconds: 1200,
      summary: '确认深度模块重构方案',
      decisionsCount: 1,
      tasksCount: 1,
    };

    repo.saveHistoryMeetings([sampleMeeting]);
    const loaded = repo.getHistoryMeetings();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('mtg_repo_01');
    expect(loaded[0].title).toBe('架构重构研讨会');
  });

  it('WebStorageAdapter 应支持待办任务读取与状态写入', () => {
    const repo = new MeetingRepository(new WebStorageAdapter());

    const task: TaskItem = {
      id: 'task_01',
      title: '完成仓储接缝测试',
      completed: false,
      meetingTitle: '研发例会',
      meetingId: 'mtg_01',
      assignee: '架构师',
      createdAt: '14:30',
    };

    repo.saveTasks([task]);
    const loaded = repo.getTasks();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe('完成仓储接缝测试');
  });

  it('当 localStorage 发生 JSON 解析损坏或异常时，应具备防御容错能力', () => {
    localStorage.setItem('tingxu_history_meetings', '{bad-json');
    const repo = new MeetingRepository(new WebStorageAdapter());
    const meetings = repo.getHistoryMeetings();
    expect(meetings).toEqual([]);
  });

  it('支持通过 setMeetingRepository 在测试中置换仓储实现', () => {
    const customAdapter = new WebStorageAdapter();
    const customRepo = new MeetingRepository(customAdapter);
    setMeetingRepository(customRepo);

    expect(getMeetingRepository()).toBe(customRepo);
  });

  it('WebStorageAdapter 应支持 ByokSettings 存取与恢复 (Plan 025)', () => {
    const repo = new MeetingRepository(new WebStorageAdapter());
    expect(repo.getByokSettings()).toBeNull();

    repo.saveByokSettings({
      mode: 'standalone',
      llmProvider: 'deepseek',
      llmApiKey: 'mock-byok-test-key-123',
      llmBaseUrl: 'https://api.deepseek.com/v1',
      llmModel: 'deepseek-chat',
      asrProvider: 'dashscope',
      asrApiKey: 'mock-asr-key',
      asrEndpoint: 'wss://dashscope.aliyuncs.com/api-ws/v1/inference',
    });

    const loaded = repo.getByokSettings();
    expect(loaded).not.toBeNull();
    expect(loaded?.mode).toBe('standalone');
    expect(loaded?.llmProvider).toBe('deepseek');
    expect(loaded?.llmApiKey).toBe('mock-byok-test-key-123');
    expect(loaded?.asrProvider).toBe('dashscope');
  });
});
