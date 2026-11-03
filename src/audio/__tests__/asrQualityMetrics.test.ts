import { describe, expect, it } from 'vitest';
import { characterErrorRate, changedCharacters } from '../../../scripts/evaluate-asr-quality';

describe('014 本地评测不输出正文', () => {
  it('CER按Unicode字符计算并对空参考给出明确边界', () => {
    expect(characterErrorRate('你好😀', '你好')).toBeCloseTo(1 / 3);
    expect(characterErrorRate('', '')).toBe(0);
    expect(characterErrorRate('', '多')).toBeNull();
  });
  it('回改计数不把纯追加当作改写', () => {
    expect(changedCharacters('确认周五', '确认周五上线')).toBe(0);
    expect(changedCharacters('确认周五', '确认周一')).toBe(1);
    expect(changedCharacters('确认周五', '确认')).toBe(2);
  });
});
