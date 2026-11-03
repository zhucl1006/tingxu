import { describe, expect, it } from 'vitest';
import { InterimTextStabilizer } from '../interimTextStabilizer';

describe('014 较稳定前缀只是展示策略', () => {
  it('需重复且达到时间窗，尾部可变', () => {
    const s = new InterimTextStabilizer();
    expect(s.update('确认周五', 0)).toEqual({ stable: '', unstable: '确认周五' });
    s.update('确认周五', 200);
    expect(s.update('确认周五上线', 400)).toEqual({ stable: '确认周五', unstable: '上线' });
  });
  it('允许推翻较稳定前缀、改短及Unicode，不冻结错字', () => {
    const s = new InterimTextStabilizer();
    s.update('确认周五', 0); s.update('确认周五', 400);
    expect(s.update('确认周一', 600)).toEqual({ stable: '确认周', unstable: '一' });
    expect(s.update('确', 800)).toEqual({ stable: '确', unstable: '' });
    s.reset();
    expect(s.update('😀好', 1000)).toEqual({ stable: '', unstable: '😀好' });
  });
});
