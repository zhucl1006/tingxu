/**
 * 听序（Tingxu）— 全局常驻会议流与洞察管道服务 (MeetingPipelineService)
 * 
 * 核心架构定位：
 * 作为常驻无头（Headless）服务，独立于所有 React 视图组件生命周期。
 * 无论用户切换侧边栏导航、在多个页面间跳转，抑或缩小为桌面微型悬浮药丸（FloatingPill），
 * 录音物理采集、ASR 流式通信、声纹识别与大模型实时洞察均在此服务中持续无缝运行。
 */

import { getLocalRecording } from './localRecording';
import { RealAudioCapture } from './realAudioCapture';
import { RealStreamingAsrClient, streamingAsrUrl } from './realStreamingAsrClient';
import { TranscriptEventState } from './transcriptEventState';
import { InterimTextStabilizer } from './interimTextStabilizer';
import { SentenceAudioBuffer } from './sentenceAudioBuffer';
import { LocalSpeakerEmbeddingEngine } from './speakerEmbeddingEngine';
import { OnlineSpeakerClusterer } from '../engine/speakerClusterer';
import { SlidingWindowAccumulator, WindowPayload } from '../engine/slidingWindow';
import { useMeetingStore } from '../store/useMeetingStore';
import { TranscriptSegment } from '../types/meeting';
import { formatSeconds } from '../utils/formatTime';

export class MeetingPipelineService {
  private activeMeetingId: string | null = null;
  private isRunning: boolean = false;
  private unsubscribeStore: (() => void) | null = null;

  private audioCapture: RealAudioCapture | null = null;
  private asrClient: RealStreamingAsrClient | null = null;
  private sentenceBuffer: SentenceAudioBuffer = new SentenceAudioBuffer();
  private embeddingEngine: LocalSpeakerEmbeddingEngine = new LocalSpeakerEmbeddingEngine();
  private speakerClusterer: OnlineSpeakerClusterer = new OnlineSpeakerClusterer();
  private slidingWindow: SlidingWindowAccumulator = new SlidingWindowAccumulator();

  private windowIntervalTimer: any = null;
  private startPromise: Promise<void> = Promise.resolve();
  private stopPromise: Promise<void> | null = null;
  private drainPromise: Promise<'complete' | 'timeout' | 'error'> | null = null;
  private systemAudioOperation: Promise<void> | null = null;

  /**
   * 启动服务监听，常驻绑定 Store 会议状态
   */
  public attach(): void {
    if (this.unsubscribeStore) return;

    // 初始状态探查
    this.handleStoreState(useMeetingStore.getState());

    // 订阅后续状态变更
    this.unsubscribeStore = useMeetingStore.subscribe((state) => {
      this.handleStoreState(state);
    });
  }

  private handleStoreState(state: ReturnType<typeof useMeetingStore.getState>): void {
    const shouldRun = state.status === 'RECORDING' || state.isDrainingAsr;

    if (shouldRun) {
      if (!this.isRunning || (state.meetingId && this.activeMeetingId !== state.meetingId)) {
        void this.start(state.meetingId || 'mtg_current');
      }
    } else if (!shouldRun && this.isRunning && !state.isDrainingAsr) {
      void this.stop();
    }
  }

