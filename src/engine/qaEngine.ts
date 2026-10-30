import { TranscriptSegment } from '../types/meeting';

export class InMeetingQaEngine {
  /**
   * 构造面向 AI Gateway / 大模型的会中问答 Prompt
   * 严格注入防臆造指令（Anti-Hallucination Guardrail）
   */
  public buildPromptContext(
    question: string,
    transcripts: TranscriptSegment[]
  ): string {
    const transcriptHistory = transcripts
      .map((t) => `[${t.timestamp}] ${t.speaker} (${t.channel}): ${t.text}`)
      .join('\n');

    return `你是一款正在辅助开会的 AI 会议秘书。
请根据以下本场会议至今产生的【官方逐字稿记录】回答用户的问题。

【逐字稿记录】：
${transcriptHistory}

【用户提问】：
${question}

【回答硬性铁律约束】：
1. 你的回答必须严格且完全基于上述【逐字稿记录】，禁止推测臆造任何未提及的事实、排期、人员或数字；
2. 如果逐字稿中未提及或讨论不够明确，必须清晰回复：“本场会议尚未讨论此议题，请稍后关注后续讨论。”；
3. 回答尽量简练有力，并主动指出论据的时间戳。`;
  }

  /**
   * 基于关键词从逐字稿中定位最相关的证据片段
   */
  public findEvidenceSegments(
    keyword: string,
    transcripts: TranscriptSegment[]
  ): TranscriptSegment[] {
    if (!keyword.trim()) return [];
    const lowerKw = keyword.toLowerCase();

    return transcripts.filter((t) =>
      t.text.toLowerCase().includes(lowerKw) ||
      t.speaker.toLowerCase().includes(lowerKw)
    );
  }
}
