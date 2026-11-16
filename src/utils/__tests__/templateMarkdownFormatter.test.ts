import { describe, it, expect } from 'vitest';
import { formatTemplateMarkdown } from '../templateMarkdownFormatter';
import type { HistoryMeeting } from '../../types/meeting';

describe('templateMarkdownFormatter 多模板专属 Markdown 生成器 (T04 TDD)', () => {
  const baseMeeting: HistoryMeeting = {
    id: 'mtg_fmt_1',
    title: '战略与业务复盘讨论会',
    date: '2026-11-16 15:00',
    durationSeconds: 3600,
    summary: '讨论了业务战略及落地排期。',
    decisionsCount: 1,
    tasksCount: 1,
    speakers: ['张总', '李工'],
  };

  it('针对 drucker 模板应生成包含核心贡献、决策、保留分歧与 DRI 责任矩阵的 Markdown', () => {
    const meeting: HistoryMeeting = {
      ...baseMeeting,
      templateId: 'drucker',
      structuredSummary: {
        suggestedTitle: '战略决策对齐会',
        overview: '达成全员战略共识，聚焦高价值贡献。',
        decisions: [{ title: '缩减外围业务', content: '集中 80% 资源在核心产品' }],
        actions: [{ title: '输出交付标准', assignee: '李工', dueDate: '11-20' }],
        risks: [],
        facts: [],
        templatePayload: {
          corePurpose: '停止内耗，确立 Q4 决定性贡献目标',
          decisions: [{ title: '缩减外围业务', content: '集中 80% 资源在核心产品' }],
          dissentingViewsAndRisks: [
            { point: '李工担心外包客户流失', reason: '现有 3 家客户可能产生退款投诉' },
          ],
          accountabilityMatrix: [
            { action: '制定老客户安抚预案', owner: '王运营', deliverable: '退款与迁移 SLA 细则', deadline: '本周五' },
          ],
        },
      },
    };

    const md = formatTemplateMarkdown(meeting);
    expect(md).toContain('# 战略决策对齐会');
    expect(md).toContain('【德鲁克有效会议模板】');
    expect(md).toContain('## 🎯 会议核心目的与业务贡献');
    expect(md).toContain('停止内耗，确立 Q4 决定性贡献目标');
    expect(md).toContain('## ⚖️ 关键分歧与反面意见');
    expect(md).toContain('李工担心外包客户流失');
    expect(md).toContain('## 📋 成果落实责任矩阵 (DRI)');
    expect(md).toContain('| 行动任务 | 单一责任人 (DRI) | 交付物/标准 | 截止时间 |');
    expect(md).toContain('王运营');
  });

  it('针对 grai 模板应生成 G-R-A-I 四阶复盘 Markdown', () => {
    const meeting: HistoryMeeting = {
      ...baseMeeting,
      templateId: 'grai',
      structuredSummary: {
        suggestedTitle: 'Q3 敏捷迭代复盘',
        overview: '全面复盘 Q3 目标完成度。',
        decisions: [],
        actions: [],
        risks: [],
        facts: [],
        templatePayload: {
          goalReview: {
            originalGoals: ['发布听序桌面版 0.3.7'],
            targetMetrics: ['核心流程测试通过率 100%'],
          },
          resultEvaluation: {
            actualOutcomes: ['成功构建并发布桌面端'],
            highlights: ['完成 5 大门禁全自动化'],
            gaps: ['Windows 端内录驱动兼容性待补强'],
          },
          causeAnalysis: [
            {
              issue: '部分构建环境缺依赖',
              rootCause: 'CI 缓存失效',
              category: '主观流程',
            },
          ],
          insightAndAction: {
            principles: ['所有 release 构建前必须先跑 verify-gates.sh'],
            actionItems: [
              { action: '锁死 Docker 基础镜像版本', owner: 'DevOps', deadline: '周三' },
            ],
          },
        },
      },
    };

    const md = formatTemplateMarkdown(meeting);
    expect(md).toContain('【GRAI 模板】');
    expect(md).toContain('### G - 目标回顾 (Goal)');
    expect(md).toContain('### R - 结果评估 (Result)');
    expect(md).toContain('### A - 原因深挖 (Analysis)');
    expect(md).toContain('### I - 规律与闭环行动 (Insight)');
    expect(md).toContain('所有 release 构建前必须先跑 verify-gates.sh');
  });

  it('针对 cornell 模板应生成线索提示与主笔记对照的 Markdown', () => {
    const meeting: HistoryMeeting = {
      ...baseMeeting,
      templateId: 'cornell',
      structuredSummary: {
        suggestedTitle: '大模型系统架构专题研讨',
        overview: '关于 Local-First 与云端协同的学习笔记。',
        decisions: [],
        actions: [],
        risks: [],
        facts: [],
        templatePayload: {
          cueColumn: [{ cueId: 'c1', cueText: '为什么必须保持 Zero-Content 数据主权？' }],
          notesColumn: [
            { noteId: 'n1', correspondingCueId: 'c1', content: '会议录音与逐字稿涉及高度商业机密，泄露将产生不可挽回的法律与声誉危机。' },
          ],
          summaryArea: '本地闭环是保护用户隐私的终极防线，一切云端功能只能作为可选的增援模式。',
        },
      },
    };

    const md = formatTemplateMarkdown(meeting);
    expect(md).toContain('【康奈尔笔记模板】');
    expect(md).toContain('## 📌 线索与主笔记栏 (Cues & Notes)');
    expect(md).toContain('为什么必须保持 Zero-Content 数据主权？');
    expect(md).toContain('## 💡 底部浓缩精粹 (Summary)');
    expect(md).toContain('本地闭环是保护用户隐私的终极防线');
  });

  it('针对未填写 templatePayload 的情况应能安全优雅降级', () => {
    const meeting: HistoryMeeting = {
      ...baseMeeting,
      templateId: 'executive_brief',
      structuredSummary: {
        suggestedTitle: '常规周会',
        overview: '常规业务沟通。',
        decisions: [{ title: '通过提案', content: '全员表决同意' }],
        actions: [{ title: '准备发版', assignee: '开发', dueDate: '明天' }],
        risks: [],
        facts: [],
      },
    };

    const md = formatTemplateMarkdown(meeting);
    expect(md).toContain('# 常规周会');
    expect(md).toContain('通过提案');
    expect(md).toContain('准备发版');
  });
});
