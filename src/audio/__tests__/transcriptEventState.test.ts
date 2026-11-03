import { describe, expect, it } from 'vitest';
import { TranscriptEventState } from '../transcriptEventState';
import type { AsrTranscriptEvent } from '../realStreamingAsrClient';

const event = (overrides: Partial<AsrTranscriptEvent> = {}): AsrTranscriptEvent => ({
  type: 'INTERIM', taskId: 'task', utteranceId: 't0', revision: 1, source: 'mic',
  beginTimeMs: 0, endTimeMs: null, text: '初稿', ...overrides,
});

describe('014 句子事件状态', () => {
  it('同句改短与final替换保持ID，拒绝重复及迟到interim', () => {
    const state = new TranscriptEventState('epoch-1');
    const a = state.accept(event());
    expect(a).not.toBeNull();
    expect(state.accept(event({ revision: 2, text: '初' }))?.id).toBe(a?.id);
    expect(state.accept(event({ revision: 3, type: 'FINAL', text: '最终' }))?.text).toBe('最终');
    expect(state.accept(event({ revision: 4 }))).toBeNull();
    expect(state.accept(event({ revision: 3, type: 'FINAL' }))).toBeNull();
  });
  it('同source只绑定一个任务，不接收旧连接；两轨同句不碰撞', () => {
    const state = new TranscriptEventState('epoch-1');
    const mic = state.accept(event());
    const system = state.accept(event({ taskId: 'system-task', source: 'system' }));
    expect(mic?.id).not.toBe(system?.id);
    expect(state.accept(event({ taskId: 'old-task', revision: 10 }))).toBeNull();
    state.close();
    expect(state.accept(event({ type: 'FINAL', revision: 2 }))).toBeNull();
  });
  it('不同epoch即使上游task相同也有独立ID', () => {
    expect(new TranscriptEventState('a').accept(event())?.id)
      .not.toBe(new TranscriptEventState('b').accept(event())?.id);
  });
});
