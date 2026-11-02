/**
 * 听序（Tingxu）— 会内在线声纹聚类与跨会议声纹匹配器（Online Speaker Clusterer & Voiceprint Matcher）
 *
 * 负责在单麦克风多人混合收音场景下：
 * 1. 基于 192 维声纹嵌入向量与已有说话人聚类质心计算余弦相似度；
 * 2. 若相似度 >= 阈值（默认 0.62）则归入已有说话人并按语音时长加权更新质心；
 * 3. 若相似度低于阈值且句子有效时长 >= 1.2s，则自动创建新的说话人聚类（发言人 1 / 发言人 2 / ...）；
 * 4. 极短句（< 1.2s）或无有效声纹时继承上一位说话人，防止短促应答引发虚假分裂；
 * 5. 支持按稳定 `speakerId` 重命名并在后续命中时自动沿用用户指定的真实姓名；
 * 6. 第二阶段跨会议声纹匹配（T10）：与本地已授权声纹档案比对（要求 top1 >= 0.72 且 top1 - top2 >= 0.06），
 *    单句首次命中仅标记为待确认候选（“可能是 X”），连续 2 句命中或用户点击确认后才正式绑定档案姓名。
 */

import { cosineSimilarity, l2Normalize } from '../audio/speakerEmbeddingEngine';

export interface KnownVoiceprintProfile {
  profileId: string;
  displayName: string;
  embedding: number[];
}

export interface SpeakerClusterNode {
  speakerId: string;
  displayName: string;
  colorIndex: number;
  centroid: number[];
  totalDurationMs: number;
  segmentCount: number;
  lastConfidence: number;
  matchedProfileId: string | null;
  tentativeProfileId: string | null;
  tentativeProfileName: string | null;
  tentativeStreak: number;
  rejectedProfileIds: string[];
}

export interface SpeakerClustererOptions {
  similarityThreshold?: number;
  continuityThreshold?: number;
  minClusterDurationMs?: number;
  maxSpeakers?: number;
  profileMatchThreshold?: number;
  profileMarginThreshold?: number;
  requiredConsecutiveMatches?: number;
}

export interface AssignSpeakerInput {
  embedding?: number[] | null;
  durationMs?: number;
  upstreamSpeakerId?: string | null;
  knownProfiles?: KnownVoiceprintProfile[];
}

export interface AssignSpeakerResult {
  speakerId: string;
  displayName: string;
  colorIndex: number;
  confidence: number;
  isNewSpeaker: boolean;
  matchedProfileId: string | null;
  tentativeProfileId: string | null;
  tentativeProfileName: string | null;
  autoMatchedJustNow: boolean;
}

export class OnlineSpeakerClusterer {
  private similarityThreshold: number;
  private continuityThreshold: number;
  private minClusterDurationMs: number;
  private maxSpeakers: number;
  private profileMatchThreshold: number;
  private profileMarginThreshold: number;
  private requiredConsecutiveMatches: number;
  private clusters: SpeakerClusterNode[] = [];
  private lastAssignedSpeakerId: string | null = null;

  constructor(options?: SpeakerClustererOptions) {
    this.similarityThreshold = options?.similarityThreshold ?? 0.58;
    this.continuityThreshold = options?.continuityThreshold ?? 0.48;
    this.minClusterDurationMs = options?.minClusterDurationMs ?? 1200;
    this.maxSpeakers = options?.maxSpeakers ?? 12;
    this.profileMatchThreshold = options?.profileMatchThreshold ?? 0.72;
    this.profileMarginThreshold = options?.profileMarginThreshold ?? 0.06;
    this.requiredConsecutiveMatches = options?.requiredConsecutiveMatches ?? 2;
  }