  public async start(meetingId: string): Promise<void> {
    if (this.isRunning && this.activeMeetingId === meetingId) return;
    this.isRunning = true;
    this.activeMeetingId = meetingId;
    this.stopPromise = null;
    this.drainPromise = null;

    const store = useMeetingStore.getState();
    const local = getLocalRecording(meetingId, store.currentUser?.token);
    let asrRecordingOffsetMs: number | null = null;
    let asrReady = false;
    let disposed = false;
    let acceptingAudio = true;
    let activeDraftId: string | null = null;
    let draftTimer: ReturnType<typeof setTimeout> | undefined;
    let latestDraft: { text: string; parts: { stable: string; unstable: string } } | null = null;

    const eventState = new TranscriptEventState(crypto.randomUUID());
    const stabilizer = new InterimTextStabilizer();

    const isCurrent = () => !disposed && useMeetingStore.getState().meetingId === meetingId;

    const flushDraft = () => {
      draftTimer = undefined;
      if (!isCurrent() || !latestDraft) return;
      useMeetingStore.getState().setInterimText(latestDraft.text, latestDraft.parts);
    };

    store.setAsrStatus('connecting');
    store.setMicStatus('recording');

    // 1. 初始化流式 ASR 客户端
    let identityQueue = Promise.resolve();
    let queuedIdentities = 0;
    let identityDisabled = false;

    const asrClient = new RealStreamingAsrClient({
      wsUrl: streamingAsrUrl(store.gatewayUrl),
      onTranscriptEvent: (rawEvent) => {
        if (!isCurrent()) return;
        const event = eventState.accept(rawEvent);
        if (!event) return;

        store.setAsrStatus('connected');

        if (event.type === 'INTERIM') {
          const first = activeDraftId !== event.id;
          if (first) {
            stabilizer.reset();
            if (draftTimer) clearTimeout(draftTimer);
            draftTimer = undefined;
          }
          activeDraftId = event.id;
          latestDraft = { text: event.text, parts: stabilizer.update(event.text, performance.now()) };
          if (first) flushDraft();
          else if (!draftTimer) draftTimer = setTimeout(flushDraft, 120);
          return;
        }

        if (activeDraftId === event.id) {
          if (draftTimer) clearTimeout(draftTimer);
          draftTimer = undefined;
          latestDraft = null;
          activeDraftId = null;
          stabilizer.reset();
          useMeetingStore.getState().setInterimText('', { stable: '', unstable: '' });
        }

        const isVoiceprintEnabled = useMeetingStore.getState().voiceprintSettings.enabled;

        const newSeg: TranscriptSegment = {
          id: event.id,
          channel: event.source,
          speaker: isVoiceprintEnabled ? '识别中' : '参会发言',
          speakerStatus: isVoiceprintEnabled ? 'pending' : 'assigned',
          text: event.text,
          beginTimeMs: event.beginTimeMs ?? undefined,
          endTimeMs: event.endTimeMs ?? undefined,
          recordingBeginMs:
            asrRecordingOffsetMs !== null && event.beginTimeMs !== null
              ? asrRecordingOffsetMs + event.beginTimeMs
              : undefined,
          recordingEndMs:
            asrRecordingOffsetMs !== null && event.endTimeMs !== null
              ? asrRecordingOffsetMs + event.endTimeMs
              : undefined,
          timestamp: formatSeconds(
            Math.floor(
              asrRecordingOffsetMs !== null && event.beginTimeMs !== null
                ? (asrRecordingOffsetMs + event.beginTimeMs) / 1000
                : useMeetingStore.getState().elapsedSeconds
            )
          ),
        };

        // 正文立即落稿到全局 Store
        useMeetingStore.getState().addTranscriptSegment(newSeg);

        // 推入滑动窗口并按需提炼洞察
        const windowPayload = this.slidingWindow.appendSegment(
          newSeg,
          useMeetingStore.getState().elapsedSeconds
        );
        if (windowPayload) {
          void this.triggerLiveInsight(windowPayload, meetingId);
        }

        // 默认单轨录音识别模式下不启动声纹提取与聚类队列，防止单麦录音被误切分为机械发言人
        if (!isVoiceprintEnabled) {
          return;
        }

        // 异步声纹特征识别与在线聚类
        const begin = event.beginTimeMs;
        const end = event.endTimeMs;
        const samples =
          begin !== null && end !== null && end > begin
            ? this.sentenceBuffer.sliceByTimeMs(begin, end)
            : new Float32Array(0);
        const durationMs = samples.length / 16;

        if (durationMs < 300 || queuedIdentities >= 16 || identityDisabled) {
          useMeetingStore.getState().updateTranscriptSpeaker(event.id, {
            speaker: '未确定',
            speakerStatus: 'unknown',
          });
          return;
        }

        queuedIdentities++;
        identityQueue = identityQueue.then(async () => {
          if (!isCurrent()) return;
          if (identityDisabled) {
            queuedIdentities--;
            useMeetingStore.getState().updateTranscriptSpeaker(event.id, {
              speaker: '未确定',
              speakerStatus: 'unknown',
            });
            return;
          }

          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const embedding = await Promise.race([
              this.embeddingEngine.embedSamples(samples, 16000),
              new Promise<null>((resolve) => {
                timer = setTimeout(() => {
                  identityDisabled = true;
                  resolve(null);
                }, 2000);
              }),
            ]);

            if (!isCurrent()) return;
            if (!embedding) {
              useMeetingStore.getState().updateTranscriptSpeaker(event.id, {
                speaker: '未确定',
                speakerStatus: 'unknown',
              });
              return;
            }

            const profiles = useMeetingStore.getState().speakerProfiles;
            const assigned = this.speakerClusterer.assign({
              embedding,
              durationMs,
              upstreamSpeakerId: event.sentence?.speakerId,
              knownProfiles: profiles.map((p) => ({
                profileId: p.profileId,
                displayName: p.displayName,
                embedding: p.embedding,
              })),
            });

            if (assigned.autoMatchedJustNow && assigned.matchedProfileId) {
              useMeetingStore.getState().markProfileMatched(assigned.matchedProfileId);
              useMeetingStore.getState().renameSpeaker(assigned.speakerId, assigned.displayName);
            }

            useMeetingStore.getState().updateTranscriptSpeaker(event.id, {
              speaker: assigned.displayName,
              speakerId: assigned.speakerId,
              speakerStatus: 'assigned',
              speakerConfidence: assigned.confidence,
              speakerColorIndex: assigned.colorIndex,
              matchedProfileId: assigned.matchedProfileId,
              tentativeProfileId: assigned.tentativeProfileId,
              tentativeProfileName: assigned.tentativeProfileName,
            });
          } catch {
            if (isCurrent()) {
              useMeetingStore.getState().updateTranscriptSpeaker(event.id, {
                speaker: '未确定',
                speakerStatus: 'unknown',
              });
            }
          } finally {
            if (timer) clearTimeout(timer);
            queuedIdentities--;
          }
        });
      },
      onStatus: (st) => {
        if (st.status === 'READY') {
          asrReady = true;
          useMeetingStore.getState().setAsrStatus('connected');
        }
      },
      onError: (err) => {
        useMeetingStore.getState().setAsrStatus('error', err.message);
      },
    });

