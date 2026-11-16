import React from 'react';
import { MeetingTemplateId } from '../../types/template';
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
} from '../../types/template';

interface MeetingTemplateSectionRendererProps {
  templateId: MeetingTemplateId;
  payload: any;
  onLocateSegment?: (segmentId?: string) => void;
}

export const MeetingTemplateSectionRenderer: React.FC<MeetingTemplateSectionRendererProps> = ({
  templateId,
  payload,
  onLocateSegment,
}) => {
  if (!payload) return null;

  const renderEvidenceButton = (segmentId?: string) => {
    if (!segmentId || !onLocateSegment) return null;
    return (
      <button
        type="button"
        data-testid={`btn-locate-segment-${segmentId}`}
        onClick={() => onLocateSegment(segmentId)}
        className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-brand-blue-subtle text-brand-blue hover:underline cursor-pointer inline-flex items-center gap-0.5"
        title="定位至对应的逐字稿段落"
      >
        <span>🔍</span>
        <span>查看依据</span>
      </button>
    );
  };

  switch (templateId) {
    // 1. 高校会议纪要
    case 'academic': {
      const p = payload as AcademicSummaryPayload;
      return (
        <div data-testid="summary-page-template-content-academic" className="space-y-4 animate-fadeIn">
          {p.researchProgress && p.researchProgress.length > 0 && (
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs">
              <h3 className="text-xs font-bold text-text-primary flex items-center gap-1.5 mb-3">
                <span>🔬</span>
                <span>课题进展汇报</span>
              </h3>
              <div className="space-y-2.5">
                {p.researchProgress.map((item, idx) => (
                  <div key={idx} className="p-3 bg-subtle/60 rounded-lg border border-border-subtle/50 text-xs">
                    <div className="font-semibold text-text-primary flex items-center justify-between">
                      <span>{item.topic} {item.speaker && <span className="text-text-tertiary font-normal">({item.speaker})</span>}</span>
                      {renderEvidenceButton(item.evidenceSegmentId)}
                    </div>
                    <p className="mt-1 text-text-secondary leading-relaxed">{item.progress}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {p.advisorGuidance && p.advisorGuidance.length > 0 && (
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs">
              <h3 className="text-xs font-bold text-text-primary flex items-center gap-1.5 mb-3">
                <span>👨‍🏫</span>
                <span>导师指导与审阅意见</span>
              </h3>
              <div className="space-y-2.5">
                {p.advisorGuidance.map((g, idx) => (
                  <div key={idx} className="p-3 bg-subtle/60 rounded-lg border border-border-subtle/50 text-xs">
                    <div className="font-semibold text-brand-blue flex items-center justify-between">
                      <span>{g.advisorName} 指导意见</span>
                      {renderEvidenceButton(g.evidenceSegmentId)}
                    </div>
                    <p className="mt-1 text-text-primary leading-relaxed">{g.feedback}</p>
                    {g.suggestedReadings && g.suggestedReadings.length > 0 && (
                      <div className="mt-2 text-[11px] text-text-tertiary">
                        <span className="font-medium text-text-secondary">📚 建议阅读文献：</span>
                        <span>{g.suggestedReadings.join('、')}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {p.academicDebates && p.academicDebates.length > 0 && (
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs">
              <h3 className="text-xs font-bold text-text-primary flex items-center gap-1.5 mb-3">
                <span>💡</span>
                <span>学术探讨与未解争议</span>
              </h3>
              <div className="space-y-2">
                {p.academicDebates.map((d, idx) => (
                  <div key={idx} className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg text-xs">
                    <div className="font-semibold text-amber-700 dark:text-amber-300 flex items-center justify-between">
                      <span>{d.point}</span>
                      {renderEvidenceButton(d.evidenceSegmentId)}
                    </div>
                    <p className="mt-1 text-text-secondary leading-relaxed">{d.discussions}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {p.nextExperiments && p.nextExperiments.length > 0 && (
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs">
              <h3 className="text-xs font-bold text-text-primary flex items-center gap-1.5 mb-3">
                <span>📅</span>
                <span>下阶段实验与截稿安排</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border-subtle text-text-tertiary">
                      <th className="py-2 px-3">实验/论文任务</th>
                      <th className="py-2 px-3">责任人</th>
                      <th className="py-2 px-3">截止节点</th>
                      <th className="py-2 px-3">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle/50 text-text-secondary">
                    {p.nextExperiments.map((exp, idx) => (
                      <tr key={idx} className="hover:bg-subtle/40">
                        <td className="py-2.5 px-3 font-medium text-text-primary">{exp.task}</td>
                        <td className="py-2.5 px-3">{exp.owner}</td>
                        <td className="py-2.5 px-3 tabular-nums">{exp.targetDeadline}</td>
                        <td className="py-2.5 px-3">{renderEvidenceButton(exp.evidenceSegmentId)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      );
    }

    // 2. 德鲁克有效会议
    case 'drucker': {
      const p = payload as DruckerSummaryPayload;
      return (
        <div data-testid="summary-page-template-content-drucker" className="space-y-4 animate-fadeIn">
          {p.corePurpose && (
            <div className="p-4 bg-brand-blue-subtle/30 border border-brand-blue-subtle rounded-xl">
              <div className="text-xs font-bold text-brand-blue flex items-center gap-1.5 mb-1.5">
                <span>🎯</span>
                <span>会议核心目的与业务贡献</span>
              </div>
              <p className="text-xs text-text-primary leading-relaxed">{p.corePurpose}</p>
            </div>
          )}

          {p.dissentingViewsAndRisks && p.dissentingViewsAndRisks.length > 0 && (
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs">
              <h3 className="text-xs font-bold text-status-warning flex items-center gap-1.5 mb-3">
                <span>⚖️</span>
                <span>关键分歧与反面意见（德鲁克：重视反面意见）</span>
              </h3>
              <div className="space-y-2">
                {p.dissentingViewsAndRisks.map((v, idx) => (
                  <div key={idx} className="p-3 bg-status-warning-bg border border-status-warning-border rounded-lg text-xs">
                    <div className="font-semibold text-text-primary flex items-center justify-between">
                      <span>{v.point}</span>
                      {renderEvidenceButton(v.evidenceSegmentId)}
                    </div>
                    <p className="mt-1 text-text-secondary leading-relaxed">{v.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {p.accountabilityMatrix && p.accountabilityMatrix.length > 0 && (
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs">
              <h3 className="text-xs font-bold text-text-primary flex items-center gap-1.5 mb-3">
                <span>📋</span>
                <span>成果落实责任人矩阵 (DRI)</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border-subtle text-text-tertiary">
                      <th className="py-2 px-3">行动任务</th>
                      <th className="py-2 px-3">单一直接责任人</th>
                      <th className="py-2 px-3">交付物与标准</th>
                      <th className="py-2 px-3">交付时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle/50 text-text-secondary">
                    {p.accountabilityMatrix.map((item, idx) => (
                      <tr key={idx} className="hover:bg-subtle/40">
                        <td className="py-2.5 px-3 font-medium text-text-primary flex items-center justify-between">
                          <span>{item.action}</span>
                          {renderEvidenceButton(item.evidenceSegmentId)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-brand-blue font-semibold">{item.owner}</td>
                        <td className="py-2.5 px-3">{item.deliverable}</td>
                        <td className="py-2.5 px-3 tabular-nums">{item.deadline}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      );
    }

    // 3. 康奈尔笔记
    case 'cornell': {
      const p = payload as CornellSummaryPayload;
      return (
        <div data-testid="summary-page-template-content-cornell" className="space-y-4 animate-fadeIn">
          <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs">
            <h3 className="text-xs font-bold text-text-primary flex items-center gap-1.5 mb-3">
              <span>📝</span>
              <span>康奈尔 5R 左右分栏笔记</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
              <div className="md:col-span-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg space-y-3">
                <div className="font-bold text-amber-700 dark:text-amber-300">📌 提示与线索 (Cues)</div>
                {p.cueColumn?.map((cue, idx) => (
                  <div key={idx} className="p-2 bg-panel rounded border border-border-subtle font-medium text-text-primary">
                    {cue.cueText}
                  </div>
                ))}
              </div>
              <div className="md:col-span-8 p-3 bg-subtle/50 border border-border-subtle rounded-lg space-y-3">
                <div className="font-bold text-text-secondary">📖 详尽笔记 (Notes)</div>
                {p.notesColumn?.map((note, idx) => (
                  <div key={idx} className="p-2 bg-panel rounded border border-border-subtle/60 text-text-secondary leading-relaxed">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-text-primary">要点 {idx + 1}</span>
                      {renderEvidenceButton(note.evidenceSegmentId)}
                    </div>
                    <p className="mt-1">{note.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {p.summaryArea && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs">
              <div className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1 mb-1">
                <span>💡</span>
                <span>底部浓缩总结 (Summary)</span>
              </div>
              <p className="text-text-primary leading-relaxed">{p.summaryArea}</p>
            </div>
          )}
        </div>
      );
    }

    // 4. 客户拜访纪要
    case 'client_visit': {
      const p = payload as ClientVisitSummaryPayload;
      return (
        <div data-testid="summary-page-template-content-client_visit" className="space-y-4 animate-fadeIn">
          {p.clientProfile && (
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs text-xs">
              <h3 className="font-bold text-text-primary mb-2 flex items-center gap-1.5">
                <span>🏢</span>
                <span>客户企业画像</span>
              </h3>
              <p className="text-text-secondary">客户企业：<span className="font-semibold text-text-primary">{p.clientProfile.clientName || '未记录'}</span></p>
              {p.clientProfile.stakeholders && (
                <p className="text-text-secondary mt-1">关键干系人：{p.clientProfile.stakeholders.join('、')}</p>
              )}
            </div>
          )}

          {p.painPoints && p.painPoints.length > 0 && (
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs">
              <h3 className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5 mb-3">
                <span>⚠️</span>
                <span>客户核心业务痛点</span>
              </h3>
              <div className="space-y-2">
                {p.painPoints.map((pain, idx) => (
                  <div key={idx} className="p-3 bg-rose-500/5 border border-rose-500/20 rounded-lg text-xs flex items-center justify-between">
                    <div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-600 mr-2">{pain.severity || '重要'}</span>
                      <span className="text-text-primary">{pain.pain}</span>
                    </div>
                    {renderEvidenceButton(pain.evidenceSegmentId)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {p.bantInfo && (
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs text-xs">
              <h3 className="font-bold text-text-primary mb-3 flex items-center gap-1.5">
                <span>💼</span>
                <span>BANT 商务关键要素</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-2.5 bg-subtle rounded-lg border border-border-subtle">
                  <div className="text-text-tertiary text-[11px]">预算 (Budget)</div>
                  <div className="font-medium text-text-primary mt-1">{p.bantInfo.budget || '待探明'}</div>
                </div>
                <div className="p-2.5 bg-subtle rounded-lg border border-border-subtle">
                  <div className="text-text-tertiary text-[11px]">决策链 (Authority)</div>
                  <div className="font-medium text-text-primary mt-1">{p.bantInfo.authority || '待探明'}</div>
                </div>
                <div className="p-2.5 bg-subtle rounded-lg border border-border-subtle">
                  <div className="text-text-tertiary text-[11px]">需求刚性 (Need)</div>
                  <div className="font-medium text-text-primary mt-1">{p.bantInfo.need || '明确'}</div>
                </div>
                <div className="p-2.5 bg-subtle rounded-lg border border-border-subtle">
                  <div className="text-text-tertiary text-[11px]">排期 (Timeline)</div>
                  <div className="font-medium text-text-primary mt-1">{p.bantInfo.timeline || '待定'}</div>
                </div>
              </div>
            </div>
          )}

          {p.nextSteps && p.nextSteps.length > 0 && (
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs">
              <h3 className="text-xs font-bold text-text-primary flex items-center gap-1.5 mb-3">
                <span>🚀</span>
                <span>后续跟进行动清单 (Next Steps)</span>
              </h3>
              <div className="space-y-2 text-xs">
                {p.nextSteps.map((step, idx) => (
                  <div key={idx} className="p-2.5 bg-subtle rounded-lg border border-border-subtle flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-text-primary mr-2">{step.action}</span>
                      <span className="text-text-tertiary">负责人: {step.owner} | 节点: {step.dueDate || '尽快'}</span>
                    </div>
                    {renderEvidenceButton(step.evidenceSegmentId)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // 5. 采访内容分析
    case 'interview_analysis': {
      const p = payload as InterviewAnalysisPayload;
      return (
        <div data-testid="summary-page-template-content-interview_analysis" className="space-y-4 animate-fadeIn">
          {p.keyQuotes && p.keyQuotes.length > 0 && (
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs">
              <h3 className="text-xs font-bold text-brand-blue flex items-center gap-1.5 mb-3">
                <span>🗣️</span>
                <span>核心金句摘录 (Key Quotes)</span>
              </h3>
              <div className="space-y-3">
                {p.keyQuotes.map((q, idx) => (
                  <div key={idx} className="p-3 bg-brand-blue-subtle/20 border-l-4 border-brand-blue rounded-r-lg text-xs">
                    <p className="font-serif italic text-text-primary text-sm leading-relaxed">“{q.quote}”</p>
                    <div className="mt-2 text-[11px] text-text-tertiary flex items-center justify-between">
                      <span>—— {q.speaker || '受访者'} {q.context && `(${q.context})`}</span>
                      {renderEvidenceButton(q.evidenceSegmentId)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {p.thematicAnalysis && p.thematicAnalysis.length > 0 && (
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs text-xs">
              <h3 className="font-bold text-text-primary mb-3 flex items-center gap-1.5">
                <span>🔍</span>
                <span>分类议题深度洞察</span>
              </h3>
              <div className="space-y-2">
                {p.thematicAnalysis.map((t, idx) => (
                  <div key={idx} className="p-3 bg-subtle rounded-lg border border-border-subtle">
                    <div className="font-semibold text-text-primary">{t.theme}</div>
                    <p className="mt-1 text-text-secondary leading-relaxed">{t.insight}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {p.interviewerObservation && (
            <div className="p-4 bg-subtle border border-border-subtle rounded-xl text-xs">
              <div className="font-bold text-text-secondary flex items-center gap-1 mb-1">
                <span>✍️</span>
                <span>采访者观察与启发</span>
              </div>
              <p className="text-text-primary leading-relaxed">{p.interviewerObservation}</p>
            </div>
          )}
        </div>
      );
    }

    // 6. 麦克菲整理法
    case 'mcphee': {
      const p = payload as McPheeSummaryPayload;
      return (
        <div data-testid="summary-page-template-content-mcphee" className="space-y-4 animate-fadeIn">
          {p.centralHook && (
            <div className="p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl text-xs">
              <div className="font-bold text-violet-700 dark:text-violet-300 flex items-center gap-1.5 mb-1.5">
                <span>🪝</span>
                <span>核心张力与切入点 (The Hook)</span>
              </div>
              <p className="text-text-primary leading-relaxed">{p.centralHook}</p>
            </div>
          )}

          {p.thematicClusters && p.thematicClusters.length > 0 && (
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs text-xs">
              <h3 className="font-bold text-text-primary mb-3 flex items-center gap-1.5">
                <span>🗂️</span>
                <span>跨时间线逻辑聚类簇</span>
              </h3>
              <div className="space-y-3">
                {p.thematicClusters.map((c, idx) => (
                  <div key={idx} className="p-3 bg-subtle rounded-lg border border-border-subtle">
                    <div className="font-semibold text-text-primary flex items-center justify-between">
                      <span>簇：{c.clusterName}</span>
                      {renderEvidenceButton(c.evidenceSegmentId)}
                    </div>
                    <p className="mt-1 text-text-secondary leading-relaxed">{c.narrative}</p>
                    {c.points && c.points.length > 0 && (
                      <ul className="mt-2 list-disc list-inside space-y-1 text-text-tertiary">
                        {c.points.map((pt, pIdx) => (
                          <li key={pIdx}>{pt}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {p.structuralConclusion && (
            <div className="p-4 bg-panel border border-border-subtle rounded-xl text-xs shadow-xs">
              <div className="font-bold text-text-primary flex items-center gap-1 mb-1">
                <span>🏆</span>
                <span>结构推导与深层结论</span>
              </div>
              <p className="text-text-secondary leading-relaxed">{p.structuralConclusion}</p>
            </div>
          )}
        </div>
      );
    }

    // 7. 面试复盘纪要
    case 'hiring_interview': {
      const p = payload as HiringInterviewPayload;
      return (
        <div data-testid="summary-page-template-content-hiring_interview" className="space-y-4 animate-fadeIn">
          {p.candidateInfo && (
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs text-xs">
              <h3 className="font-bold text-text-primary mb-2 flex items-center gap-1.5">
                <span>👤</span>
                <span>候选人信息</span>
              </h3>
              <p className="text-text-secondary">姓名：<span className="font-semibold text-text-primary">{p.candidateInfo.name || '候选人'}</span> | 应聘岗位：{p.candidateInfo.position || '未标注'} | 年限：{p.candidateInfo.yearsOfExperience || '未标注'}</p>
            </div>
          )}

          {p.hiringDecision && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-700 dark:text-emerald-300">🏁 录用判定结论：【{p.hiringDecision.verdict}】</span>
                {p.hiringDecision.suggestedLevel && (
                  <span className="text-[11px] text-emerald-800 dark:text-emerald-200">建议定级：{p.hiringDecision.suggestedLevel}</span>
                )}
              </div>
              <p className="mt-2 text-text-primary leading-relaxed">{p.hiringDecision.summaryNotes}</p>
            </div>
          )}

          {p.competencyAssessment && (
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs text-xs">
              <h3 className="font-bold text-text-primary mb-3 flex items-center gap-1.5">
                <span>📊</span>
                <span>核心胜任力评估</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-2.5 bg-subtle rounded-lg border border-border-subtle">
                  <div className="font-semibold text-text-primary">硬技能 [{p.competencyAssessment.hardSkillsScore || '中'}]</div>
                  <p className="mt-1 text-text-secondary text-[11px]">{p.competencyAssessment.hardSkillsDetail}</p>
                </div>
                <div className="p-2.5 bg-subtle rounded-lg border border-border-subtle">
                  <div className="font-semibold text-text-primary">软技能 [{p.competencyAssessment.softSkillsScore || '中'}]</div>
                  <p className="mt-1 text-text-secondary text-[11px]">{p.competencyAssessment.softSkillsDetail}</p>
                </div>
                <div className="p-2.5 bg-subtle rounded-lg border border-border-subtle">
                  <div className="font-semibold text-text-primary">文化契合 [{p.competencyAssessment.cultureFitScore || '中'}]</div>
                  <p className="mt-1 text-text-secondary text-[11px]">{p.competencyAssessment.cultureFitDetail}</p>
                </div>
              </div>
            </div>
          )}

          {p.highlightsStar && p.highlightsStar.length > 0 && (
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs text-xs">
              <h3 className="font-bold text-text-primary mb-3 flex items-center gap-1.5">
                <span>⭐</span>
                <span>高光亮点实绩 (STAR 法则)</span>
              </h3>
              <div className="space-y-2">
                {p.highlightsStar.map((star, idx) => (
                  <div key={idx} className="p-2.5 bg-subtle rounded-lg border border-border-subtle flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-brand-blue mr-2">【{star.dimension}】</span>
                      <span className="text-text-primary">{star.starEvidence}</span>
                    </div>
                    {renderEvidenceButton(star.evidenceSegmentId)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // 8. GRAI 模板
    case 'grai': {
      const p = payload as GraiSummaryPayload;
      return (
        <div data-testid="summary-page-template-content-grai" className="space-y-4 animate-fadeIn text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* G - Goal */}
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs">
              <h3 className="font-bold text-text-primary mb-2 flex items-center gap-1.5">
                <span>🎯</span>
                <span>G - 目标回顾 (Goal)</span>
              </h3>
              <ul className="list-disc list-inside space-y-1 text-text-secondary">
                {p.goalReview?.originalGoals?.map((g, idx) => (
                  <li key={idx}>初心目标：{g}</li>
                ))}
                {p.goalReview?.targetMetrics?.map((m, idx) => (
                  <li key={idx} className="text-brand-blue">指标：{m}</li>
                ))}
              </ul>
            </div>

            {/* R - Result */}
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs">
              <h3 className="font-bold text-text-primary mb-2 flex items-center gap-1.5">
                <span>📊</span>
                <span>R - 结果评估 (Result)</span>
              </h3>
              <ul className="list-disc list-inside space-y-1 text-text-secondary">
                {p.resultEvaluation?.highlights?.map((h, idx) => (
                  <li key={idx} className="text-status-success font-medium">亮点：{h}</li>
                ))}
                {p.resultEvaluation?.gaps?.map((gap, idx) => (
                  <li key={idx} className="text-status-danger font-medium">差距：{gap}</li>
                ))}
              </ul>
            </div>

            {/* A - Analysis */}
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs">
              <h3 className="font-bold text-text-primary mb-2 flex items-center gap-1.5">
                <span>🔍</span>
                <span>A - 原因深挖 (Analysis)</span>
              </h3>
              <div className="space-y-2">
                {p.causeAnalysis?.map((c, idx) => (
                  <div key={idx} className="p-2 bg-subtle rounded border border-border-subtle">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-subtle border border-border-subtle mr-1.5">{c.category || '归因'}</span>
                    <span className="font-medium text-text-primary">{c.issue}</span>
                    <p className="mt-1 text-text-secondary text-[11px]">{c.rootCause}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* I - Insight */}
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs">
              <h3 className="font-bold text-text-primary mb-2 flex items-center gap-1.5">
                <span>💡</span>
                <span>I - 规律与闭环 (Insight)</span>
              </h3>
              <ul className="list-disc list-inside space-y-1 text-text-secondary">
                {p.insightAndAction?.principles?.map((pr, idx) => (
                  <li key={idx} className="font-medium text-text-primary">{pr}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      );
    }

    // 9. 精简版纪要
    case 'executive_brief': {
      const p = payload as ExecutiveBriefPayload;
      return (
        <div data-testid="summary-page-template-content-executive_brief" className="space-y-4 animate-fadeIn text-xs">
          {p.oneSentenceSummary && (
            <div className="p-4 bg-brand-blue-subtle/30 border border-brand-blue-subtle rounded-xl">
              <div className="font-bold text-brand-blue mb-1">⚡ 一句话全局速览 (TL;DR)</div>
              <p className="text-text-primary text-sm font-medium">{p.oneSentenceSummary}</p>
            </div>
          )}

          {p.topDecisions && p.topDecisions.length > 0 && (
            <div className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs">
              <h3 className="font-bold text-text-primary mb-3">🎯 Top 3-5 核心裁决</h3>
              <div className="space-y-2">
                {p.topDecisions.map((d, idx) => (
                  <div key={idx} className="p-2.5 bg-subtle rounded-lg border border-border-subtle flex items-center justify-between">
                    <span className="font-medium text-text-primary">{d.order || idx + 1}. {d.decision}</span>
                    {renderEvidenceButton(d.evidenceSegmentId)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // 10. 角色总结纪要
    case 'role_summary': {
      const p = payload as RoleSummaryPayload;
      return (
        <div data-testid="summary-page-template-content-role_summary" className="space-y-4 animate-fadeIn text-xs">
          {p.overallDigest && (
            <div className="p-4 bg-panel border border-border-subtle rounded-xl shadow-xs">
              <div className="font-bold text-text-primary mb-1">🌐 多方协同态势</div>
              <p className="text-text-secondary leading-relaxed">{p.overallDigest}</p>
            </div>
          )}

          {p.roleSummaries && p.roleSummaries.length > 0 && (
            <div className="space-y-3">
              {p.roleSummaries.map((r, idx) => (
                <div key={idx} className="bg-panel border border-border-subtle rounded-xl p-4 shadow-xs">
                  <div className="font-bold text-sm text-text-primary flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5">
                      <span>👤</span>
                      <span>角色/发言人：{r.roleOrSpeaker}</span>
                    </span>
                    {renderEvidenceButton(r.evidenceSegmentId)}
                  </div>
                  {r.keyPoints && r.keyPoints.length > 0 && (
                    <div className="mt-2 text-text-secondary">
                      <div className="font-medium text-text-primary text-[11px]">汇报要点：</div>
                      <ul className="list-disc list-inside mt-1 space-y-0.5">
                        {r.keyPoints.map((pt, pIdx) => (
                          <li key={pIdx}>{pt}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {r.requestsOrBlockers && r.requestsOrBlockers.length > 0 && (
                    <div className="mt-2 text-amber-700 dark:text-amber-300">
                      <div className="font-medium text-[11px]">提出诉求/阻塞：</div>
                      <ul className="list-disc list-inside mt-1 space-y-0.5">
                        {r.requestsOrBlockers.map((req, reqIdx) => (
                          <li key={reqIdx}>{req}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    default:
      return null;
  }
};
