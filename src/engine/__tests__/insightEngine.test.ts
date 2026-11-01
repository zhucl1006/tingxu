import { describe, it, expect, beforeEach } from 'vitest';
import { SlidingWindowAccumulator } from '../slidingWindow';
import { InsightPatchApplier, InsightPatch } from '../patchApplier';
import { InMeetingQaEngine } from '../qaEngine';
import { InsightCard, TranscriptSegment } from '../../types/meeting';

describe('Plan 006: 会中实时洞察与本场问答流水线 (TDD)', () => {
  describe('SlidingWindowAccumulator - 滑动窗口调度器', () => {
    let accumulator: SlidingWindowAccumulator;

    beforeEach(() => {
      accumulator = new SlidingWindowAccumulator({ minCharsThreshold: 100, maxSilenceSeconds: 45 });
    });

    it('累积字符未达阈值时不会触发窗口调度', () => {
      const seg: TranscriptSegment = {
        id: 's-1',
        speaker: '我方',
        channel: 'mic',
        timestamp: '00:00:10',
        text: '简短的一句话发言。',
      };
      const triggered = accumulator.appendSegment(seg, 10);
      expect(triggered).toBeNull();
      expect(accumulator.getPendingCharCount()).toBe(seg.text.length);
    });

    it('累积字符达到阈值时触发滑动窗口并输出调度切片', () => {
      const longText = '这是一段详细的架构设计讨论。'.repeat(10); // 140 字 > 100 阈值
      const seg: TranscriptSegment = {
        id: 's-2',
        speaker: '远端',
        channel: 'system',
        timestamp: '00:00:30',
        text: longText,
      };
      const windowPayload = accumulator.appendSegment(seg, 30);
      expect(windowPayload).not.toBeNull();
      expect(windowPayload?.segments).toHaveLength(1);
      expect(windowPayload?.combinedText).toContain('架构设计讨论');
      expect(accumulator.getPendingCharCount()).toBeLessThan(50); // 保留少量重叠重绘上下文
    });

    it('未达字符阈值但周期性时间窗口到达时，flush 能成功输出增量切片', () => {
      const seg: TranscriptSegment = {
        id: 's-3',
        speaker: '朱总',
        channel: 'mic',
        timestamp: '00:00:20',
        text: '我们今天开会重点对一下整个客户端的洞察总结功能。', // 26 字
      };
      accumulator.appendSegment(seg, 20);
      expect(accumulator.getPendingCharCount()).toBe(seg.text.length);

      // 周期时间窗口到达（如 15 秒定时触发）
      const flushedPayload = accumulator.flush(35, 20);
      expect(flushedPayload).not.toBeNull();
      expect(flushedPayload?.combinedText).toContain('整个客户端的洞察总结功能');
      expect(flushedPayload?.endTimestampSeconds).toBe(35);
    });

    it('缓冲区字符不足最小限制时，flush 返回 null', () => {
      const shortSeg: TranscriptSegment = {
        id: 's-4',
        speaker: '李四',
        channel: 'mic',
        timestamp: '00:00:05',
        text: '嗯好。', // 3 字
      };
      accumulator.appendSegment(shortSeg, 5);
      const flushed = accumulator.flush(20, 20);
      expect(flushed).toBeNull();
    });
  });

  describe('InsightPatchApplier - 结构化增量补丁解析与人工保护', () => {
    let applier: InsightPatchApplier;
    let initialCards: InsightCard[];

    beforeEach(() => {
      applier = new InsightPatchApplier();
      initialCards = [
        {
          id: 'card-1',
          type: 'decision',
          title: '交付排期',
          content: '本周五下班前完成桌面端骨架搭建',
          timestamp: '00:02:15',
          evidenceSegmentId: 'seg-10',
          isConfirmed: false,
          isEdited: false,
        },
      ];
    });

    it('处理 add 补丁：新增卡片并挂载证据', () => {
      const patch: InsightPatch = {
        op: 'add',
        card: {
          id: 'card-2',
          type: 'action',
          title: '配置 ASR 密钥',
          content: '由系统组分配 STS 临时租约',
          timestamp: '00:03:00',
          evidenceSegmentId: 'seg-15',
        },
      };

      const nextCards = applier.apply(initialCards, patch);
      expect(nextCards).toHaveLength(2);
      expect(nextCards.find((c) => c.id === 'card-2')?.title).toBe('配置 ASR 密钥');
    });

    it('处理 update 补丁：未确认卡片允许增量合并与算法更新', () => {
      const patch: InsightPatch = {
        op: 'update',
        targetId: 'card-1',
        title: '交付排期 (已细化)',
        content: '本周五 18:00 前完成桌面端双栏骨架并提交 PR',
        timestamp: '00:04:00',
        evidenceSegmentId: 'seg-22',
      };

      const nextCards = applier.apply(initialCards, patch);
      expect(nextCards).toHaveLength(1);
      expect(nextCards[0].content).toBe('本周五 18:00 前完成桌面端双栏骨架并提交 PR');
      expect(nextCards[0].pendingRevision).toBeUndefined();
    });

    it('铁律测试：已确认卡片严禁原地算法覆盖，强制生成待复核新修订', () => {
      // 模拟用户已确认 card-1
      const confirmedCards: InsightCard[] = [
        {
          ...initialCards[0],
          isConfirmed: true,
        },
      ];

      const conflictingPatch: InsightPatch = {
        op: 'update',
        targetId: 'card-1',
        title: '交付排期',
        content: '因团队请假，延期至下周二完成',
        timestamp: '00:06:00',
        evidenceSegmentId: 'seg-45',
        reason: '后续发言第 45 段提出时间顺延',
      };

      const nextCards = applier.apply(confirmedCards, conflictingPatch);
      const protectedCard = nextCards[0];

      // 原卡片内容绝不被覆盖
      expect(protectedCard.content).toBe('本周五下班前完成桌面端骨架搭建');
      expect(protectedCard.isConfirmed).toBe(true);

      // 强制挂载待复核修订
      expect(protectedCard.pendingRevision).toBeDefined();
      expect(protectedCard.pendingRevision?.proposedText).toBe('因团队请假，延期至下周二完成');
      expect(protectedCard.pendingRevision?.reason).toBe('后续发言第 45 段提出时间顺延');
    });
  });

  describe('InMeetingQaEngine - AI 问一问本场问答与防臆造', () => {
    let qaEngine: InMeetingQaEngine;
    let transcripts: TranscriptSegment[];

    beforeEach(() => {
      qaEngine = new InMeetingQaEngine();
      transcripts = [
        {
          id: 'seg-1',
          speaker: '张经理',
          channel: 'system',
          timestamp: '00:01:00',
          text: '本季度我们的预算上限为 50 万元。',
        },
        {
          id: 'seg-2',
          speaker: '李工',
          channel: 'mic',
          timestamp: '00:02:30',
          text: '好的，我们会严格把控预算与云端 ASR 成本在 10 万元以内。',
        },
      ];
    });

    it('组装问答上下文，包含防臆造严令与完整发言证据', () => {
      const prompt = qaEngine.buildPromptContext('本季度预算是多少？', transcripts);
      expect(prompt).toContain('张经理');
      expect(prompt).toContain('50 万元');
      expect(prompt).toContain('禁止推测臆造');
    });

    it('从逐字稿中精确检索匹配的证据段 ID', () => {
      const matchedEvidences = qaEngine.findEvidenceSegments('预算', transcripts);
      expect(matchedEvidences).toHaveLength(2);
      expect(matchedEvidences[0].id).toBe('seg-1');
      expect(matchedEvidences[1].id).toBe('seg-2');
    });
  });
});
