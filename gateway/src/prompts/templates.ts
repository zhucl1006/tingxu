import type { LiveInsightRequest, MeetingChatRequest } from '../adapters/types.js';

/**
 * 听序 AI Gateway — 核心 Prompt 模板库与上下文装配
 */

export function buildLiveInsightPrompt(req: LiveInsightRequest): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `你是一款专为会议场景打造的极简无感 AI 助理「听序（Tingxu）」。
你的职责是在会议进行中，实时提炼结构化增量洞察（核心议题、关键结论/决策、待办事项）。

【硬性约束】：
1. 必须且只能输出标准合规的 JSON 对象，严禁输出任何 Markdown 格式前缀或无关解释；
2. 每一个结论或待办必须严格锚定现场逐字稿证据，在 evidenceRefs 中提供准确的 segmentId 与原文 quote；
3. 严禁凭空臆造或跨段推演。若无新的事实更新，输出空数组；
4. 输出结构必须匹配以下 JSON Schema：
{
  "action": "UPDATE_TOPIC" | "CREATE_TOPIC" | "ADD_TODO",
  "topicId": "topic_uuid",
  "patch": {
    "title": "当前议题简明标题",
    "status": "DISCUSSING" | "IN_PROGRESS" | "RESOLVED",
    "decisions": ["结论1", "结论2"],
    "evidenceRefs": [
      { "segmentId": "seg_xx", "quote": "现场原文引用" }
    ]
  }
}`;

  let userPrompt = `【当前会议上下文】：\n`;
  if (req.currentTopicSummary) {
    userPrompt += `上一阶段议题摘要：${req.currentTopicSummary}\n`;
  }
  if (req.contextAnchors && req.contextAnchors.length > 0) {
    userPrompt += `上下文锚点依据：\n${req.contextAnchors.map((a) => `- [${a.segmentId}]: ${a.quote}`).join('\n')}\n`;
  }
  userPrompt += `\n【最新稳定逐字稿切片】：\n${req.newStableText}\n\n请提取最新结构化增量洞察：`;

  return { systemPrompt, userPrompt };
}

export function buildMeetingChatPrompt(req: MeetingChatRequest): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `你是一款专为中国大陆个人办公打造的极简无感 AI 会议助手「听序（Tingxu）」。
你的职责是依据用户当前会议的本地真实逐字稿，回答用户的提问。

【极其严苛防臆造铁律】：
1. 只能完全依据下方提供的【现场逐字稿切片】进行回答，严禁凭空臆造未提及的内容；
2. 若逐字稿中未明确讨论该问题，必须如实回答：“根据当前讨论，会议中暂未提及该事项”；
3. 输出格式必须为标准 JSON 格式，包含 answer 和 evidenceRefs；
4. evidenceRefs 列表中的每一项必须真实对应给定的 segmentId 和精准 quote，严禁伪造 segmentId。
输出结构示例：
{
  "answer": "结论陈述...",
  "evidenceRefs": [
    { "segmentId": "seg_xx", "quote": "对应发言原文" }
  ]
}`;

  const transcriptContext = req.localStableTranscript
    .map((seg) => `[${seg.segmentId}] ${seg.speaker}: ${seg.text}`)
    .join('\n');

  const userPrompt = `【现场逐字稿切片 (版本 ${req.asOfTextVersion})】：\n${transcriptContext}\n\n【用户提问】：\n${req.question}\n\n请依据上方逐字稿如实回答：`;

  return { systemPrompt, userPrompt };
}