    this.asrClient = asrClient;

    // 2. 初始化音频物理采集与自适应声学约束（防系统音频闪避变小）
    const isAecEnabled = store.audioAcousticMode === 'speaker_aec';

    const audioCapture = new RealAudioCapture({
      sampleRate: 16000,
      deviceId: store.selectedMicId || undefined,
      auxDeviceId: store.auxDeviceId || undefined,
      captureMode: store.captureMode,
      echoCancellation: isAecEnabled,
      noiseSuppression: true,
      autoGainControl: isAecEnabled,
      highpassFilter: true,
      onRmsLevel: (rms) => {
        useMeetingStore.getState().setRmsLevel(rms);
      },
      onAudioChunk: (chunk) => {
        if (!acceptingAudio || !isCurrent()) return;
        if (asrRecordingOffsetMs === null && asrReady && asrClient.isConnected()) {
          asrRecordingOffsetMs = local.session.samples / 16;
        }
        local.session.append(chunk);
        if (local.session.error) {
          useMeetingStore.getState().setMicStatus('error', local.session.error);
        }
        this.sentenceBuffer.appendPcm16Chunk(chunk);
        if (asrReady) {
          asrClient.sendPcmChunk(chunk);
        }
      },
      onSystemAudioStateChange: (active) => {
        useMeetingStore.getState().setIsSystemAudioActive(active);
      },
      onDeviceEnded: () => {
        useMeetingStore.getState().setMicStatus('error', '音频设备已断开，已自动切回默认设备');
        useMeetingStore.getState().setSelectedMicId('');
        if (this.audioCapture) {
          void this.audioCapture.switchDevice(undefined).catch(() => {});
        }
      },
      onDeviceChange: async () => {
        try {
          const list = await RealAudioCapture.getAvailableMicrophones();
          useMeetingStore.getState().setAvailableMics(list);
        } catch {}
      },
    });

