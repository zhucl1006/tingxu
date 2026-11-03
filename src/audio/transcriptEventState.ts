import type { AsrTranscriptEvent } from './realStreamingAsrClient';

export class TranscriptEventState {
  private active = true;
  private tasks = new Map<string, string>();
  private sentences = new Map<string, { revision: number; final: boolean }>();
  constructor(private epoch: string) {}

  accept(event: AsrTranscriptEvent): (AsrTranscriptEvent & { id: string }) | null {
    if (!this.active) return null;
    const task = this.tasks.get(event.source);
    if (task && task !== event.taskId) return null;
    this.tasks.set(event.source, event.taskId);
    const id = `seg_${[this.epoch, event.source, event.taskId, event.utteranceId].map(encodeURIComponent).join('_')}`;
    const previous = this.sentences.get(id);
    if (previous && (previous.final || event.revision <= previous.revision)) return null;
    this.sentences.set(id, { revision: event.revision, final: event.type === 'FINAL' });
    return { ...event, id };
  }

  close(): void { this.active = false; this.tasks.clear(); this.sentences.clear(); }
}
