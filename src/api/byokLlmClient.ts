/**
/**
 * 听序（Tingxu）— 客户端直连大模型适配器 (ByokLlmClient)
 *
 * 核心架构定位：
 * 面向开源单机 BYOK（Bring Your Own Key）模式，
 * 封装对各大兼容 OpenAI 协议服务商（DeepSeek、阿里云百炼 Qwen、本地 Ollama 等）的直连调度。
 * 用户密钥保存在本机受保护环境，直接由客户端与 Provider 通信，无需经过云端中间件。
 */

import type { ByokSettings } from '../types/meeting';
import type { CopilotChatRequest, CopilotChatResponse } from './tingxuClient';

export interface TestConnectionResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface SummaryTranscriptInput {
  segmentId: string;
  speaker: string;
  text: string;
}

export interface LiveInsightExtractionRequest {
  newStableText: string;
  currentTopicSummary?: string;
  contextAnchors?: Array<{ segmentId: string; quote: string }>;
}

export interface LiveInsightPatchResult {
  action: 'UPDATE_TOPIC' | 'CREATE_TOPIC' | 'ADD_TODO';
  topicId: string;
  patch: {
    title: string;
    type?: 'decision' | 'action' | 'risk' | 'fact';
    content?: string;
    status?: 'DISCUSSING' | 'IN_PROGRESS' | 'RESOLVED';
    decisions?: string[];
    evidenceRefs?: Array<{ segmentId: string; quote: string }>;
  };
}

export interface GenerateSummaryRequest {
  meetingId: string;
  transcripts: SummaryTranscriptInput[];
}

function normalizeChatUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

function extractJson(text: string): any {
  if (!text) return null;
  const trimmed = text.trim();
  // 1. 尝试直接解析
  try {
    return JSON.parse(trimmed);
  } catch {}

  // 2. 剥离 Markdown 代码块 ```json ... ```
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match && match[1]) {
    try {
      return JSON.parse(match[1]);
    } catch {}
  }

  // 3. 截取首个 { 到最后一个 }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {}
  }

  return null;
}