    this.audioCapture = audioCapture;

    // 3. 构造排空逻辑供 Store 调用
    const stopCapture = () => {
      if (this.stopPromise) return this.stopPromise;
      const waiters: Promise<unknown>[] = [this.startPromise];
      if (this.systemAudioOperation) waiters.push(this.systemAudioOperation);

      this.stopPromise = Promise.allSettled(waiters)
        .then(() => audioCapture.stop())
        .catch(() => {
          if (useMeetingStore.getState().meetingId === meetingId) {
            useMeetingStore.setState({ asrDrainWarning: '音频设备释放异常，请检查设备状态' });
          }
        });
      useMeetingStore.setState({ audioDeviceStop: this.stopPromise });
      void this.stopPromise.then(() => {
        if (useMeetingStore.getState().audioDeviceStop === this.stopPromise) {
          useMeetingStore.setState({ audioDeviceStop: null });
        }
      });
      return this.stopPromise;
    };

    const drain = () => {
      if (this.drainPromise) return this.drainPromise;
      acceptingAudio = false;
      void stopCapture();
      this.drainPromise = Promise.all([asrClient.finish(), local.session.checkpoint()]).then(([outcome]) => {
        eventState.close();
        if (isCurrent()) {
          for (const segment of useMeetingStore.getState().transcripts) {
            if (segment.speakerStatus === 'pending') {
              useMeetingStore.getState().updateTranscriptSpeaker(segment.id, {
                speaker: '未确定',
                speakerStatus: 'unknown',
              });
            }
          }
        }
        disposed = true;
        return outcome;
      });
      return this.drainPromise;
    };

    useMeetingStore.setState({ asrSessionDrain: drain });

    // 4. 激活 ASR 与物理采集
    asrClient
      .connect()
      .then(() => {
        if (isCurrent()) {
          useMeetingStore.getState().setAsrStatus('connected');
        }
      })
      .catch((err) => {
        if (isCurrent()) {
          useMeetingStore.getState().setAsrStatus('error', err.message || '无法连接 AI 网关流式 ASR 通道');
        }
      });

    this.startPromise = local.ready
      .then(() => {
        if (!isCurrent() || !acceptingAudio) return;
        return audioCapture.start();
      })
      .then(() => {
        if (!isCurrent() || !acceptingAudio) {
          void stopCapture();
          return;
        }
        useMeetingStore.getState().setMicStatus('recording');
        return audioCapture
          .startSystemAudioCapture()
          .then(() => {
            if (!isCurrent() || !acceptingAudio) {
              void stopCapture();
              return;
            }
            useMeetingStore.getState().setIsSystemAudioActive(true);
          })
          .catch((err) => {
            console.info('[Pipeline] 系统音频捕获提示:', err);
          });
      })
      .catch((err) => {
        if (!isCurrent()) return;
        const msg = (err as Error).message || '';
        if (msg.includes('NotAllowedError') || msg.includes('Permission') || msg.includes('权限')) {
          useMeetingStore.getState().setMicStatus('denied', '麦克风权限未授予，请在系统设置中允许');
        } else {
          useMeetingStore.getState().setMicStatus('error', msg || '麦克风设备初始化异常');
        }
      });

