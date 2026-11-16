/**
 * 听序（Tingxu）10 大经典会议模板类型体系契约
 */

export type MeetingTemplateId =
  | 'academic' // 高校会议纪要
  | 'drucker' // 德鲁克有效会议模板
  | 'cornell' // 康奈尔笔记模板
  | 'client_visit' // 客户拜访纪要模板
  | 'interview_analysis' // 采访内容分析
  | 'mcphee' // 麦克菲整理法模板
  | 'hiring_interview' // 面试复盘纪要
  | 'grai' // GRAI 模板
  | 'executive_brief' // 精简版纪要模板
  | 'role_summary'; // 角色总结纪要

export type TargetRoleCategory =
  | '学生/科研人员'
  | '职场管理层'
  | '学生/受训者'
  | '商务销售'
  | '记者/媒体'
  | '深度撰稿人'
  | '招聘HR/主管'
  | '项目经理/Leader'
  | '职场通用'
  | '秘书/协调员';

export interface MeetingTemplateSectionConfig {
  key: string;
  title: string;
  description: string;
}

export interface MeetingTemplateDefinition {
  id: MeetingTemplateId;
  name: string;
  targetRole: TargetRoleCategory;
  icon: string;
  badgeColor: string;
  description: string;
  systemPromptInstruction: string;
  expectedSections: MeetingTemplateSectionConfig[];
  jsonSchemaHint: string;
}

// ======================== 多态 Payload 定义 ========================

// 1. 高校会议纪要 Payload
export interface AcademicSummaryPayload {
  researchProgress: Array<{
    topic: string;
    progress: string;
    speaker?: string;
    evidenceSegmentId?: string;
  }>;
  advisorGuidance: Array<{
    advisorName: string;
    feedback: string;
    suggestedReadings?: string[];
    evidenceSegmentId?: string;
  }>;
  academicDebates: Array<{
    point: string;
    discussions: string;
    evidenceSegmentId?: string;
  }>;
  nextExperiments: Array<{
    task: string;
    owner: string;
    targetDeadline: string;
    evidenceSegmentId?: string;
  }>;
}

// 2. 德鲁克有效会议 Payload
export interface DruckerSummaryPayload {
  corePurpose: string;
  decisions: Array<{
    title: string;
    content: string;
    evidenceSegmentId?: string;
  }>;
  dissentingViewsAndRisks: Array<{
    point: string;
    reason: string;
    evidenceSegmentId?: string;
  }>;
  accountabilityMatrix: Array<{
    action: string;
    owner: string;
    deliverable: string;
    deadline: string;
    evidenceSegmentId?: string;
  }>;
}

// 3. 康奈尔笔记 Payload
export interface CornellSummaryPayload {
  cueColumn: Array<{
    cueId: string;
    cueText: string; // 关键词或引导性提问
  }>;
  notesColumn: Array<{
    noteId: string;
    correspondingCueId?: string;
    content: string;
    evidenceSegmentId?: string;
  }>;
  summaryArea: string; // 底部 2-3 句浓缩总结
}

// 4. 客户拜访纪要 Payload
export interface ClientVisitSummaryPayload {
  clientProfile: {
    clientName?: string;
    stakeholders?: string[];
  };
  painPoints: Array<{
    pain: string;
    severity?: '高' | '中' | '低';
    evidenceSegmentId?: string;
  }>;
  solutionFeedback: Array<{
    feedbackPoint: string;
    clientAttitude?: '认可' | '犹豫' | '反对';
    evidenceSegmentId?: string;
  }>;
  bantInfo: {
    budget?: string;
    authority?: string;
    need?: string;
    timeline?: string;
  };
  nextSteps: Array<{
    action: string;
    owner: string;
    dueDate?: string;
    evidenceSegmentId?: string;
  }>;
}

// 5. 采访内容分析 Payload
export interface InterviewAnalysisPayload {
  intervieweeInfo: string;
  keyQuotes: Array<{
    quote: string;
    speaker?: string;
    context?: string;
    evidenceSegmentId?: string;
  }>;
  thematicAnalysis: Array<{
    theme: string;
    insight: string;
    evidenceSegmentId?: string;
  }>;
  storiesAndCases: Array<{
    title: string;
    story: string;
    evidenceSegmentId?: string;
  }>;
  interviewerObservation: string;
}

// 6. 麦克菲整理法 Payload
export interface McPheeSummaryPayload {
  centralHook: string; // 核心冲突与切入点
  thematicClusters: Array<{
    clusterName: string;
    narrative: string;
    points: string[];
    evidenceSegmentId?: string;
  }>;
  evidenceChain: Array<{
    fact: string;
    corroboration: string;
    evidenceSegmentId?: string;
  }>;
  structuralConclusion: string;
}

// 7. 面试复盘纪要 Payload
export interface HiringInterviewPayload {
  candidateInfo: {
    name?: string;
    position?: string;
    yearsOfExperience?: string;
  };
  competencyAssessment: {
    hardSkillsScore?: string; // 1-5分或评语
    hardSkillsDetail?: string;
    softSkillsScore?: string;
    softSkillsDetail?: string;
    cultureFitScore?: string;
    cultureFitDetail?: string;
  };
  highlightsStar: Array<{
    dimension: string;
    starEvidence: string; // 情境、任务、行动、结果
    evidenceSegmentId?: string;
  }>;
  concernsAndRisks: Array<{
    concern: string;
    evidenceSegmentId?: string;
  }>;
  hiringDecision: {
    verdict: '强烈推荐' | '建议通过' | '待定/比对' | '不予录用';
    suggestedLevel?: string;
    salaryExpectation?: string;
    summaryNotes: string;
  };
}

// 8. GRAI 复盘 Payload
export interface GraiSummaryPayload {
  goalReview: {
    originalGoals: string[];
    targetMetrics?: string[];
  };
  resultEvaluation: {
    actualOutcomes: string[];
    highlights: string[];
    gaps: string[];
  };
  causeAnalysis: Array<{
    issue: string;
    rootCause: string;
    category?: '主观流程' | '客观环境' | '协作配合' | '资源技术';
    evidenceSegmentId?: string;
  }>;
  insightAndAction: {
    principles: string[]; // 规律与沉淀
    actionItems: Array<{
      action: string;
      owner: string;
      deadline: string;
      evidenceSegmentId?: string;
    }>;
  };
}

// 9. 精简版纪要 Payload
export interface ExecutiveBriefPayload {
  oneSentenceSummary: string;
  topDecisions: Array<{
    order: number;
    decision: string;
    evidenceSegmentId?: string;
  }>;
  keyActionItems: Array<{
    task: string;
    owner: string;
    deadline?: string;
    evidenceSegmentId?: string;
  }>;
}

// 10. 角色总结纪要 Payload
export interface RoleSummaryPayload {
  overallDigest: string;
  roleSummaries: Array<{
    roleOrSpeaker: string;
    keyPoints: string[];
    requestsOrBlockers?: string[];
    assignedTasks?: string[];
    evidenceSegmentId?: string;
  }>;
  crossRoleDependencies: Array<{
    collaborators: string;
    dependency: string;
    evidenceSegmentId?: string;
  }>;
}

export type AnyMeetingTemplatePayload =
  | AcademicSummaryPayload
  | DruckerSummaryPayload
  | CornellSummaryPayload
  | ClientVisitSummaryPayload
  | InterviewAnalysisPayload
  | McPheeSummaryPayload
  | HiringInterviewPayload
  | GraiSummaryPayload
  | ExecutiveBriefPayload
  | RoleSummaryPayload
  | Record<string, any>;
