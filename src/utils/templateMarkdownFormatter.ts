import { HistoryMeeting } from '../types/meeting';
import { getMeetingTemplateById } from '../engine/templateRegistry';
import {
  AcademicSummaryPayload,
  DruckerSummaryPayload,
  CornellSummaryPayload,
  ClientVisitSummaryPayload,
  InterviewAnalysisPayload,
  McPheeSummaryPayload,
  HiringInterviewPayload,
  GraiSummaryPayload,
  ExecutiveBriefPayload,
  RoleSummaryPayload,
} from '../types/template';

/**
 * 格式化通用会议基础元数据头部
 */
function formatMeetingHeader(meeting: HistoryMeeting, templateName: string): string[] {
  const lines: string[] = [];
  const title = meeting.structuredSummary?.suggestedTitle || meeting.title;
  lines.push(`# ${title}`);
  lines.push(`> 纪要类型：**【${templateName}】** | 会议日期：${meeting.date} | 会议时长：${Math.floor(meeting.durationSeconds / 60)} 分钟`);
  if (meeting.speakers && meeting.speakers.length > 0) {
    lines.push(`> 参会人：${meeting.speakers.join('、')}`);
  }
  lines.push('');

  const overview = meeting.structuredSummary?.overview || meeting.summary;
  if (overview) {
    lines.push('## 📝 会议宏观概述');
    lines.push(overview.trim());
    lines.push('');
  }

  return lines;
}

/**
 * 通用决策与待办降级格式化
 */
function formatFallbackSections(meeting: HistoryMeeting, lines: string[]): void {
  const decisions = meeting.structuredSummary?.decisions || [];
  if (decisions.length > 0) {
    lines.push('## 🎯 核心决议');
    decisions.forEach((d, idx) => {
      lines.push(`${idx + 1}. **${d.title}**${d.content ? `：${d.content}` : ''}`);
    });
    lines.push('');
  }

  const actions = meeting.structuredSummary?.actions || [];
  if (actions.length > 0) {
    lines.push('## 📋 待办事项 (Action Items)');
    lines.push('| 任务名称 | 负责人 | 截止时间 | 状态 |');
    lines.push('|---|---|---|---|');
    actions.forEach((a) => {
      lines.push(`| ${a.title} | ${a.assignee || '待指定'} | ${a.dueDate || '待确认'} | ${a.isConfirmed ? '已确认' : '待复核'} |`);
    });
    lines.push('');
  }
}

/**
 * 格式化多角色会议专属 Markdown
 */