export class ByokLlmClient {
  /**
   * 测试大模型接口连通性与 API Key 有效性
   */
  public async testConnection(settings: ByokSettings): Promise<TestConnectionResult> {
    const key = settings.llmApiKey.trim();
    if (!key && settings.llmProvider !== 'ollama') {
      return { ok: false, latencyMs: 0, error: '请先填写 API Key' };
    }

    const endpoint = normalizeChatUrl(settings.llmBaseUrl || 'https://api.deepseek.com/v1');
    const model = settings.llmModel.trim() || 'deepseek-chat';
    const startTime = Date.now();

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (key) {
        headers['Authorization'] = `Bearer ${key}`;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
        }),
      });

      const latencyMs = Date.now() - startTime;

      if (res.status === 401) {
        return {
          ok: false,
          latencyMs,
          error: `API Key 无效或未授权 (HTTP 401)，请核对填写的密钥`,
        };
      }

      if (res.status === 404) {
        return {
          ok: false,
          latencyMs,
          error: `API 端点地址不存在 (HTTP 404)，请检查 Base URL 是否正确`,
        };
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          ok: false,
          latencyMs,
          error: `服务商返回异常 (HTTP ${res.status}): ${errorText.slice(0, 100)}`,
        };
      }

      return { ok: true, latencyMs };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - startTime,
        error: `网络连接失败: ${(err as Error).message}`,
      };
    }
  }

  /**
   * 针对当前会议进行会中或会后问答与修订交互
   */
  public async chatCopilot(req: CopilotChatRequest, settings: ByokSettings): Promise<CopilotChatResponse> {
    const endpoint = normalizeChatUrl(settings.llmBaseUrl || 'https://api.deepseek.com/v1');
    const model = settings.llmModel.trim() || 'deepseek-chat';

    const systemPrompt = `你是一款专为会议场景打造的极简无感 AI 会议助手「听序（Tingxu）」。
请依据现场逐字稿与现有纪要回答用户问题。只能依据上下文回答，严禁臆造。
输出格式必须为标准 JSON 格式：
{
  "answer": "回答正文...",
  "evidenceRefs": [
    { "segmentId": "seg_xx", "quote": "发言原文" }
  ],
  "proposals": [
    {
      "targetSection": "decisions" | "actions" | "overview" | "risks" | "facts",
      "action": "replace" | "add" | "delete",
      "itemIndex": 0,
      "proposedText": "修改后的文本",
      "reason": "原因"
    }
  ]
}`;

    const transcriptContext = (req.transcripts || [])
      .map((t) => `[${t.id}] ${t.speaker}: ${t.text}`)
      .join('\n');

    let userPrompt = `【现场逐字稿】：\n${transcriptContext}\n\n`;
    if (req.currentSummary) {
      userPrompt += `【当前会议纪要】：\n${JSON.stringify(req.currentSummary, null, 2)}\n\n`;
    }
    userPrompt += `用户提问：${req.question}`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (settings.llmApiKey.trim()) {
      headers['Authorization'] = `Bearer ${settings.llmApiKey.trim()}`;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`AI 请求失败 (HTTP ${res.status}): ${err.slice(0, 150)}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = extractJson(content);

    if (parsed && typeof parsed.answer === 'string') {
      return {
        answer: parsed.answer,
        citations: (parsed.evidenceRefs || []).map((e: any) => ({
          segmentId: e.segmentId,
          quote: e.quote,
        })),
        proposals: parsed.proposals || [],
      };
    }

    return {
      answer: content || '已完成本场会议分析。',
      citations: [],
      proposals: [],
    };
  }

  /**
   * 全场会议结束后，生成全场高精总结与推荐标题
   */
  public async generateMeetingSummary(
    req: GenerateSummaryRequest,
    settings: ByokSettings
  ): Promise<any> {
    const endpoint = normalizeChatUrl(settings.llmBaseUrl || 'https://api.deepseek.com/v1');
    const model = settings.llmModel.trim() || 'deepseek-chat';

    const systemPrompt = `你是一款专为会议场景打造的极简无感 AI 助理「听序（Tingxu）」。
请对会议全文逐字稿进行结构化整理，输出标准 JSON 格式，严格包含：
{
  "suggestedTitle": "简练的主题标题（如：架构单机化改造评审）",
  "overview": "全场会议的核心主旨综述（100-200字）",
  "decisions": [
    { "title": "决策要点", "content": "决策详情陈述", "evidenceSegmentId": "seg_xx" }
  ],
  "actions": [
    { "title": "待办事项", "assignee": "负责人或待确认", "dueDate": "截止时间或待确认", "evidenceSegmentId": "seg_xx" }
  ]
}`;

    const transcriptContext = (req.transcripts || [])
      .map((t) => `[${t.segmentId}] ${t.speaker}: ${t.text}`)
      .join('\n');

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (settings.llmApiKey.trim()) {
      headers['Authorization'] = `Bearer ${settings.llmApiKey.trim()}`;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `【会议逐字稿全文】：\n${transcriptContext}\n\n请提取结构化总结与标题：` },
        ],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`纪要生成失败 (HTTP ${res.status}): ${err.slice(0, 150)}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = extractJson(content);
    if (!parsed) {
      throw new Error('大模型未能输出合规的结构化 JSON 纪要');
    }

    return parsed;
  }

  /**
   * 客户端直连提取增量实时洞察与待办 (Plan 026)
   */
  public async extractLiveInsights(
    req: LiveInsightExtractionRequest,
    settings: ByokSettings
  ): Promise<LiveInsightPatchResult | null> {
    const endpoint = normalizeChatUrl(settings.llmBaseUrl || 'https://api.deepseek.com/v1');
    const model = settings.llmModel.trim() || 'deepseek-chat';

    const systemPrompt = `你是一款专为会议场景打造的极简无感 AI 助理「听序（Tingxu）」。
你的职责是在会议进行中，实时提炼结构化段落洞察（议题讨论总结、阶段性关键结论、核心事实，以及真正有执行主体的待办）。

【极其严苛的待办识别准则（杜绝假待办泛滥）】：
1. 严禁将普通的意见讨论、分析观点、口语建议或闲聊随口一说归类为待办（ADD_TODO）！
2. 只有当参会人明确分工了执行责任人（谁来做）且指定了具体行动任务时，才允许产出待办（action / ADD_TODO）；
3. 对于普通的业务分析、事实交流与方案权衡，一律提炼为【阶段段落洞察总结】（type 为 decision 或 fact），在 content 中给出本段分析总结；

【硬性约束】：
1. 必须且只能输出标准合规的 JSON 对象，严禁输出任何 Markdown 格式前缀或无关解释；
2. 每一个结论、总结或待办必须严格锚定现场逐字稿证据，在 evidenceRefs 中提供准确的 segmentId 与原文 quote；
3. 输出结构必须匹配以下 JSON Schema：
{
  "action": "UPDATE_TOPIC" | "CREATE_TOPIC" | "ADD_TODO",
  "topicId": "topic_uuid",
  "patch": {
    "title": "当前议题或段落简明标题",
    "type": "decision" | "action" | "risk" | "fact",
    "content": "针对该议题的具体讨论要点或阶段分析",
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

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (settings.llmApiKey.trim()) {
      headers['Authorization'] = `Bearer ${settings.llmApiKey.trim()}`;
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
        }),
      });

      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';
      const parsed = extractJson(content);
      if (!parsed || !parsed.patch || !parsed.patch.title) {
        return null;
      }

      return parsed as LiveInsightPatchResult;
    } catch {
      return null;
    }
  }
}

let defaultByokClient = new ByokLlmClient();

export function getByokLlmClient(): ByokLlmClient {
  return defaultByokClient;
}

export function setByokLlmClient(client: ByokLlmClient): void {
  defaultByokClient = client;
}
