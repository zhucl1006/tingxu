import type { LiveInsightRequest, MeetingChatRequest, MeetingSummaryRequest } from '../adapters/types.js';

/**
 * 听序 AI Gateway — 核心 Prompt 模板库与上下文装配
 */

export function buildLiveInsightPrompt(req: LiveInsightRequest): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `你是一款专为会议场景打造的极简无感 AI 助理「听序（Tingxu）」。
你的职责是在会议进行中，实时提炼结构化段落洞察（议题讨论总结、阶段性关键结论、核心事实，以及真正有执行主体的待办）。

【极其严苛的待办识别准则（杜绝假待办泛滥）】：
1. 严禁将普通的意见讨论、分析观点、口语建议或闲聊随口一说归类为待办（ADD_TODO）！
2. 只有当参会人明确分工了执行责任人（谁来做）且指定了具体行动任务时，才允许产出待办（action / ADD_TODO）；
3. 对于普通的业务分析、事实交流与方案权衡，一律提炼为【阶段段落洞察总结】（type 为 decision 或 fact），在 content 中给出本段分析总结；

【硬性约束】：
1. 必须且只能输出标准合规的 JSON 对象，严禁输出任何 Markdown 格式前缀或无关解释；
2. 每一个结论、总结或待办必须严格锚定现场逐字稿证据，在 evidenceRefs 中提供准确的 segmentId 与原文 quote；
3. 严禁凭空臆造。依据现场发言真实提炼，并在 content 中陈述具体讨论要点或阶段分析；
4. 输出结构必须匹配以下 JSON Schema：
{
  "action": "UPDATE_TOPIC" | "CREATE_TOPIC" | "ADD_TODO",
  "topicId": "topic_uuid",
  "patch": {
    "title": "当前议题或段落简明标题（如：架构原子刷盘机制讨论）",
    "type": "decision" | "action" | "risk" | "fact",
    "content": "针对该议题的具体讨论要点、阶段分析或关键事实陈述",
    "status": "DISCUSSING" | "IN_PROGRESS" | "RESOLVED",
    "decisions": ["结论或要点1", "结论或要点2"],
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

export function buildMeetingSummaryPrompt(req: MeetingSummaryRequest): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `你是一款专为会议场景打造的极简高效 AI 助理「听序（Tingxu）」。
你的职责是在会议结束后，基于全场真实逐字稿，生成专业、结构化、深度的会议总结报告，并提炼切中要害的会议主题。

【极其严苛的防臆造铁律】：
1. 必须且只能输出合规的标准 JSON 对象，严禁任何 markdown 标签或非 JSON 字符；
2. 只能完全根据全场真实逐字稿如实归纳，严禁凭空臆造未发生的事实或待办；
3. 输出 JSON Schema 必须完全匹配以下结构：
{
  "suggestedTitle": "15字以内精炼切题的会议主题（如：2026 Q4 业务架构与双轨音频规划）",
  "overview": "全场会议讨论核心主旨与脉络脉络总结（100-200字）",
  "decisions": [
    { "title": "关键决策标题", "content": "具体决策结论阐述", "evidenceQuote": "发言引用", "evidenceSegmentId": "seg_xx" }
  ],
  "actions": [
    { "title": "待办事项名称", "assignee": "负责人（如能明确推断）", "dueDate": "预计交付时间（如有）", "evidenceQuote": "发言引用", "evidenceSegmentId": "seg_xx" }
  ],
  "risks": [
    { "title": "风险要点", "content": "潜在风险、阻碍或分歧分析", "evidenceQuote": "发言引用" }
  ],
  "facts": [
    { "title": "核心事实", "content": "已确认的关键数据、既定事实或外部背景", "evidenceQuote": "发言引用" }
  ]
}`;

  const transcriptContext = req.transcripts.length > 0
    ? req.transcripts.map((t) => `[${t.segmentId || 'seg'}] ${t.speaker || '发言人'}: ${t.text}`).join('\n')
    : '（本场会议暂无有效语音输入发言记录）';

  const userPrompt = `【全场会议完整逐字稿记录】：\n${transcriptContext}\n\n请严格依据上述逐字稿，提取切题标题与四维结构化会议总结（结论、待办、风险、事实）：`;

  return { systemPrompt, userPrompt };
}
