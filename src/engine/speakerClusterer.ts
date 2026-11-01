/**
 * 听序（Tingxu）— 会内在线声纹聚类器（Online Speaker Clusterer）
 *
 * 负责在单麦克风多人混合收音场景下：
 * 1. 基于 192 维声纹嵌入向量与已有说话人聚类质心计算余弦相似度；
 * 2. 若相似度 >= 阈值（默认 0.62）则归入已有说话人并按语音时长加权更新质心；
 * 3. 若相似度低于阈值且句子有效时长 >= 1.2s，则自动创建新的说话人聚类（发言人 1 / 发言人 2 / ...）；
 * 4. 极短句（< 1.2s）或无有效声纹时继承上一位说话人，防止短促应答引发虚假分裂；
 * 5. 支持按稳定 `speakerId` 重命名并在后续命中时自动沿用用户指定的真实姓名。
 */

import { cosineSimilarity, l2Normalize } from '../audio/speakerEmbeddingEngine';

export interface SpeakerClusterNode {
  speakerId: string;
  displayName: string;
  colorIndex: number;
  centroid: number[];
  totalDurationMs: number;
  segmentCount: number;
  lastConfidence: number;
}

export interface SpeakerClustererOptions {
  similarityThreshold?: number;
  minClusterDurationMs?: number;
  maxSpeakers?: number;
}

export interface AssignSpeakerInput {
  embedding?: number[] | null;
  durationMs?: number;
  upstreamSpeakerId?: string | null;
}

export interface AssignSpeakerResult {
  speakerId: string;
  displayName: string;
  colorIndex: number;
  confidence: number;
  isNewSpeaker: boolean;
}

export class OnlineSpeakerClusterer {
  private readonly similarityThreshold: number;
  private readonly minClusterDurationMs: number;
  private readonly maxSpeakers: number;
  private clusters: SpeakerClusterNode[] = [];
  private lastAssignedSpeakerId: string | null = null;

  constructor(options?: SpeakerClustererOptions) {
    this.similarityThreshold = options?.similarityThreshold ?? 0.62;
    this.minClusterDurationMs = options?.minClusterDurationMs ?? 1200;
    this.maxSpeakers = options?.maxSpeakers ?? 12;
  }

  public assign(input: AssignSpeakerInput): AssignSpeakerResult {
    const durationMs = Math.max(200, input.durationMs ?? 1500);

    // 1. 若上游 ASR 已显式提供 speakerId（例如 spk_1 / spk_2）
    if (input.upstreamSpeakerId) {
      const existing = this.clusters.find((c) => c.speakerId === input.upstreamSpeakerId);
      if (existing) {
        if (input.embedding && input.embedding.length > 0) {
          this.updateCentroid(existing, input.embedding, durationMs);
        }
        existing.segmentCount += 1;
        this.lastAssignedSpeakerId = existing.speakerId;
        return {
          speakerId: existing.speakerId,
          displayName: existing.displayName,
          colorIndex: existing.colorIndex,
          confidence: existing.lastConfidence,
          isNewSpeaker: false,
        };
      }

      const parsedIdx = Number(input.upstreamSpeakerId.replace(/^spk_/, ''));
      const speakerIndex = Number.isFinite(parsedIdx) && parsedIdx > 0 ? parsedIdx : this.clusters.length + 1;
      const newCluster: SpeakerClusterNode = {
        speakerId: input.upstreamSpeakerId,
        displayName: `发言人 ${speakerIndex}`,
        colorIndex: (speakerIndex - 1) % 6,
        centroid: input.embedding && input.embedding.length > 0 ? l2Normalize(input.embedding) : [],
        totalDurationMs: durationMs,
        segmentCount: 1,
        lastConfidence: 0.95,
      };
      this.clusters.push(newCluster);
      this.lastAssignedSpeakerId = newCluster.speakerId;
      return {
        speakerId: newCluster.speakerId,
        displayName: newCluster.displayName,
        colorIndex: newCluster.colorIndex,
        confidence: newCluster.lastConfidence,
        isNewSpeaker: true,
      };
    }

    // 2. 若无有效声纹或句子过短，继承上一位说话人（若尚无任何说话人则初始化发言人 1）
    const hasValidEmbedding = Array.isArray(input.embedding) && input.embedding.length > 0;
    if (!hasValidEmbedding || (durationMs < this.minClusterDurationMs && this.clusters.length > 0)) {
      if (this.clusters.length === 0) {
        return this.createNewCluster(
          hasValidEmbedding ? (input.embedding as number[]) : [],
          durationMs,
          0.85
        );
      }

      // 如果有 embedding，看是否与某个已有聚类高度吻合；否则继承最近一位说话人
      if (hasValidEmbedding) {
        const best = this.findBestMatch(input.embedding as number[]);
        if (best && best.similarity >= this.similarityThreshold) {
          best.cluster.segmentCount += 1;
          best.cluster.lastConfidence = Number(Math.min(0.99, Math.max(0.6, best.similarity)).toFixed(2));
          this.lastAssignedSpeakerId = best.cluster.speakerId;
          return {
            speakerId: best.cluster.speakerId,
            displayName: best.cluster.displayName,
            colorIndex: best.cluster.colorIndex,
            confidence: best.cluster.lastConfidence,
            isNewSpeaker: false,
          };
        }
      }

      const fallback =
        this.clusters.find((c) => c.speakerId === this.lastAssignedSpeakerId) ||
        this.clusters[this.clusters.length - 1];
      fallback.segmentCount += 1;
      return {
        speakerId: fallback.speakerId,
        displayName: fallback.displayName,
        colorIndex: fallback.colorIndex,
        confidence: fallback.lastConfidence,
        isNewSpeaker: false,
      };
    }

    const embedding = l2Normalize(input.embedding as number[]);

    // 3. 首位说话人直接创建 spk_1
    if (this.clusters.length === 0) {
      return this.createNewCluster(embedding, durationMs, 0.94);
    }

    // 4. 与已有说话人质心比对余弦相似度
    const best = this.findBestMatch(embedding);
    if (best && (best.similarity >= this.similarityThreshold || this.clusters.length >= this.maxSpeakers)) {
      this.updateCentroid(best.cluster, embedding, durationMs);
      best.cluster.segmentCount += 1;
      best.cluster.lastConfidence = Number(Math.min(0.99, Math.max(0.55, best.similarity)).toFixed(2));
      this.lastAssignedSpeakerId = best.cluster.speakerId;
      return {
        speakerId: best.cluster.speakerId,
        displayName: best.cluster.displayName,
        colorIndex: best.cluster.colorIndex,
        confidence: best.cluster.lastConfidence,
        isNewSpeaker: false,
      };
    }

    // 5. 低于阈值且时长充足 -> 创建新说话人
    return this.createNewCluster(embedding, durationMs, 0.9);
  }