export function formatTemplateMarkdown(meeting: HistoryMeeting): string {
  const templateId = meeting.templateId || meeting.structuredSummary?.templateId || 'drucker';
  const tmpl = getMeetingTemplateById(templateId);
  const lines = formatMeetingHeader(meeting, tmpl.name);
  const payload = meeting.structuredSummary?.templatePayload as any;

  if (!payload) {
    formatFallbackSections(meeting, lines);
    return lines.join('\n');
  }

  switch (templateId) {
    // 1. 高校学术会议
    case 'academic': {
      const p = payload as AcademicSummaryPayload;
      if (p.researchProgress?.length) {
        lines.push('## 🔬 课题进展汇报');
        p.researchProgress.forEach((item, idx) => {
          lines.push(`### ${idx + 1}. ${item.topic}${item.speaker ? ` (${item.speaker})` : ''}`);
          lines.push(item.progress);
        });
        lines.push('');
      }

      if (p.advisorGuidance?.length) {
        lines.push('## 👨‍🏫 导师指导与审阅意见');
        p.advisorGuidance.forEach((g) => {
          lines.push(`- **${g.advisorName}**：${g.feedback}`);
          if (g.suggestedReadings?.length) {
            lines.push(`  - *推荐文献/技术方向*：${g.suggestedReadings.join('、')}`);
          }
        });
        lines.push('');
      }

      if (p.academicDebates?.length) {
        lines.push('## 💡 学术探讨与未解争议');
        p.academicDebates.forEach((d) => {
          lines.push(`- **${d.point}**：${d.discussions}`);
        });
        lines.push('');
      }

      if (p.nextExperiments?.length) {
        lines.push('## 📅 下阶段实验与截稿安排');
        lines.push('| 实验/论文任务 | 责任人 | 截止时间 |');
        lines.push('|---|---|---|');
        p.nextExperiments.forEach((exp) => {
          lines.push(`| ${exp.task} | ${exp.owner} | ${exp.targetDeadline} |`);
        });
        lines.push('');
      }
      break;
    }

    // 2. 德鲁克有效会议
    case 'drucker': {
      const p = payload as DruckerSummaryPayload;
      if (p.corePurpose) {
        lines.push('## 🎯 会议核心目的与业务贡献');
        lines.push(p.corePurpose);
        lines.push('');
      }

      const decisions = p.decisions?.length ? p.decisions : meeting.structuredSummary?.decisions || [];
      if (decisions.length) {
        lines.push('## ✅ 核心决策点');
        decisions.forEach((d, idx) => {
          lines.push(`${idx + 1}. **${d.title}**${d.content ? `：${d.content}` : ''}`);
        });
        lines.push('');
      }

      if (p.dissentingViewsAndRisks?.length) {
        lines.push('## ⚖️ 关键分歧与反面意见');
        p.dissentingViewsAndRisks.forEach((v) => {
          lines.push(`- **${v.point}**：${v.reason}`);
        });
        lines.push('');
      }

      if (p.accountabilityMatrix?.length) {
        lines.push('## 📋 成果落实责任矩阵 (DRI)');
        lines.push('| 行动任务 | 单一责任人 (DRI) | 交付物/标准 | 截止时间 |');
        lines.push('|---|---|---|---|');
        p.accountabilityMatrix.forEach((m) => {
          lines.push(`| ${m.action} | ${m.owner} | ${m.deliverable} | ${m.deadline} |`);
        });
        lines.push('');
      } else {
        formatFallbackSections(meeting, lines);
      }
      break;
    }

    // 3. 康奈尔笔记
    case 'cornell': {
      const p = payload as CornellSummaryPayload;
      lines.push('## 📌 线索与主笔记栏 (Cues & Notes)');
      lines.push('| 提示线索 (Cues/Questions) | 详细主笔记 (Notes/Facts) |');
      lines.push('|---|---|');
      const maxLen = Math.max(p.cueColumn?.length || 0, p.notesColumn?.length || 0);
      for (let i = 0; i < maxLen; i++) {
        const cue = p.cueColumn?.[i]?.cueText || '';
        const note = p.notesColumn?.[i]?.content || '';
        lines.push(`| ${cue} | ${note} |`);
      }
      lines.push('');

      if (p.summaryArea) {
        lines.push('## 💡 底部浓缩精粹 (Summary)');
        lines.push(`> ${p.summaryArea}`);
        lines.push('');
      }
      break;
    }

    // 4. 客户拜访纪要
    case 'client_visit': {
      const p = payload as ClientVisitSummaryPayload;
      if (p.clientProfile) {
        lines.push('## 🏢 客户画像');
        lines.push(`- **客户企业**：${p.clientProfile.clientName || '未记录'}`);
        if (p.clientProfile.stakeholders?.length) {
          lines.push(`- **关键干系人**：${p.clientProfile.stakeholders.join('、')}`);
        }
        lines.push('');
      }

      if (p.painPoints?.length) {
        lines.push('## ⚠️ 客户核心痛点');
        p.painPoints.forEach((pain) => {
          lines.push(`- [${pain.severity || '重要'}] ${pain.pain}`);
        });
        lines.push('');
      }

      if (p.solutionFeedback?.length) {
        lines.push('## 💬 方案反馈与异议');
        p.solutionFeedback.forEach((f) => {
          lines.push(`- **客户态度：${f.clientAttitude || '中立'}** - ${f.feedbackPoint}`);
        });
        lines.push('');
      }

      if (p.bantInfo) {
        lines.push('## 💼 BANT 商务关键要素');
        lines.push(`- **预算情况 (Budget)**：${p.bantInfo.budget || '待探明'}`);
        lines.push(`- **决策链条 (Authority)**：${p.bantInfo.authority || '待探明'}`);
        lines.push(`- **核心刚需 (Need)**：${p.bantInfo.need || '明确'}`);
        lines.push(`- **采购排期 (Timeline)**：${p.bantInfo.timeline || '待明确'}`);
        lines.push('');
      }

      if (p.nextSteps?.length) {
        lines.push('## 🚀 下一步跟进动作 (Next Steps)');
        lines.push('| 跟进事项 | 负责人 | 交付节点 |');
        lines.push('|---|---|---|');
        p.nextSteps.forEach((s) => {
          lines.push(`| ${s.action} | ${s.owner} | ${s.dueDate || '尽快'} |`);
        });
        lines.push('');
      }
      break;
    }

    // 5. 采访内容分析
    case 'interview_analysis': {
      const p = payload as InterviewAnalysisPayload;
      if (p.intervieweeInfo) {
        lines.push('## 👤 受访者背景');
        lines.push(p.intervieweeInfo);
        lines.push('');
      }

      if (p.keyQuotes?.length) {
        lines.push('## 🗣️ 核心金句摘录 (Key Quotes)');
        p.keyQuotes.forEach((q) => {
          lines.push(`> “${q.quote}”  `);
          lines.push(`> —— *${q.speaker || '受访者'} ${q.context ? `(${q.context})` : ''}*`);
          lines.push('');
        });
      }

      if (p.thematicAnalysis?.length) {
        lines.push('## 🔍 分主题观点洞察');
        p.thematicAnalysis.forEach((t) => {
          lines.push(`- **${t.theme}**：${t.insight}`);
        });
        lines.push('');
      }

      if (p.storiesAndCases?.length) {
        lines.push('## 📖 典型故事与案例还原');
        p.storiesAndCases.forEach((s) => {
          lines.push(`### ${s.title}`);
          lines.push(s.story);
          lines.push('');
        });
      }

      if (p.interviewerObservation) {
        lines.push('## ✍️ 采访者观察与启发');
        lines.push(p.interviewerObservation);
        lines.push('');
      }
      break;
    }

    // 6. 麦克菲整理法
    case 'mcphee': {
      const p = payload as McPheeSummaryPayload;
      if (p.centralHook) {
        lines.push('## 🪝 核心张力与切入点 (The Hook)');
        lines.push(`> ${p.centralHook}`);
        lines.push('');
      }

      if (p.thematicClusters?.length) {
        lines.push('## 🗂️ 跨时间线逻辑聚类');
        p.thematicClusters.forEach((c) => {
          lines.push(`### 簇：${c.clusterName}`);
          lines.push(c.narrative);
          if (c.points?.length) {
            c.points.forEach((pt) => lines.push(`- ${pt}`));
          }
          lines.push('');
        });
      }

      if (p.evidenceChain?.length) {
        lines.push('## 🔗 证据链条与事实织网');
        p.evidenceChain.forEach((e) => {
          lines.push(`- **核心事实**：${e.fact}  \n  *印证素材*：${e.corroboration}`);
        });
        lines.push('');
      }

      if (p.structuralConclusion) {
        lines.push('## 🏆 结构推导与深层结论');
        lines.push(p.structuralConclusion);
        lines.push('');
      }
      break;
    }

    // 7. 面试复盘纪要
    case 'hiring_interview': {
      const p = payload as HiringInterviewPayload;
      if (p.candidateInfo) {
        lines.push('## 👤 候选人基本盘');
        lines.push(`- **姓名**：${p.candidateInfo.name || '候选人'}`);
        lines.push(`- **应聘岗位**：${p.candidateInfo.position || '待定'}`);
        lines.push(`- **工作经验**：${p.candidateInfo.yearsOfExperience || '未标注'}`);
        lines.push('');
      }

      if (p.competencyAssessment) {
        lines.push('## 📊 胜任力评估');
        const c = p.competencyAssessment;
        lines.push(`- **专业硬技能 [${c.hardSkillsScore || '中'}]**：${c.hardSkillsDetail || '无详情'}`);
        lines.push(`- **通用软技能 [${c.softSkillsScore || '中'}]**：${c.softSkillsDetail || '无详情'}`);
        lines.push(`- **文化契合度 [${c.cultureFitScore || '中'}]**：${c.cultureFitDetail || '无详情'}`);
        lines.push('');
      }

      if (p.highlightsStar?.length) {
        lines.push('## ⭐ 高光亮点实绩 (STAR 法则)');
        p.highlightsStar.forEach((star) => {
          lines.push(`- **【${star.dimension}】** ${star.starEvidence}`);
        });
        lines.push('');
      }

      if (p.concernsAndRisks?.length) {
        lines.push('## ⚠️ 短板与风险提示 (Red Flags)');
        p.concernsAndRisks.forEach((r) => {
          lines.push(`- ${r.concern}`);
        });
        lines.push('');
      }

      if (p.hiringDecision) {
        lines.push('## 🏁 终局录用决策与建议');
        const d = p.hiringDecision;
        lines.push(`### 结论：【${d.verdict}】`);
        if (d.suggestedLevel) lines.push(`- **建议定级**：${d.suggestedLevel}`);
        if (d.salaryExpectation) lines.push(`- **薪资预期**：${d.salaryExpectation}`);
        lines.push(`- **评语综述**：${d.summaryNotes}`);
        lines.push('');
      }
      break;
    }

    // 8. GRAI 模板
    case 'grai': {
      const p = payload as GraiSummaryPayload;
      lines.push('## 🔄 GRAI 闭环复盘');

      if (p.goalReview) {
        lines.push('### G - 目标回顾 (Goal)');
        p.goalReview.originalGoals?.forEach((g) => lines.push(`- 初心目标：${g}`));
        p.goalReview.targetMetrics?.forEach((m) => lines.push(`- 量化指标：${m}`));
        lines.push('');
      }

      if (p.resultEvaluation) {
        lines.push('### R - 结果评估 (Result)');
        p.resultEvaluation.actualOutcomes?.forEach((o) => lines.push(`- 实际产出：${o}`));
        p.resultEvaluation.highlights?.forEach((h) => lines.push(`- 超预期亮点：${h}`));
        p.resultEvaluation.gaps?.forEach((gap) => lines.push(`- 未达预期差距：${gap}`));
        lines.push('');
      }

      if (p.causeAnalysis?.length) {
        lines.push('### A - 原因深挖 (Analysis)');
        p.causeAnalysis.forEach((c) => {
          lines.push(`- [${c.category || '根因'}] **${c.issue}**：${c.rootCause}`);
        });
        lines.push('');
      }

      if (p.insightAndAction) {
        lines.push('### I - 规律与闭环行动 (Insight)');
        if (p.insightAndAction.principles?.length) {
          lines.push('**经验与准则沉淀**：');
          p.insightAndAction.principles.forEach((pr) => lines.push(`- ${pr}`));
        }
        if (p.insightAndAction.actionItems?.length) {
          lines.push('');
          lines.push('| 改进行动 | 责任人 | 截止时间 |');
          lines.push('|---|---|---|');
          p.insightAndAction.actionItems.forEach((act) => {
            lines.push(`| ${act.action} | ${act.owner} | ${act.deadline} |`);
          });
        }
        lines.push('');
      }
      break;
    }

    // 9. 精简版纪要
    case 'executive_brief': {
      const p = payload as ExecutiveBriefPayload;
      if (p.oneSentenceSummary) {
        lines.push('## ⚡ 一句话全局速览 (TL;DR)');
        lines.push(`> ${p.oneSentenceSummary}`);
        lines.push('');
      }

      if (p.topDecisions?.length) {
        lines.push('## 🎯 核心决议');
        p.topDecisions.forEach((d) => {
          lines.push(`${d.order || '•'}. ${d.decision}`);
        });
        lines.push('');
      }

      if (p.keyActionItems?.length) {
        lines.push('## 📋 紧凑待办清单');
        lines.push('| 行动任务 | 负责人 | 截止时间 |');
        lines.push('|---|---|---|');
        p.keyActionItems.forEach((act) => {
          lines.push(`| ${act.task} | ${act.owner} | ${act.deadline || '尽快'} |`);
        });
        lines.push('');
      }
      break;
    }

    // 10. 角色总结纪要
    case 'role_summary': {
      const p = payload as RoleSummaryPayload;
      if (p.overallDigest) {
        lines.push('## 🌐 多方协同态势');
        lines.push(p.overallDigest);
        lines.push('');
      }

      if (p.roleSummaries?.length) {
        lines.push('## 👥 分角色要点汇报');
        p.roleSummaries.forEach((r) => {
          lines.push(`### 角色/发言人：${r.roleOrSpeaker}`);
          if (r.keyPoints?.length) {
            lines.push('**汇报要点**：');
            r.keyPoints.forEach((pt) => lines.push(`- ${pt}`));
          }
          if (r.requestsOrBlockers?.length) {
            lines.push('**诉求与阻塞**：');
            r.requestsOrBlockers.forEach((req) => lines.push(`- ${req}`));
          }
          if (r.assignedTasks?.length) {
            lines.push('**承接任务**：');
            r.assignedTasks.forEach((t) => lines.push(`- ${t}`));
          }
          lines.push('');
        });
      }

      if (p.crossRoleDependencies?.length) {
        lines.push('## 🤝 跨角色协同依赖');
        p.crossRoleDependencies.forEach((dep) => {
          lines.push(`- **${dep.collaborators}**：${dep.dependency}`);
        });
        lines.push('');
      }
      break;
    }

    default:
      formatFallbackSections(meeting, lines);
      break;
  }

  return lines.join('\n');
}