  public updateOptions(options: Partial<SpeakerClustererOptions>): void {
    if (typeof options.similarityThreshold === 'number') {
      this.similarityThreshold = options.similarityThreshold;
    }
    if (typeof options.continuityThreshold === 'number') {
      this.continuityThreshold = options.continuityThreshold;
    }
    if (typeof options.minClusterDurationMs === 'number') {
      this.minClusterDurationMs = options.minClusterDurationMs;
    }
    if (typeof options.maxSpeakers === 'number') {
      this.maxSpeakers = options.maxSpeakers;
    }
    if (typeof options.profileMatchThreshold === 'number') {
      this.profileMatchThreshold = options.profileMatchThreshold;
    }
    if (typeof options.profileMarginThreshold === 'number') {
      this.profileMarginThreshold = options.profileMarginThreshold;
    }
    if (typeof options.requiredConsecutiveMatches === 'number') {
      this.requiredConsecutiveMatches = options.requiredConsecutiveMatches;
    }
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
        const autoMatched = this.evaluateProfileMatching(existing, input.embedding, input.knownProfiles);
        return this.buildResult(existing, false, autoMatched);
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
        matchedProfileId: null,
        tentativeProfileId: null,
        tentativeProfileName: null,
        tentativeStreak: 0,
        rejectedProfileIds: [],
      };
      this.clusters.push(newCluster);
      this.lastAssignedSpeakerId = newCluster.speakerId;
      const autoMatched = this.evaluateProfileMatching(newCluster, input.embedding, input.knownProfiles);
      return this.buildResult(newCluster, true, autoMatched);
    }

    // 2. 若无有效声纹或句子过短，继承上一位说话人（若尚无任何说话人则初始化发言人 1）
    const hasValidEmbedding = Array.isArray(input.embedding) && input.embedding.length > 0;
    if (!hasValidEmbedding || (durationMs < this.minClusterDurationMs && this.clusters.length > 0)) {
      if (this.clusters.length === 0) {
        return this.createNewCluster(
          hasValidEmbedding ? (input.embedding as number[]) : [],
          durationMs,
          0.85,
          input.knownProfiles
        );
      }

      if (hasValidEmbedding) {
        const best = this.findBestMatch(input.embedding as number[]);
        if (best && best.similarity >= this.similarityThreshold) {
          best.cluster.segmentCount += 1;
          best.cluster.lastConfidence = Number(Math.min(0.99, Math.max(0.6, best.similarity)).toFixed(2));
          this.lastAssignedSpeakerId = best.cluster.speakerId;
          const autoMatched = this.evaluateProfileMatching(
            best.cluster,
            input.embedding,
            input.knownProfiles
          );
          return this.buildResult(best.cluster, false, autoMatched);
        }
      }

      const fallback =
        this.clusters.find((c) => c.speakerId === this.lastAssignedSpeakerId) ||
        this.clusters[this.clusters.length - 1];
      fallback.segmentCount += 1;
      return this.buildResult(fallback, false, false);
    }

    const embedding = l2Normalize(input.embedding as number[]);

    // 3. 首位说话人直接创建 spk_1
    if (this.clusters.length === 0) {
      return this.createNewCluster(embedding, durationMs, 0.94, input.knownProfiles);
    }

    // 4. 与已有说话人质心比对余弦相似度（具备发言人连续性阻尼）
    const best = this.findBestMatch(embedding);
    const isContinuityMatch =
      best &&
      best.cluster.speakerId === this.lastAssignedSpeakerId &&
      best.similarity >= this.continuityThreshold;

    if (
      best &&
      (best.similarity >= this.similarityThreshold ||
        isContinuityMatch ||
        this.clusters.length >= this.maxSpeakers)
    ) {
      this.updateCentroid(best.cluster, embedding, durationMs);
      best.cluster.segmentCount += 1;
      best.cluster.lastConfidence = Number(Math.min(0.99, Math.max(0.55, best.similarity)).toFixed(2));
      this.lastAssignedSpeakerId = best.cluster.speakerId;
      const autoMatched = this.evaluateProfileMatching(best.cluster, embedding, input.knownProfiles);
      return this.buildResult(best.cluster, false, autoMatched);
    }

    // 5. 低于阈值且时长充足 -> 创建新说话人
    return this.createNewCluster(embedding, durationMs, 0.9, input.knownProfiles);
  }

  public renameSpeaker(speakerIdOrOldName: string, newName: string): void {
    const clean = newName.trim();
    if (!clean) return;
    for (const c of this.clusters) {
      if (c.speakerId === speakerIdOrOldName || c.displayName === speakerIdOrOldName) {
        c.displayName = clean;
        c.tentativeProfileId = null;
        c.tentativeProfileName = null;
        c.tentativeStreak = 0;
      }
    }
  }

  /**
   * 用户手动确认声纹候选（“确认是 张总”）
   */
  public confirmProfileMatch(speakerId: string, profileId: string, displayName: string): void {
    const cluster = this.clusters.find((c) => c.speakerId === speakerId);
    if (!cluster) return;
    cluster.matchedProfileId = profileId;
    cluster.displayName = displayName.trim() || cluster.displayName;
    cluster.tentativeProfileId = null;
    cluster.tentativeProfileName = null;
    cluster.tentativeStreak = 0;
  }

  /**
   * 用户手动否认声纹候选（“不是 张总”），后续该说话人聚类不再匹配该档案
   */
  public rejectProfileMatch(speakerId: string, profileId: string): void {
    const cluster = this.clusters.find((c) => c.speakerId === speakerId);
    if (!cluster) return;
    if (!cluster.rejectedProfileIds.includes(profileId)) {
      cluster.rejectedProfileIds.push(profileId);
    }
    if (cluster.tentativeProfileId === profileId) {
      cluster.tentativeProfileId = null;
      cluster.tentativeProfileName = null;
      cluster.tentativeStreak = 0;
    }
  }

  /**
   * 获取指定说话人聚类的质心向量与累积有效语音时长（用于注册声纹档案）
   */
  public getClusterVoiceprint(speakerId: string): { centroid: number[]; totalDurationMs: number } | null {
    const cluster = this.clusters.find((c) => c.speakerId === speakerId);
    if (!cluster || cluster.centroid.length === 0) return null;
    return {
      centroid: [...cluster.centroid],
      totalDurationMs: cluster.totalDurationMs,
    };
  }

  public getSpeakers(): SpeakerClusterNode[] {
    return this.clusters.map((c) => ({
      ...c,
      centroid: [...c.centroid],
      rejectedProfileIds: [...c.rejectedProfileIds],
    }));
  }

  public reset(): void {
    this.clusters = [];
    this.lastAssignedSpeakerId = null;
  }

  private evaluateProfileMatching(
    cluster: SpeakerClusterNode,
    sentenceEmbedding?: number[] | null,
    knownProfiles?: KnownVoiceprintProfile[]
  ): boolean {
    if (cluster.matchedProfileId) return false;
    if (!knownProfiles || knownProfiles.length === 0) return false;

    const queryVec =
      sentenceEmbedding && sentenceEmbedding.length > 0 ? sentenceEmbedding : cluster.centroid;
    if (!queryVec || queryVec.length === 0) return false;

    const candidates = knownProfiles.filter(
      (p) => !cluster.rejectedProfileIds.includes(p.profileId) && p.embedding.length > 0
    );
    if (candidates.length === 0) {
      cluster.tentativeProfileId = null;
      cluster.tentativeProfileName = null;
      cluster.tentativeStreak = 0;
      return false;
    }

    let top1: { profile: KnownVoiceprintProfile; score: number } | null = null;
    let top2Score = 0;

    for (const prof of candidates) {
      const sim = cosineSimilarity(queryVec, prof.embedding);
      if (!top1 || sim > top1.score) {
        if (top1) top2Score = top1.score;
        top1 = { profile: prof, score: sim };
      } else if (sim > top2Score) {
        top2Score = sim;
      }
    }

    if (!top1) return false;
    const margin = top1.score - Math.max(0, top2Score);

    if (top1.score >= this.profileMatchThreshold && margin >= this.profileMarginThreshold) {
      if (cluster.tentativeProfileId === top1.profile.profileId) {
        cluster.tentativeStreak += 1;
      } else {
        cluster.tentativeProfileId = top1.profile.profileId;
        cluster.tentativeProfileName = top1.profile.displayName;
        cluster.tentativeStreak = 1;
      }

      cluster.lastConfidence = Number(Math.min(0.99, Math.max(cluster.lastConfidence, top1.score)).toFixed(2));

      if (cluster.tentativeStreak >= this.requiredConsecutiveMatches) {
        cluster.matchedProfileId = top1.profile.profileId;
        cluster.displayName = top1.profile.displayName;
        cluster.tentativeProfileId = null;
        cluster.tentativeProfileName = null;
        cluster.tentativeStreak = 0;
        return true;
      }
    } else {
      cluster.tentativeProfileId = null;
      cluster.tentativeProfileName = null;
      cluster.tentativeStreak = 0;
    }

    return false;
  }

  private buildResult(
    cluster: SpeakerClusterNode,
    isNewSpeaker: boolean,
    autoMatchedJustNow: boolean
  ): AssignSpeakerResult {
    return {
      speakerId: cluster.speakerId,
      displayName: cluster.displayName,
      colorIndex: cluster.colorIndex,
      confidence: cluster.lastConfidence,
      isNewSpeaker,
      matchedProfileId: cluster.matchedProfileId,
      tentativeProfileId: cluster.tentativeProfileId,
      tentativeProfileName: cluster.tentativeProfileName,
      autoMatchedJustNow,
    };
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
    initialConfidence: number,
    knownProfiles?: KnownVoiceprintProfile[]
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
      matchedProfileId: null,
      tentativeProfileId: null,
      tentativeProfileName: null,
      tentativeStreak: 0,
      rejectedProfileIds: [],
    };

    this.clusters.push(node);
    this.lastAssignedSpeakerId = speakerId;
    const autoMatched = this.evaluateProfileMatching(node, embedding, knownProfiles);

    return this.buildResult(node, true, autoMatched);
  }
}
