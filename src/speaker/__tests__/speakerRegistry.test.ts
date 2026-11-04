import { describe, it, expect, beforeEach } from 'vitest';
import { SpeakerRegistry } from '../speakerRegistry';
import type { RegisterSpeakerProfileInput } from '../../types/meeting';

describe('SpeakerRegistry 声纹档案与聚类引擎深度模块测试 (TDD Red -> Green)', () => {
  let registry: SpeakerRegistry;

  beforeEach(() => {
    localStorage.clear();
    registry = new SpeakerRegistry();
  });

  it('未获得声纹授权门禁时，注册声纹应被合规拦截', () => {
    const input: RegisterSpeakerProfileInput = {
      displayName: '张三',
      embedding: [0.1, 0.2, 0.3],
      consented: false,
    };

    const res = registry.registerProfile(input, 'local_default');
    expect(res).toBeNull();
    expect(registry.getProfiles()).toHaveLength(0);
  });

  it('首次授权注册应保存归一化后的声纹向量，并记录授权时间戳', () => {
    const input: RegisterSpeakerProfileInput = {
      displayName: '李四',
      embedding: [0.6, 0.8],
      consented: true,
      sampleDurationMs: 2500,
    };

    const profile = registry.registerProfile(input, 'local_default');
    expect(profile).not.toBeNull();
    expect(profile?.displayName).toBe('李四');
    expect(profile?.embedding).toHaveLength(2);
    // 归一化长度应约为 1.0 (0.6^2 + 0.8^2 = 1.0)
    const norm = Math.sqrt(profile!.embedding[0] ** 2 + profile!.embedding[1] ** 2);
    expect(norm).toBeCloseTo(1.0, 4);

    expect(registry.getProfiles()).toHaveLength(1);
    expect(registry.getConsentAt()).toBeTruthy();
  });

  it('同名再次录入应执行 0.6:0.4 渐进式声纹特征向量融合并累加采样时长', () => {
    registry.grantConsent();

    // 第一次
    registry.registerProfile(
      { displayName: '王五', embedding: [1, 0], consented: true, sampleDurationMs: 2000 },
      'local_default'
    );

    // 第二次
    const updated = registry.registerProfile(
      { displayName: '王五', embedding: [0, 1], consented: true, sampleDurationMs: 3000 },
      'local_default'
    );

    expect(updated).not.toBeNull();
    expect(updated?.sampleDurationMs).toBe(5000);
    expect(registry.getProfiles()).toHaveLength(1);
  });

  it('应能正确通过余弦相似度匹配已知声纹档案', () => {
    registry.grantConsent();
    registry.registerProfile(
      { displayName: '赵六', embedding: [1, 0], consented: true },
      'local_default'
    );

    // 匹配非常相近的向量 [0.99, 0.05]
    const hit = registry.matchProfile([0.99, 0.05], { threshold: 0.7 });
    expect(hit).not.toBeNull();
    expect(hit?.profile.displayName).toBe('赵六');
    expect(hit?.similarity).toBeGreaterThan(0.7);

    // 不匹配正交向量 [0, 1]
    const miss = registry.matchProfile([0, 1], { threshold: 0.7 });
    expect(miss).toBeNull();
  });

  it('支持档案重命名、单条删除与全部清空', () => {
    registry.grantConsent();
    const p1 = registry.registerProfile(
      { displayName: '成员A', embedding: [1, 0], consented: true },
      'local_default'
    )!;

    registry.renameProfile(p1.profileId, '技术负责人');
    expect(registry.getProfiles()[0].displayName).toBe('技术负责人');

    registry.deleteProfile(p1.profileId);
    expect(registry.getProfiles()).toHaveLength(0);
  });
});
