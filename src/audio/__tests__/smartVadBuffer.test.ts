import { describe, it, expect, vi } from 'vitest';
import { SmartVadBuffer } from '../smartVadBuffer';

describe('SmartVadBuffer - 智能 VAD 语音断句切片缓冲区 (TDD)', () => {
  it('初始状态应为空，且 getBufferedDurationMs() 为 0', () => {
    const buffer = new SmartVadBuffer();
    expect(buffer.getBufferedBytes()).toBe(0);
    expect(buffer.getBufferedDurationMs()).toBe(0);
  });

  it('输入纯静音音频块时，不应误触发短句就绪回调', () => {
    const onSegment = vi.fn();
    const buffer = new SmartVadBuffer({
      onSegmentReady: onSegment,
      energyThreshold: 200, // 能量阈值
      silenceDurationMs: 400,
    });

    // 构造 1 秒 16kHz 16-bit 单声道纯静音 (32000 字节，全 0)
    const silentChunk = new Uint8Array(32000);
    buffer.appendChunk(silentChunk);

    expect(onSegment).not.toHaveBeenCalled();
    // 纯静音未达说话门限，不作为独立段落提交
  });

  it('说话后遇到自然停顿（静音超过 500ms），应触发整句自然切片回调 (T01)', () => {
    const segments: Uint8Array[] = [];
    const buffer = new SmartVadBuffer({
      onSegmentReady: (pcm) => segments.push(pcm),
      energyThreshold: 150,
      silenceDurationMs: 500,
      minSpeechDurationMs: 1000,
    });

    // 1. 模拟 1.5 秒人声（高幅值 PCM 数据）
    // 16kHz * 2 bytes = 32000 bytes/sec -> 1.5s = 48000 bytes
    const speechChunk = new Uint8Array(48000);
    const view = new DataView(speechChunk.buffer);
    for (let i = 0; i < 48000; i += 2) {
      view.setInt16(i, 2000, true); // 振幅 2000
    }
    buffer.appendChunk(speechChunk);

    // 此时说话中，尚未停顿，不应触发切片
    expect(segments.length).toBe(0);

    // 2. 模拟 600ms 自然停顿静音（0.6s * 32000 = 19200 bytes）
    const silenceChunk = new Uint8Array(19200);
    buffer.appendChunk(silenceChunk);

    // 停顿超过 500ms 且人声长度已达标，应触发整句自然切片
    expect(segments.length).toBe(1);
    expect(segments[0].length).toBeGreaterThanOrEqual(48000);
  });

  it('当人声过长不换气达到 maxDurationMs 时，应强制安全切片保证时效', () => {
    const segments: Uint8Array[] = [];
    const buffer = new SmartVadBuffer({
      onSegmentReady: (pcm) => segments.push(pcm),
      maxDurationMs: 5000, // 最大 5 秒
    });

    // 模拟持续 6 秒人声
    const longSpeech = new Uint8Array(32000 * 6);
    const view = new DataView(longSpeech.buffer);
    for (let i = 0; i < longSpeech.length; i += 2) {
      view.setInt16(i, 1800, true);
    }

    buffer.appendChunk(longSpeech);

    // 必须被强制切片至少 1 次
    expect(segments.length).toBeGreaterThanOrEqual(1);
  });

  it('调用 flush() 时应强制将缓冲区所有残留人声音频排空', () => {
    const segments: Uint8Array[] = [];
    const buffer = new SmartVadBuffer({
      onSegmentReady: (pcm) => segments.push(pcm),
    });

    const speechChunk = new Uint8Array(32000); // 1s
    const view = new DataView(speechChunk.buffer);
    for (let i = 0; i < 32000; i += 2) {
      view.setInt16(i, 1500, true);
    }

    buffer.appendChunk(speechChunk);
    expect(segments.length).toBe(0);

    const flushed = buffer.flush();
    expect(flushed).toBeDefined();
    expect(flushed!.length).toBeGreaterThanOrEqual(32000);
  });
});
