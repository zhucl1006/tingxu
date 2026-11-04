/**
 * 听序（Tingxu）— 端侧声纹档案与聚类注册中心 (SpeakerRegistry)
 *
 * 核心架构定位：
 * 封装声纹 L2 归一化、加权向量融合、余弦相似度阈值判定与显式授权合规门禁。
 * 屏蔽算法细节与持久化写入，使上层会话模块（MeetingSession）免于暴露繁琐的数学计算。
 */

import type {
  SpeakerVoiceprintProfile,
  RegisterSpeakerProfileInput,
} from '../types/meeting';
import { l2Normalize, cosineSimilarity } from '../audio/speakerEmbeddingEngine';
import { getMeetingRepository, MeetingRepository } from '../storage/meetingRepository';

export interface MatchProfileOptions {
  threshold?: number;
}

export interface SpeakerMatchHit {
  profile: SpeakerVoiceprintProfile;
  similarity: number;
}

export class SpeakerRegistry {
  private repository: MeetingRepository;
  private profiles: SpeakerVoiceprintProfile[] = [];
  private consentAt: number | null = null;

  constructor(repository: MeetingRepository = getMeetingRepository()) {
    this.repository = repository;
    this.reload();
  }

  public reload(): void {
    this.profiles = this.repository.getSpeakerProfiles();
    this.consentAt = this.repository.getVoiceprintConsent();
  }

  public getConsentAt(): number | null {
    if (this.consentAt === null) {
      this.consentAt = this.repository.getVoiceprintConsent();
    }
    return this.consentAt;
  }

  public grantConsent(): number {
    const now = Date.now();
    this.consentAt = now;
    this.repository.saveVoiceprintConsent(now);
    return now;
  }

  public getProfiles(): SpeakerVoiceprintProfile[] {
    return this.profiles;
  }

  public registerProfile(
    input: RegisterSpeakerProfileInput,
    accountId = 'local_default'
  ): SpeakerVoiceprintProfile | null {
    const cleanName = input.displayName.trim();
    if (!cleanName || !Array.isArray(input.embedding) || input.embedding.length === 0) {
      return null;
    }

    // 显式授权门禁：consented === false 严禁保存声纹
    if (input.consented === false) {
      return null;
    }

    let consent = this.getConsentAt();
    if (input.consented === true && !consent) {
      consent = this.grantConsent();
    }
    if (!consent) {
      return null;
    }

    const now = Date.now();
    const normalized = l2Normalize(input.embedding);
    const sampleDurationMs = Math.max(1200, input.sampleDurationMs ?? 3000);

    const existingIdx = this.profiles.findIndex(
      (p) => p.accountId === accountId && p.displayName === cleanName
    );

    let savedProfile: SpeakerVoiceprintProfile;

    if (existingIdx >= 0) {
      const prev = this.profiles[existingIdx];
      const mergedVec = l2Normalize(
        prev.embedding.map((v, i) => v * 0.6 + (normalized[i] ?? 0) * 0.4)
      );
      savedProfile = {
        ...prev,
        displayName: cleanName,
        embedding: mergedVec,
        embeddingDim: mergedVec.length,
        sampleDurationMs: prev.sampleDurationMs + sampleDurationMs,
        consentAt: consent,
        lastMatchedAt: now,
      };
      this.profiles = this.profiles.map((p, idx) => (idx === existingIdx ? savedProfile : p));
    } else {
      savedProfile = {
        profileId: `vp_${now}_${Math.random().toString(36).slice(2, 6)}`,
        accountId,
        displayName: cleanName,
        embedding: normalized,
        embeddingDim: normalized.length,
        modelId: 'campplus_zh_en_fp16',
        modelVersion: '1.0',
        sampleDurationMs,
        consentAt: consent,
        createdAt: now,
        lastMatchedAt: now,
      };
      this.profiles = [...this.profiles, savedProfile];
    }

    this.repository.saveSpeakerProfiles(this.profiles);
    return savedProfile;
  }

  public matchProfile(
    embedding: number[],
    options?: MatchProfileOptions
  ): SpeakerMatchHit | null {
    const threshold = options?.threshold ?? 0.72;
    if (!embedding || embedding.length === 0 || this.profiles.length === 0) {
      return null;
    }

    let bestHit: SpeakerMatchHit | null = null;
    for (const p of this.profiles) {
      const sim = cosineSimilarity(embedding, p.embedding);
      if (sim >= threshold && (!bestHit || sim > bestHit.similarity)) {
        bestHit = { profile: p, similarity: sim };
      }
    }

    return bestHit;
  }

  public renameProfile(profileId: string, newName: string): boolean {
    const clean = newName.trim();
    if (!clean) return false;

    let modified = false;
    this.profiles = this.profiles.map((p) => {
      if (p.profileId === profileId) {
        modified = true;
        return { ...p, displayName: clean };
      }
      return p;
    });

    if (modified) {
      this.repository.saveSpeakerProfiles(this.profiles);
    }
    return modified;
  }

  public deleteProfile(profileId: string): boolean {
    const lenBefore = this.profiles.length;
    this.profiles = this.profiles.filter((p) => p.profileId !== profileId);
    if (this.profiles.length !== lenBefore) {
      this.repository.saveSpeakerProfiles(this.profiles);
      return true;
    }
    return false;
  }

  public clearProfiles(): void {
    this.profiles = [];
    this.repository.saveSpeakerProfiles([]);
  }
}

let currentRegistry: SpeakerRegistry = new SpeakerRegistry();

export function getSpeakerRegistry(): SpeakerRegistry {
  return currentRegistry;
}

export function resetSpeakerRegistry(): void {
  currentRegistry = new SpeakerRegistry();
}
