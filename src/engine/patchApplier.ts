import { InsightCard, RevisionProposal } from '../types/meeting';

export type PatchOp = 'add' | 'update' | 'retract';

export interface InsightPatch {
  op: PatchOp;
  card?: Omit<InsightCard, 'isConfirmed' | 'isEdited'>;
  targetId?: string;
  title?: string;
  content?: string;
  timestamp?: string;
  evidenceSegmentId?: string;
  reason?: string;
}

export class InsightPatchApplier {
  public apply(currentCards: InsightCard[], patch: InsightPatch): InsightCard[] {
    switch (patch.op) {
      case 'add': {
        if (!patch.card) return currentCards;
        const newCard: InsightCard = {
          ...patch.card,
          isConfirmed: false,
          isEdited: false,
        };
        return [...currentCards, newCard];
      }

      case 'update': {
        if (!patch.targetId) return currentCards;

        return currentCards.map((card) => {
          if (card.id !== patch.targetId) return card;

          // 核心铁律（不可覆盖的人工编辑保护 Human Protection）：
          // 已确认或经人工手动编辑的洞察卡片，即使后续 ASR 文本产生冲突事实，也严禁原地算法覆盖
          if (card.isConfirmed || card.isEdited) {
            const revision: RevisionProposal = {
              id: `rev-${Date.now()}`,
              proposedText: patch.content || card.content,
              reason: patch.reason || '后续讨论事实更新',
              timestamp: patch.timestamp || card.timestamp,
              evidenceSegmentId: patch.evidenceSegmentId || card.evidenceSegmentId,
            };
            return {
              ...card,
              pendingRevision: revision,
            };
          }

          // 未确认卡片：允许算法增量合并与润色
          return {
            ...card,
            title: patch.title || card.title,
            content: patch.content || card.content,
            timestamp: patch.timestamp || card.timestamp,
            evidenceSegmentId: patch.evidenceSegmentId || card.evidenceSegmentId,
          };
        });
      }

      case 'retract': {
        if (!patch.targetId) return currentCards;
        return currentCards.filter((c) => c.id !== patch.targetId);
      }

      default:
        return currentCards;
    }
  }
}