  public renameSpeaker(speakerIdOrOldName: string, newName: string): void {
    const clean = newName.trim();
    if (!clean) return;
    for (const c of this.clusters) {
      if (c.speakerId === speakerIdOrOldName || c.displayName === speakerIdOrOldName) {
        c.displayName = clean;
      }
    }
  }

  public getSpeakers(): SpeakerClusterNode[] {
    return this.clusters.map((c) => ({ ...c, centroid: [...c.centroid] }));
  }

  public reset(): void {
    this.clusters = [];
    this.lastAssignedSpeakerId = null;
  }

  private findBestMatch(embedding: number[]): { cluster: SpeakerClusterNode; similarity: number } | null {
    let bestCluster: SpeakerClusterNode | null = null;
    let bestSim = -1;

    for (const cluster of this.clusters) {
      if (cluster.centroid.length === 0) continue;
      const sim = cosineSimilarity(embedding, cluster.centroid);
      if (sim > bestSim) {
        bestSim = sim;
        bestCluster = cluster;
      }
    }

    if (!bestCluster) return null;
    return { cluster: bestCluster, similarity: bestSim };
  }

  private updateCentroid(cluster: SpeakerClusterNode, newEmbedding: number[], durationMs: number): void {
    if (cluster.centroid.length === 0) {
      cluster.centroid = l2Normalize(newEmbedding);
      cluster.totalDurationMs += durationMs;
      return;
    }

    const oldWeight = Math.max(500, cluster.totalDurationMs);
    const addWeight = Math.min(4000, Math.max(400, durationMs));
    const totalWeight = oldWeight + addWeight;
    const merged = cluster.centroid.map(
      (val, idx) => (val * oldWeight + (newEmbedding[idx] ?? 0) * addWeight) / totalWeight
    );
    cluster.centroid = l2Normalize(merged);
    cluster.totalDurationMs += durationMs;
  }

  private createNewCluster(
    embedding: number[],
    durationMs: number,
    initialConfidence: number
  ): AssignSpeakerResult {
    const index = this.clusters.length + 1;
    const speakerId = `spk_${index}`;
    const displayName = `发言人 ${index}`;
    const colorIndex = (index - 1) % 6;

    const node: SpeakerClusterNode = {
      speakerId,
      displayName,
      colorIndex,
      centroid: embedding.length > 0 ? l2Normalize(embedding) : [],
      totalDurationMs: durationMs,
      segmentCount: 1,
      lastConfidence: initialConfidence,
    };

    this.clusters.push(node);
    this.lastAssignedSpeakerId = speakerId;

    return {
      speakerId,
      displayName,
      colorIndex,
      confidence: initialConfidence,
      isNewSpeaker: true,
    };
  }
}
