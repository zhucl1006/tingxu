import {
  MeetingTemplateId,
  MeetingTemplateDefinition,
} from '../types/template';

export type { MeetingTemplateId, MeetingTemplateDefinition };

export const DEFAULT_MEETING_TEMPLATE_ID: MeetingTemplateId = 'drucker';

export const ALL_MEETING_TEMPLATES: MeetingTemplateDefinition[] = [
  // 1. 高校会议纪要
  {
    id: 'academic',
    name: '高校会议纪要',
    targetRole: '学生/科研人员',
    icon: '🎓',
    badgeColor: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    description: '适用于学术组会、课题评审与科研研讨，突出进展、导师指导、学术争鸣与实验规划。',
    systemPromptInstruction: `【高校学术会议纪要模式】
重点关注学术进展、导师针对性指导意见与学术争鸣疑难点。
输出 JSON 必须包含：
- "suggestedTitle": "简练学术主题",
- "overview": "课题研讨核心概要",
- "templatePayload": {
    "researchProgress": [ { "topic": "进展主题", "progress": "详细阐述", "speaker": "发言人", "evidenceSegmentId": "seg_x" } ],
    "advisorGuidance": [ { "advisorName": "导师名", "feedback": "意见细节", "suggestedReadings": ["文献/方向"], "evidenceSegmentId": "seg_x" } ],
    "academicDebates": [ { "point": "争鸣议题", "discussions": "各方观点", "evidenceSegmentId": "seg_x" } ],
    "nextExperiments": [ { "task": "具体实验/论文任务", "owner": "责任人", "targetDeadline": "截稿或交付节点", "evidenceSegmentId": "seg_x" } ]
  }`,
    expectedSections: [
      { key: 'researchProgress', title: '课题进展汇报', description: '各成员或课题组近期研究进展与数据' },
      { key: 'advisorGuidance', title: '导师审阅与指导意见', description: '导师的专业纠偏、建议文献与技术路线指示' },
      { key: 'academicDebates', title: '学术探讨与未解争议', description: '会上热烈辩论或需进一步验证的科学假设' },
      { key: 'nextExperiments', title: '下阶段实验与截稿安排', description: '明确的实验排期、论文修改任务与责任人' },
    ],
    jsonSchemaHint: 'researchProgress, advisorGuidance, academicDebates, nextExperiments',
  },

  // 2. 德鲁克有效会议模板
  {
    id: 'drucker',
    name: '德鲁克有效会议模板',
    targetRole: '职场管理层',
    icon: '🎯',
    badgeColor: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    description: '彼得·德鲁克管理哲学：会议只为贡献与成果而开，强力提炼决策、保留分歧与单一责任人矩阵。',
    systemPromptInstruction: `【德鲁克有效会议模式】
杜绝任何流水账。只提取会议真正达成的决策与贡献。特别重视不同意见（若全员附和则提示潜在盲区）。
输出 JSON 必须包含：
- "suggestedTitle": "高管决策主题",
- "overview": "全场会议的核心业务贡献与基调综述",
- "decisions": [ { "title": "决策要点", "content": "决策详情陈述", "evidenceSegmentId": "seg_x" } ],
- "actions": [ { "title": "待办事项", "assignee": "负责人", "dueDate": "时间", "evidenceSegmentId": "seg_x" } ],
- "templatePayload": {
    "corePurpose": "本次会议的核心业务目的与预期贡献",
    "decisions": [ { "title": "决策要点", "content": "决策详情", "evidenceSegmentId": "seg_x" } ],
    "dissentingViewsAndRisks": [ { "point": "反对意见或顾虑", "reason": "提出的深层考量", "evidenceSegmentId": "seg_x" } ],
    "accountabilityMatrix": [ { "action": "交付物任务", "owner": "单一直接责任人(DRI)", "deliverable": "明确交付标准", "deadline": "截止时间", "evidenceSegmentId": "seg_x" } ]
  }`,
    expectedSections: [
      { key: 'corePurpose', title: '会议核心目的与贡献', description: '为什么开会以及要达成什么业务价值' },
      { key: 'decisions', title: '核心决策点', description: '最终拍板定案的业务决议' },
      { key: 'dissentingViewsAndRisks', title: '关键分歧与反面意见', description: '会上提出的保留意见、质疑与风险' },
      { key: 'accountabilityMatrix', title: '成果落实责任人矩阵 (DRI)', description: '可度量的交付物、单一负责人与交付时间' },
    ],
    jsonSchemaHint: 'corePurpose, decisions, dissentingViewsAndRisks, accountabilityMatrix',
  },

  // 3. 康奈尔笔记模板
  {
    id: 'cornell',
    name: '康奈尔笔记模板',
    targetRole: '学生/受训者',
    icon: '📝',
    badgeColor: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    description: '经典 5R 笔记法：左线索、右笔记、底总结空间三区分割，助力深层吸收内化。',
    systemPromptInstruction: `【康奈尔 5R 笔记模式】
将庞杂的会议/研讨拆分为左右与底部三区。
左侧线索提炼提纲问题与核心概念；右侧记录论据与细节；底部浓缩全篇本质。
输出 JSON 必须包含：
- "suggestedTitle": "学习/研讨主题",
- "overview": "全局总结概要",
- "templatePayload": {
    "cueColumn": [ { "cueId": "c1", "cueText": "核心关键词或引导提问" } ],
    "notesColumn": [ { "noteId": "n1", "correspondingCueId": "c1", "content": "事实要点与逻辑论据", "evidenceSegmentId": "seg_x" } ],
    "summaryArea": "底部浓缩精粹（2-3句话总结底层逻辑）"
  }`,
    expectedSections: [
      { key: 'cueColumn', title: '线索与提示栏 (Cues)', description: '提取自问自答的关键概念、设问与提纲词' },
      { key: 'notesColumn', title: '主笔记栏 (Notes)', description: '详细推导、数据论据与事实记录' },
      { key: 'summaryArea', title: '底部浓缩总结 (Summary)', description: '全场会议的核心收获与底层逻辑沉淀' },
    ],
    jsonSchemaHint: 'cueColumn, notesColumn, summaryArea',
  },

  // 4. 客户拜访纪要模板
  {
    id: 'client_visit',
    name: '客户拜访纪要模板',
    targetRole: '商务销售',
    icon: '💼',
    badgeColor: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    description: '商务大客户销售必备：深度捕捉痛点、客户反馈、BANT 商务要素与 Next Steps。',
    systemPromptInstruction: `【客户拜访与商务纪要模式】
聚焦商业价值与推进商机。识别干系人、痛点深浅、预算/排期意向及后续推进时间表。
输出 JSON 必须包含：
- "suggestedTitle": "客户拜访与方案沟通",
- "overview": "拜访成果综述",
- "templatePayload": {
    "clientProfile": { "clientName": "客户企业", "stakeholders": ["干系人与职务"] },
    "painPoints": [ { "pain": "业务痛点描述", "severity": "高/中/低", "evidenceSegmentId": "seg_x" } ],
    "solutionFeedback": [ { "feedbackPoint": "客户对方案的评价", "clientAttitude": "认可/犹豫/反对", "evidenceSegmentId": "seg_x" } ],
    "bantInfo": { "budget": "预算信息", "authority": "决策链关键人", "need": "明确刚需", "timeline": "预计采购时间表" },
    "nextSteps": [ { "action": "跟进动作", "owner": "我方/客户方负责人", "dueDate": "截止时间", "evidenceSegmentId": "seg_x" } ]
  }`,
    expectedSections: [
      { key: 'clientProfile', title: '客户基本盘与参会干系人', description: '企业背景与参会决策者画像' },
      { key: 'painPoints', title: '客户核心痛点与现有瓶颈', description: '客户最亟待解决的业务问题' },
      { key: 'solutionFeedback', title: '方案反馈与异议排查', description: '客户对我方方案的认可度与顾虑点' },
      { key: 'bantInfo', title: 'BANT 商务关键信息', description: '预算(B)、权力链(A)、需求(N)、时间线(T)' },
      { key: 'nextSteps', title: '后续跟进事项清单', description: '明确的行动项、交期与下次拜访约定' },
    ],
    jsonSchemaHint: 'clientProfile, painPoints, solutionFeedback, bantInfo, nextSteps',
  },

  // 5. 采访内容分析
  {
    id: 'interview_analysis',
    name: '采访内容分析',
    targetRole: '记者/媒体',
    icon: '🎙️',
    badgeColor: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    description: '媒体采访与定性用研：高保真抓取受访者金句（Quotes）、分主题洞察与故事还原。',
    systemPromptInstruction: `【媒体采访内容分析模式】
强调原汁原味的金句摘录与深层态度洞察。挖掘言语背后的故事与心理。
输出 JSON 必须包含：
- "suggestedTitle": "访谈主题与人物分析",
- "overview": "访谈整体背景与核心立意",
- "templatePayload": {
    "intervieweeInfo": "受访者身份与核心背景",
    "keyQuotes": [ { "quote": "精彩原话金句", "speaker": "受访人", "context": "说话语境", "evidenceSegmentId": "seg_x" } ],
    "thematicAnalysis": [ { "theme": "主题维度", "insight": "观点提炼", "evidenceSegmentId": "seg_x" } ],
    "storiesAndCases": [ { "title": "故事案例标题", "story": "细节故事还原", "evidenceSegmentId": "seg_x" } ],
    "interviewerObservation": "记者/研究员的综合观察与启发"
  }`,
    expectedSections: [
      { key: 'keyQuotes', title: '核心金句摘录 (Quotes)', description: '最富表现力、最具代表性的精彩原话' },
      { key: 'thematicAnalysis', title: '分类议题深度洞察', description: '按维度归纳受访者的核心观点与态度' },
      { key: 'storiesAndCases', title: '典型故事与案例还原', description: '受访者分享的具体经历与细节' },
      { key: 'interviewerObservation', title: '采访者观察与启发', description: '未言之隐、言行特征与延伸思考' },
    ],
    jsonSchemaHint: 'intervieweeInfo, keyQuotes, thematicAnalysis, storiesAndCases, interviewerObservation',
  },

  // 6. 麦克菲整理法模板
  {
    id: 'mcphee',
    name: '麦克菲整理法模板',
    targetRole: '深度撰稿人',
    icon: '📖',
    badgeColor: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border-violet-200 dark:border-violet-800',
    description: '非虚构写作大师麦克菲结构法：打破时间先后，卡片式重组跨时间线逻辑与叙事弧线。',
    systemPromptInstruction: `【麦克菲结构化材料整理模式】
素材决定结构，严禁按时间线性流水罗列！从全篇提炼深层核心矛盾，将跨时段发言重组成主题逻辑簇。
输出 JSON 必须包含：
- "suggestedTitle": "结构化深度报告标题",
- "overview": "全篇宏观逻辑弧线综述",
- "templatePayload": {
    "centralHook": "全场会议的核心冲突与切入点(Hook)",
    "thematicClusters": [ { "clusterName": "逻辑主题簇", "narrative": "逻辑叙事综述", "points": ["跨时间要点"], "evidenceSegmentId": "seg_x" } ],
    "evidenceChain": [ { "fact": "核心事实", "corroboration": "多方印证素材", "evidenceSegmentId": "seg_x" } ],
    "structuralConclusion": "递进推导出的深层结论"
  }`,
    expectedSections: [
      { key: 'centralHook', title: '核心张力与切入点 (The Hook)', description: '全场讨论最核心的矛盾与开篇悬念' },
      { key: 'thematicClusters', title: '跨时间线逻辑聚类', description: '打散时间序列、按主题重构的观点群' },
      { key: 'evidenceChain', title: '证据链条与事实织网', description: '不同发言人观点与数据的交叉互证' },
      { key: 'structuralConclusion', title: '递进推导与深层结论', description: '由表及里、水到渠成的洞察沉淀' },
    ],
    jsonSchemaHint: 'centralHook, thematicClusters, evidenceChain, structuralConclusion',
  },

  // 7. 面试复盘纪要
  {
    id: 'hiring_interview',
    name: '面试复盘纪要',
    targetRole: '招聘HR/主管',
    icon: '👤',
    badgeColor: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
    description: '人才甄选与面试复盘：胜任力评估、STAR 亮点事实、潜在风险与终局录用建议。',
    systemPromptInstruction: `【招聘面试复盘模式】
基于候选人胜任力模型与 STAR 法则。量化评价硬技能与软实力，记录潜在风险与明确录用决策。
输出 JSON 必须包含：
- "suggestedTitle": "候选人面试评估",
- "overview": "面试综合综合印象",
- "templatePayload": {
    "candidateInfo": { "name": "候选人", "position": "应聘岗位", "yearsOfExperience": "工作经验" },
    "competencyAssessment": { "hardSkillsScore": "评分/简评", "hardSkillsDetail": "硬技能详情", "softSkillsScore": "评分/简评", "softSkillsDetail": "软技能详情", "cultureFitScore": "评分/简评", "cultureFitDetail": "价值观与文化" },
    "highlightsStar": [ { "dimension": "能力维度", "starEvidence": "STAR具体事实描述", "evidenceSegmentId": "seg_x" } ],
    "concernsAndRisks": [ { "concern": "疑虑或风险点", "evidenceSegmentId": "seg_x" } ],
    "hiringDecision": { "verdict": "强烈推荐/建议通过/待定/比对/不予录用", "suggestedLevel": "建议职级", "salaryExpectation": "期望薪资", "summaryNotes": "终局决策评语" }
  }`,
    expectedSections: [
      { key: 'competencyAssessment', title: '核心胜任力评估', description: '专业技能、逻辑沟通与团队契合度三维透视' },
      { key: 'highlightsStar', title: '优势亮点与高光实绩 (STAR)', description: '以情境-任务-行动-结果为依据的具体事实' },
      { key: 'concernsAndRisks', title: '短板与潜在风险提示 (Red Flags)', description: '履历存疑、稳定性或能力边界的顾虑' },
      { key: 'hiringDecision', title: '面试录用决策与建议', description: '录用结论、职级定位与定薪建议' },
    ],
    jsonSchemaHint: 'candidateInfo, competencyAssessment, highlightsStar, concernsAndRisks, hiringDecision',
  },

  // 8. GRAI 模板
  {
    id: 'grai',
    name: 'GRAI 模板',
    targetRole: '项目经理/Leader',
    icon: '🔄',
    badgeColor: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-800',
    description: '项目结项与阶段复盘：Goal目标、Result结果、Analysis归因、Insight规律的严密闭环。',
    systemPromptInstruction: `【GRAI 闭环复盘模式】
遵循复盘经典四步法：比对原目标与实际结果差异，深挖主客观根本原因，沉淀规律形成 Action Items。
输出 JSON 必须包含：
- "suggestedTitle": "项目复盘总结",
- "overview": "项目阶段复盘核心结论",
- "templatePayload": {
    "goalReview": { "originalGoals": ["立项初衷与目标"], "targetMetrics": ["目标指标项"] },
    "resultEvaluation": { "actualOutcomes": ["实际产出"], "highlights": ["亮点"], "gaps": ["落差点"] },
    "causeAnalysis": [ { "issue": "分析事项", "rootCause": "深层根因(5-Why)", "category": "主观流程/客观环境/协作配合/资源技术", "evidenceSegmentId": "seg_x" } ],
    "insightAndAction": {
      "principles": ["沉淀的可复用经验/避坑准则"],
      "actionItems": [ { "action": "改进举措", "owner": "负责人", "deadline": "完成时间", "evidenceSegmentId": "seg_x" } ]
    }
  }`,
    expectedSections: [
      { key: 'goalReview', title: 'G - 目标回顾 (Goal)', description: '当初设定的业务初心、里程碑与定量指标' },
      { key: 'resultEvaluation', title: 'R - 结果评估 (Result)', description: '实际达成数据对比，清晰列出亮点与差距' },
      { key: 'causeAnalysis', title: 'A - 原因深挖 (Analysis)', description: '5-Why 剖析成功背后的主因与失误的客观根源' },
      { key: 'insightAndAction', title: 'I - 规律与闭环 (Insight)', description: '可沉淀为 SOP 的经验与下一步改进动作' },
    ],
    jsonSchemaHint: 'goalReview, resultEvaluation, causeAnalysis, insightAndAction',
  },

  // 9. 精简版纪要模板
  {
    id: 'executive_brief',
    name: '精简版纪要模板',
    targetRole: '职场通用',
    icon: '⚡',
    badgeColor: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700',
    description: '30秒极速阅读：1句话概要、Top 3 核心决策、极简待办清单，剔除一切过程冗余。',
    systemPromptInstruction: `【精简版极速纪要模式】
极度克制与收敛。拒绝任何长篇大论。只需提供 1 句话概览、最多 3-5 条关键决议与紧凑行动清单。
输出 JSON 必须包含：
- "suggestedTitle": "极简速报",
- "overview": "一句话核心主旨（50字内）",
- "decisions": [ { "title": "决议", "content": "一句话内容", "evidenceSegmentId": "seg_x" } ],
- "actions": [ { "title": "任务", "assignee": "负责人", "dueDate": "时间", "evidenceSegmentId": "seg_x" } ],
- "templatePayload": {
    "oneSentenceSummary": "全场一句话概要",
    "topDecisions": [ { "order": 1, "decision": "核心决策条目", "evidenceSegmentId": "seg_x" } ],
    "keyActionItems": [ { "task": "具体行动", "owner": "责任人", "deadline": "截止期", "evidenceSegmentId": "seg_x" } ]
  }`,
    expectedSections: [
      { key: 'oneSentenceSummary', title: '一句话全局速览 (TL;DR)', description: '30 秒掌握全场核心总基调' },
      { key: 'topDecisions', title: 'Top 3-5 核心裁决', description: '无歧义的关键决策清单' },
      { key: 'keyActionItems', title: '核心待办矩阵', description: '直接执行的任务、责任人与时间表' },
    ],
    jsonSchemaHint: 'oneSentenceSummary, topDecisions, keyActionItems',
  },

  // 10. 角色总结纪要
  {
    id: 'role_summary',
    name: '角色总结纪要',
    targetRole: '秘书/协调员',
    icon: '👥',
    badgeColor: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    description: '行政秘书与跨部门利器：以参会主体为核心，独立归纳各方立场、汇报要点与分派任务。',
    systemPromptInstruction: `【分角色与说话人总结模式】
以发言人/部门为第一聚合维度。分别总结各角色的汇报核心、提出的诉求与承接的职责，最后提炼跨角色协同点。
输出 JSON 必须包含：
- "suggestedTitle": "多角色协作会议总结",
- "overview": "会议综述与多方协同背景",
- "templatePayload": {
    "overallDigest": "多部门协同总体态势",
    "roleSummaries": [
      {
        "roleOrSpeaker": "角色/部门/发言人",
        "keyPoints": ["核心汇报要点"],
        "requestsOrBlockers": ["提出需协助的卡点/诉求"],
        "assignedTasks": ["该角色承接的任务"],
        "evidenceSegmentId": "seg_x"
      }
    ],
    "crossRoleDependencies": [
      { "collaborators": "涉及角色A与B", "dependency": "交错依赖与拉齐事项", "evidenceSegmentId": "seg_x" }
    ]
  }`,
    expectedSections: [
      { key: 'overallDigest', title: '多方协同总体态势', description: '全局协作脉络与各方达成共识基调' },
      { key: 'roleSummaries', title: '分角色/发言人要点总结', description: '按主体拆解汇报要点、诉求与承接任务' },
      { key: 'crossRoleDependencies', title: '跨角色协同与依赖交点', description: '部门之间需要共同打通的阻塞与协同安排' },
    ],
    jsonSchemaHint: 'overallDigest, roleSummaries, crossRoleDependencies',
  },
];

/**
 * 根据模板 ID 获取模板元数据（不存在时安全回退至默认德鲁克模板）
 */
export function getMeetingTemplateById(templateId?: MeetingTemplateId | string | null): MeetingTemplateDefinition {
  const found = ALL_MEETING_TEMPLATES.find((t) => t.id === templateId);
  if (found) return found;
  return ALL_MEETING_TEMPLATES.find((t) => t.id === DEFAULT_MEETING_TEMPLATE_ID)!;
}

/**
 * 校验是否为合法的模板 ID
 */
export function isValidMeetingTemplateId(id: string): id is MeetingTemplateId {
  return ALL_MEETING_TEMPLATES.some((t) => t.id === id);
}
