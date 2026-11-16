import { describe, it, expect } from 'vitest';
import {
  ALL_MEETING_TEMPLATES,
  getMeetingTemplateById,
  isValidMeetingTemplateId,
  DEFAULT_MEETING_TEMPLATE_ID,
  MeetingTemplateId,
} from '../../engine/templateRegistry';

describe('MeetingTemplateRegistry 10 大会议模板注册表 (T01 TDD)', () => {
  it('应包含且仅包含 10 个官方经典会议模板', () => {
    expect(ALL_MEETING_TEMPLATES).toHaveLength(10);
    const templateIds = ALL_MEETING_TEMPLATES.map((t) => t.id);
    expect(templateIds).toContain('academic'); // 高校会议纪要
    expect(templateIds).toContain('drucker'); // 德鲁克有效会议
    expect(templateIds).toContain('cornell'); // 康奈尔笔记
    expect(templateIds).toContain('client_visit'); // 客户拜访纪要
    expect(templateIds).toContain('interview_analysis'); // 采访内容分析
    expect(templateIds).toContain('mcphee'); // 麦克菲整理法
    expect(templateIds).toContain('hiring_interview'); // 面试复盘纪要
    expect(templateIds).toContain('grai'); // GRAI 模板
    expect(templateIds).toContain('executive_brief'); // 精简版纪要
    expect(templateIds).toContain('role_summary'); // 角色总结纪要
  });

  it('默认模板应为德鲁克有效会议模板 (drucker)', () => {
    expect(DEFAULT_MEETING_TEMPLATE_ID).toBe('drucker');
  });

  it('每个模板元数据应具备完备的字段与角色标记', () => {
    ALL_MEETING_TEMPLATES.forEach((tmpl) => {
      expect(tmpl.id).toBeTruthy();
      expect(tmpl.name).toBeTruthy();
      expect(tmpl.targetRole).toBeTruthy();
      expect(tmpl.icon).toBeTruthy();
      expect(tmpl.description).toBeTruthy();
      expect(tmpl.systemPromptInstruction).toBeTruthy();
      expect(tmpl.expectedSections.length).toBeGreaterThan(0);
    });
  });

  it('getMeetingTemplateById 能准确获取对应模板，并在不存在时回退到默认模板', () => {
    const drucker = getMeetingTemplateById('drucker');
    expect(drucker.name).toContain('德鲁克');
    expect(drucker.targetRole).toBe('职场管理层');

    const cornell = getMeetingTemplateById('cornell');
    expect(cornell.name).toContain('康奈尔');
    expect(cornell.targetRole).toBe('学生/受训者');

    const academic = getMeetingTemplateById('academic');
    expect(academic.name).toContain('高校');
    expect(academic.targetRole).toBe('学生/科研人员');

    const clientVisit = getMeetingTemplateById('client_visit');
    expect(clientVisit.name).toContain('客户拜访');
    expect(clientVisit.targetRole).toBe('商务销售');

    const interview = getMeetingTemplateById('interview_analysis');
    expect(interview.name).toContain('采访内容分析');
    expect(interview.targetRole).toBe('记者/媒体');

    const mcphee = getMeetingTemplateById('mcphee');
    expect(mcphee.name).toContain('麦克菲');
    expect(mcphee.targetRole).toBe('深度撰稿人');

    const hiring = getMeetingTemplateById('hiring_interview');
    expect(hiring.name).toContain('面试复盘');
    expect(hiring.targetRole).toBe('招聘HR/主管');

    const grai = getMeetingTemplateById('grai');
    expect(grai.name).toContain('GRAI');
    expect(grai.targetRole).toBe('项目经理/Leader');

    const brief = getMeetingTemplateById('executive_brief');
    expect(brief.name).toContain('精简版');
    expect(brief.targetRole).toBe('职场通用');

    const roleSummary = getMeetingTemplateById('role_summary');
    expect(roleSummary.name).toContain('角色总结');
    expect(roleSummary.targetRole).toBe('秘书/协调员');

    // 容错回退
    const fallback = getMeetingTemplateById('non_existent' as MeetingTemplateId);
    expect(fallback.id).toBe('drucker');
  });

  it('isValidMeetingTemplateId 能准确校验模板有效性', () => {
    expect(isValidMeetingTemplateId('grai')).toBe(true);
    expect(isValidMeetingTemplateId('invalid_id')).toBe(false);
  });
});