    // 5. 周期性窗口自动提炼增量洞察（每 25 秒检查一次）
    if (this.windowIntervalTimer) clearInterval(this.windowIntervalTimer);
    this.windowIntervalTimer = setInterval(() => {
      if (useMeetingStore.getState().isExtractingInsights) return;
      const currentSeconds = useMeetingStore.getState().elapsedSeconds;
      const windowPayload = this.slidingWindow.flush(currentSeconds, 35);
      if (windowPayload) {
        void this.triggerLiveInsight(windowPayload, meetingId);
      }
    }, 25000);
  }

  private async triggerLiveInsight(payload: WindowPayload, meetingId: string): Promise<void> {
    useMeetingStore.getState().setIsExtractingInsights(true);
    try {
      const currentInsights = useMeetingStore.getState().insights;
      const latestTopic = currentInsights.length > 0 ? currentInsights[currentInsights.length - 1].title : undefined;

      const res = await fetch(`${useMeetingStore.getState().gatewayUrl}/gateway/v1/live-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId,
          currentTopicSummary: latestTopic,
          newStableText: payload.combinedText,
          contextAnchors: payload.segments.map((s) => ({
            segmentId: s.id,
            quote: s.text.slice(0, 30),
          })),
        }),
      });

      if (!res.ok) {
        let errorMsg = `AI 洞察服务响应异常 (${res.status})`;
        try {
          const errText = await res.text();
          if (errText) {
            try {
              const errJson = JSON.parse(errText);
              errorMsg = errJson.message || errJson.error || errText;
            } catch {
              errorMsg = errText;
            }
          }
        } catch {}
        useMeetingStore.getState().setInsightError(errorMsg);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            // 1. 适配 AI Gateway 推送的 InsightPatchPayload (action, topicId, patch)
            if (parsed.action && parsed.patch) {
              const { action, topicId, patch } = parsed;
              const evidence = patch.evidenceRefs?.[0];
              const cardId = topicId || `topic_${Date.now()}`;
              const contentText =
                patch.content ||
                (Array.isArray(patch.decisions) && patch.decisions.length > 0
                  ? patch.decisions.join('；')
                  : '');

              if (action === 'UPDATE_TOPIC') {
                useMeetingStore.getState().applyInsightPatch({
                  op: 'update',
                  targetId: cardId,
                  title: patch.title,
                  content: contentText,
                  evidenceSegmentId: evidence?.segmentId,
                });
              } else {
                useMeetingStore.getState().applyInsightPatch({
                  op: 'add',
                  card: {
                    id: cardId,
                    type: patch.type || (action === 'ADD_TODO' ? 'action' : 'decision'),
                    title: patch.title || '阶段性共识与洞察',
                    content: contentText || '已达成讨论共识',
                    timestamp: formatSeconds(useMeetingStore.getState().elapsedSeconds),
                    evidenceSegmentId: evidence?.segmentId,
                  },
                });
              }
              useMeetingStore.getState().setInsightError(null);
            } else if (parsed.op) {
              // 2. 原生 InsightPatch (op: add/update/retract)
              useMeetingStore.getState().applyInsightPatch(parsed);
              useMeetingStore.getState().setInsightError(null);
            } else if (parsed.patch && (parsed.patch.op || parsed.patch.title)) {
              if (parsed.patch.op) {
                useMeetingStore.getState().applyInsightPatch(parsed.patch);
              } else {
                useMeetingStore.getState().applyInsightPatch({
                  op: 'add',
                  card: {
                    id: `topic_${Date.now()}`,
                    type: parsed.patch.type || 'decision',
                    title: parsed.patch.title || '阶段性共识',
                    content:
                      parsed.patch.content ||
                      (Array.isArray(parsed.patch.decisions)
                        ? parsed.patch.decisions.join('；')
                        : ''),
                    timestamp: formatSeconds(useMeetingStore.getState().elapsedSeconds),
                  },
                });
              }
              useMeetingStore.getState().setInsightError(null);
            }
          } catch {}
        }
      }
    } catch (e) {
      console.warn('[Pipeline] 提取实时洞察异常:', e);
      useMeetingStore.getState().setInsightError((e as Error).message || '连接 AI Gateway 提取洞察失败');
    } finally {
      useMeetingStore.getState().setIsExtractingInsights(false);
    }
  }

  public getSpeakerClusterer(): OnlineSpeakerClusterer {
    return this.speakerClusterer;
  }

  public getAudioCapture(): RealAudioCapture | null {
    return this.audioCapture;
  }

  /**
   * 探测可用音频输入设备，并自动识别 Teams/虚拟内录等辅助通道
   */
  public async discoverDevices(): Promise<{
    availableMics: Array<{ deviceId: string; label: string }>;
    autoDetectedAuxId?: string;
  }> {
    try {
      const mics = await RealAudioCapture.getAvailableMicrophones();
      const autoAux = mics.find(
        (d) => /teams|blackhole|virtual|内录|loopback/i.test(d.label)
      );
      return {
        availableMics: mics,
        autoDetectedAuxId: autoAux?.deviceId,
      };
    } catch {
      return {
        availableMics: [],
      };
    }
  }

  public async switchDevice(newDeviceId?: string): Promise<void> {
    useMeetingStore.getState().setSelectedMicId(newDeviceId || '');
    if (this.audioCapture) {
      await this.audioCapture.switchDevice(newDeviceId || undefined);
    }
  }

  public async setCaptureMode(mode: 'speaker_meeting' | 'mic_only'): Promise<void> {
    useMeetingStore.getState().setCaptureMode(mode);
    if (this.audioCapture) {
      await this.audioCapture.setCaptureMode(mode);
    }
  }

  public async toggleSystemAudio(): Promise<boolean> {
    if (!this.audioCapture) return false;
    const isCapturing = this.audioCapture.isSystemAudioCapturing();
    const op = isCapturing
      ? this.audioCapture.stopSystemAudioCapture()
      : this.audioCapture.startSystemAudioCapture();
    this.systemAudioOperation = op;
    try {
      await op;
      useMeetingStore.getState().setIsSystemAudioActive(!isCapturing);
      return !isCapturing;
    } finally {
      if (this.systemAudioOperation === op) {
        this.systemAudioOperation = null;
      }
    }
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    this.activeMeetingId = null;

    if (this.windowIntervalTimer) {
      clearInterval(this.windowIntervalTimer);
      this.windowIntervalTimer = null;
    }

    if (this.audioCapture) {
      const cap = this.audioCapture;
      this.audioCapture = null;
      if (!this.stopPromise) {
        try {
          await cap.stop();
        } catch {}
      }
    }

    if (this.asrClient) {
      this.asrClient.disconnect();
      this.asrClient = null;
    }

    this.sentenceBuffer.clear();
    this.slidingWindow.clear();
    this.speakerClusterer.reset();

    const store = useMeetingStore.getState();
    store.setRmsLevel(0);
    store.setInterimText('', { stable: '', unstable: '' });
    store.setMicStatus('idle');
    store.setAsrStatus('disconnected');
    store.setIsExtractingInsights(false);
  }

  public async destroy(): Promise<void> {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
    await this.stop();
  }
}

// 导出全局单例管理驱动
let globalPipelineServiceInstance: MeetingPipelineService | null = null;

export function getMeetingPipelineService(): MeetingPipelineService {
  if (!globalPipelineServiceInstance) {
    globalPipelineServiceInstance = new MeetingPipelineService();
  }
  return globalPipelineServiceInstance;
}

export async function resetMeetingPipelineService(): Promise<void> {
  if (globalPipelineServiceInstance) {
    await globalPipelineServiceInstance.destroy();
    globalPipelineServiceInstance = null;
  }
}

// 契约别名导出：满足架构深度设计与领域接缝命名规范 (CONTEXT.md)
export { MeetingPipelineService as AudioCaptureSession };
export const getAudioCaptureSession = getMeetingPipelineService;
export type { CaptureMode } from './realAudioCapture';
