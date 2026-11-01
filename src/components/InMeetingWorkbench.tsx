import React, { useState, useRef, useEffect, memo, useCallback, useMemo } from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import { formatSeconds } from '../utils/formatTime';
import { InsightCard, InsightType, TranscriptSegment } from '../types/meeting';
import { RealAudioCapture } from '../audio/realAudioCapture';
import { RealStreamingAsrClient } from '../audio/realStreamingAsrClient';
import { SentenceAudioBuffer } from '../audio/sentenceAudioBuffer';
import { LocalSpeakerEmbeddingEngine } from '../audio/speakerEmbeddingEngine';
import { OnlineSpeakerClusterer } from '../engine/speakerClusterer';
import { SlidingWindowAccumulator, WindowPayload } from '../engine/slidingWindow';

const SPEAKER_DOT_CLASSES = [
  'bg-brand-blue',
  'bg-status-success',
  'bg-status-warning',
  'bg-status-danger',
  'bg-text-secondary',
  'bg-brand-blue-hover',
];

function getSpeakerDotClass(colorIndex?: number): string {
  const idx = typeof colorIndex === 'number' && colorIndex >= 0 ? colorIndex : 0;
  return SPEAKER_DOT_CLASSES[idx % SPEAKER_DOT_CLASSES.length];
}

// 独立抽离秒表组件：仅订阅 elapsedSeconds，避免每秒重渲庞大整树（对齐 AGENTS.md 5.2 性能规范）
const HeaderTimer: React.FC = () => {
  const elapsedSeconds = useMeetingStore((s) => s.elapsedSeconds);
  return (
    <span
      data-testid="workbench-page-header-text-timer"
      className="px-2.5 py-0.5 rounded bg-panel font-mono tabular-nums text-xs font-medium text-text-secondary"
    >
      {formatSeconds(elapsedSeconds)}
    </span>
  );
};

// 记忆化单条洞察卡片组件（React.memo 杜绝无差权重渲）
interface InsightCardItemProps {
  card: InsightCard;
  onViewEvidence: (evidenceId: string) => void;
  onConfirm: (id: string) => void;
  onKeepCurrent: (id: string) => void;
  onAcceptRevision: (id: string) => void;
}

const InsightCardItem = memo<InsightCardItemProps>(({
  card,
  onViewEvidence,
  onConfirm,
  onKeepCurrent,
  onAcceptRevision,
}) => {
  // 专属 Q&A 问答卡片（解决即时问答直观识别与对话呈现）
  if (card.type === 'qa') {
    const questionText =
      card.question || card.title.replace(/^提问：/, '').replace(/^AI 问答：/, '');
    return (
      <div
        data-testid={`workbench-page-insights-panel-card-${card.id}`}
        className="p-3.5 rounded-lg border border-brand-blue/30 bg-canvas shadow-sm space-y-2.5 transition-all"
      >
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <span
              data-testid={`workbench-page-insights-panel-badge-qa-${card.id}`}
              className="text-[11px] px-1.5 py-0.5 rounded bg-brand-blue-subtle text-brand-blue font-semibold flex items-center gap-1"
            >
              <span>💬</span>
              <span>本场问答</span>
            </span>
            <span className="text-[11px] text-text-tertiary tabular-nums font-mono">
              {card.timestamp}
            </span>
          </div>
          {card.evidenceSegmentId && (
            <button
              type="button"
              data-testid={`workbench-page-insights-panel-btn-view-evidence-${card.id}`}
              onClick={() => onViewEvidence(card.evidenceSegmentId)}
              className="text-text-secondary hover:text-brand-blue transition-colors flex items-center gap-1 font-medium text-[11px]"
            >
              <span>🔗 查看依据</span>
            </button>
          )}
        </div>

        {/* 您的提问 */}
        <div
          data-testid={`workbench-page-insights-panel-div-qa-question-${card.id}`}
          className="p-2 rounded bg-subtle border border-border-subtle flex items-start gap-2"
        >
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-blue/15 text-brand-blue font-bold shrink-0">
            您的提问
          </span>
          <p className="text-xs text-text-primary font-medium flex-1">
            {questionText}
          </p>
        </div>

        {/* 听序智能解答 */}
        <div
          data-testid={`workbench-page-insights-panel-div-qa-answer-${card.id}`}
          className="p-2.5 rounded bg-panel/70 border border-border-subtle text-xs text-text-primary leading-relaxed space-y-1"
        >
          <div className="flex items-center gap-1.5 text-[10px] text-brand-blue font-semibold">
            <span>🤖 听序回答</span>
          </div>
          <p className="whitespace-pre-wrap text-text-primary leading-relaxed">
            {card.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={`workbench-page-insights-panel-card-${card.id}`}
      className={`p-3.5 rounded-lg border transition-all ${
        card.isConfirmed
          ? 'bg-canvas border-status-success-border shadow-sm'
          : 'bg-subtle border-border-subtle'
      }`}
    >
      {/* 卡片头部 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-panel font-medium text-text-secondary">
            {card.type === 'decision' && '结论'}
            {card.type === 'action' && '待办'}
            {card.type === 'risk' && '风险'}
            {card.type === 'fact' && '事实'}
          </span>
          <h3 className="text-sm font-semibold text-text-primary">
            {card.title}
          </h3>
        </div>

        {card.isConfirmed && (
          <span
            data-testid={`workbench-page-insights-panel-badge-confirmed-${card.id}`}
            className="px-2 py-0.5 text-[11px] bg-status-success-bg text-status-success rounded font-medium"
          >
            ✓ 人工已确认（受保护）
          </span>
        )}
      </div>

      {/* 卡片正文 */}
      <p className="text-xs text-text-secondary leading-relaxed mb-3">
        {card.content}
      </p>

      {/* 依据按钮与操作栏 */}
      <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs">
        <button
          type="button"
          data-testid={`workbench-page-insights-panel-btn-view-evidence-${card.id}`}
          onClick={() => onViewEvidence(card.evidenceSegmentId)}
          className="text-brand-blue hover:underline flex items-center gap-1 font-medium cursor-pointer"
          title="点击在右侧高亮查看该洞察依据的发言段落"
        >
          🔍 高亮查看发言
          <span className="text-text-tertiary tabular-nums font-mono text-[11px]">
            ({card.timestamp})
          </span>
        </button>

        {!card.isConfirmed && (
          <button
            type="button"
            data-testid={`workbench-page-insights-panel-btn-confirm-decision-${card.id}`}
            onClick={() => onConfirm(card.id)}
            className="px-2.5 py-1 text-xs bg-brand-blue-subtle text-brand-blue hover:bg-brand-blue hover:text-white rounded transition-colors font-medium"
          >
            确认结论
          </button>
        )}
      </div>

      {/* 人工保护冲突处理：待复核新修订区块 */}
      {card.pendingRevision && (
        <div
          data-testid={`workbench-page-insights-panel-div-pending-revision-${card.id}`}
          className="mt-3 p-3 rounded bg-status-warning-bg border border-status-warning-border"
        >
          <div className="flex items-center justify-between mb-1.5 text-xs text-status-warning font-semibold">
            <span>⚠️ 待复核新修订（后续发言产生冲突）</span>
            <span className="font-mono tabular-nums text-[11px]">
              {card.pendingRevision.timestamp}
            </span>
          </div>
          <p className="text-xs text-text-primary mb-2">
            {card.pendingRevision.proposedText}
          </p>
          <div className="text-[11px] text-text-secondary mb-2.5">
            依据原因：{card.pendingRevision.reason}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              data-testid={`workbench-page-insights-panel-btn-keep-current-${card.id}`}
              onClick={() => onKeepCurrent(card.id)}
              className="px-2.5 py-1 text-xs bg-canvas text-text-secondary border border-border-strong rounded hover:bg-subtle transition-colors"
            >
              保留当前版本
            </button>
            <button
              type="button"
              data-testid={`workbench-page-insights-panel-btn-accept-revision-${card.id}`}
              onClick={() => onAcceptRevision(card.id)}
              className="px-2.5 py-1 text-xs bg-brand-blue text-white rounded hover:bg-brand-blue-hover transition-colors font-medium"
            >
              采用新版本
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

// 记忆化单条逐字稿段落组件（React.memo 杜绝高频打字重渲列表）
interface TranscriptRowProps {
  segment: TranscriptSegment;
  isHighlighted: boolean;
  onRenameSpeaker: (oldName: string, newName: string) => void;
  onConfirmTentative?: (speakerId: string, profileId: string, profileName: string) => void;
  onRejectTentative?: (speakerId: string, profileId: string) => void;
}

const TranscriptRow = memo<TranscriptRowProps>(({
  segment,
  isHighlighted,
  onRenameSpeaker,
  onConfirmTentative,
  onRejectTentative,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(segment.speaker);

  const handleSaveRename = () => {
    if (editName.trim() && editName.trim() !== segment.speaker) {
      onRenameSpeaker(segment.speakerId || segment.speaker, editName.trim());
    }
    setIsEditing(false);
  };

  return (
    <div
      id={segment.id}
      data-testid={`workbench-page-transcript-panel-row-segment-${segment.id}`}
      className={`p-3 rounded-md transition-all border ${
        isHighlighted
          ? 'bg-active border-brand-blue shadow-md ring-2 ring-brand-blue/30 border-l-4 border-l-brand-blue scale-[1.005]'
          : 'bg-canvas border-border-subtle hover:border-border-strong'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5 text-xs">
        <div className="flex items-center gap-2">
          <span
            data-testid={`workbench-page-transcript-panel-badge-speaker-dot-${segment.id}`}
            className={`w-2 h-2 rounded-full shrink-0 ${getSpeakerDotClass(segment.speakerColorIndex)}`}
            title={segment.speakerId ? `声纹聚类 ID: ${segment.speakerId}` : '说话人标识'}
          />

          {isEditing ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                data-testid={`workbench-page-transcript-panel-input-rename-speaker-${segment.id}`}
                value={editName}
                autoFocus
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveRename();
                  if (e.key === 'Escape') setIsEditing(false);
                }}
                className="px-1.5 py-0.5 text-xs rounded bg-panel border border-brand-blue text-text-primary focus:outline-none w-24"
              />
              <button
                type="button"
                data-testid={`workbench-page-transcript-panel-btn-save-speaker-${segment.id}`}
                onClick={handleSaveRename}
                className="px-1.5 py-0.5 text-[11px] bg-brand-blue text-white rounded hover:bg-brand-blue-hover"
              >
                保存
              </button>
              <button
                type="button"
                data-testid={`workbench-page-transcript-panel-btn-cancel-speaker-${segment.id}`}
                onClick={() => setIsEditing(false)}
                className="text-[11px] text-text-tertiary hover:text-text-primary"
              >
                取消
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 group">
              <span
                data-testid={`workbench-page-transcript-panel-text-speaker-${segment.id}`}
                onClick={() => {
                  setEditName(segment.speaker);
                  setIsEditing(true);
                }}
                className="font-semibold text-text-primary hover:text-brand-blue cursor-pointer transition-colors"
                title="点击修改发言人真实姓名（同声纹发言将同步更新）"
              >
                {segment.speaker}
              </span>
              {typeof segment.speakerConfidence === 'number' && (
                <span
                  data-testid={`workbench-page-transcript-panel-badge-speaker-confidence-${segment.id}`}
                  className="text-[10px] px-1 py-0.2 rounded bg-brand-blue-subtle text-brand-blue font-mono tabular-nums"
                  title="端侧声纹聚类置信度"
                >
                  声纹 {Math.round(segment.speakerConfidence * 100)}%
                </span>
              )}
              {segment.tentativeProfileId && segment.tentativeProfileName && (
                <div
                  data-testid={`workbench-page-transcript-panel-div-tentative-match-${segment.id}`}
                  className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-status-warning-bg border border-status-warning-border text-status-warning text-[10px]"
                  title="本地声纹库单句首次命中候选，连续 2 句或手动点击确认后绑定"
                >
                  <span>可能是 {segment.tentativeProfileName}</span>
                  <button
                    type="button"
                    data-testid={`workbench-page-transcript-panel-btn-confirm-tentative-${segment.id}`}
                    onClick={() =>
                      onConfirmTentative &&
                      onConfirmTentative(
                        segment.speakerId || segment.speaker,
                        segment.tentativeProfileId!,
                        segment.tentativeProfileName!
                      )
                    }
                    className="px-1 rounded bg-brand-blue text-white hover:bg-brand-blue-hover font-medium"
                  >
                    确认
                  </button>
                  <button
                    type="button"
                    data-testid={`workbench-page-transcript-panel-btn-reject-tentative-${segment.id}`}
                    onClick={() =>
                      onRejectTentative &&
                      onRejectTentative(
                        segment.speakerId || segment.speaker,
                        segment.tentativeProfileId!
                      )
                    }
                    className="px-1 rounded bg-canvas text-text-secondary hover:text-status-danger border border-border-subtle"
                  >
                    不是
                  </button>
                </div>
              )}
              <button
                type="button"
                data-testid={`workbench-page-transcript-panel-btn-rename-speaker-${segment.id}`}
                onClick={() => {
                  setEditName(segment.speaker);
                  setIsEditing(true);
                }}
                className="text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-brand-blue text-[11px] transition-opacity"
                title="重命名发言人"
              >
                ✎
              </button>
            </div>
          )}

          <span className="text-[10px] px-1 py-0.2 rounded bg-panel text-text-secondary">
            {segment.channel === 'mic' ? '本人麦克风' : '对方声卡'}
          </span>

          {isHighlighted && (
            <span
              data-testid={`workbench-page-transcript-panel-badge-evidence-${segment.id}`}
              className="px-1.5 py-0.2 rounded text-[10px] bg-brand-blue text-white font-medium animate-pulse"
            >
              📍 洞察依据段落
            </span>
          )}
        </div>

        <span className="font-mono tabular-nums text-text-tertiary text-[11px]">
          {segment.timestamp}
        </span>
      </div>

      <p className="text-xs text-text-primary leading-relaxed">
        {segment.text}
      </p>
    </div>
  );
});

// 严苛的真实待办判断函数：必须有明确行动/落实动词，排除闲聊/假设/口癖
const isValidActionItem = (title: string, content: string): boolean => {
  const text = `${title} ${content}`.trim();
  const actionVerbs = /(负责|完成|提交|排期|推进|输出|跟进|修复|开发|整理|制定|核对|撰写|优化|联系|发给|发送|交付|上线|准备|测试|梳理|编写)/;
  const casualChat = /(生病|头疼|闲聊|随口|说说|不知道|觉得吧|算了吧|哈哈|嗯嗯|哎呀|可能吧|怎么搞|没意思)/;

  if (casualChat.test(text) && !actionVerbs.test(text)) {
    return false;
  }
  return actionVerbs.test(text);
};

export const InMeetingWorkbench: React.FC = () => {
  const {
    title,
    status,
    meetingId,
    insights,
    transcripts,
    highlightedTranscriptId,
    confirmInsight,
    keepCurrentInsightVersion,
    acceptInsightRevision,
    setHighlightedTranscriptId,
    setActiveWindow,
    setCurrentRoute,
    startMeeting,
    pauseMeeting,
    resumeMeeting,
    endMeeting,
    addInsight,
    addTranscriptSegment,
    isGeneratingSummary,
    renameSpeaker,
    voiceprintConsentAt,
    registerSpeakerProfile,
    markProfileMatched,
    dismissTentativeMatch,
  } = useMeetingStore();

  const [activeFilter, setActiveFilter] = useState<'all' | InsightType>('all');
  const [filterKeyword, setFilterKeyword] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [rmsLevel, setRmsLevel] = useState(0);
  const [interimText, setInterimText] = useState('');
  const [micStatus, setMicStatus] = useState<'idle' | 'recording' | 'denied' | 'error'>('idle');
  const [micError, setMicError] = useState<string>('');
  const [asrStatus, setAsrStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [asrError, setAsrError] = useState<string>('');
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [isExtractingInsights, setIsExtractingInsights] = useState(false);
  const [availableMics, setAvailableMics] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [editingHeaderSpeaker, setEditingHeaderSpeaker] = useState<{
    key: string;
    name: string;
  } | null>(null);
  const [headerSpeakerDraft, setHeaderSpeakerDraft] = useState('');
  const [rememberSpeakerVoice, setRememberSpeakerVoice] = useState(false);
  const [pendingVoiceprintConsent, setPendingVoiceprintConsent] = useState<{
    speakerKey: string;
    displayName: string;
  } | null>(null);

  // 初始化加载音频输入设备列表
  useEffect(() => {
    RealAudioCapture.getAvailableMicrophones()
      .then((mics) => setAvailableMics(mics))
      .catch(() => {});
  }, []);

  // 提取本场所有参会人实体（保留稳定 speakerId 与颜色圆点，支持一键改名）
  const speakerRoster = useMemo(() => {
    const map = new Map<string, { key: string; name: string; colorIndex: number; count: number }>();
    transcripts.forEach((t, idx) => {
      if (!t.speaker) return;
      const key = t.speakerId || t.speaker;
      const existing = map.get(key);
      if (existing) {
        existing.name = t.speaker;
        existing.count += 1;
      } else {
        map.set(key, {
          key,
          name: t.speaker,
          colorIndex: typeof t.speakerColorIndex === 'number' ? t.speakerColorIndex : idx % 6,
          count: 1,
        });
      }
    });
    const list = Array.from(map.values());
    return list.length > 0
      ? list
      : [{ key: 'spk_1', name: '发言人 1', colorIndex: 0, count: 0 }];
  }, [transcripts]);

  const transcriptListRef = useRef<HTMLDivElement>(null);
  const audioCaptureRef = useRef<RealAudioCapture | null>(null);
  const asrClientRef = useRef<RealStreamingAsrClient | null>(null);
  const sentenceBufferRef = useRef<SentenceAudioBuffer>(
    new SentenceAudioBuffer({ sampleRate: 16000, maxDurationSeconds: 60 })
  );
  const embeddingEngineRef = useRef<LocalSpeakerEmbeddingEngine>(new LocalSpeakerEmbeddingEngine());
  const speakerClustererRef = useRef<OnlineSpeakerClusterer>(new OnlineSpeakerClusterer());
  const slidingWindowRef = useRef<SlidingWindowAccumulator>(
    new SlidingWindowAccumulator({ minCharsThreshold: 60, maxSilenceSeconds: 12 })
  );

  const handleRenameSpeakerUnified = useCallback(
    (speakerIdOrOldName: string, newName: string) => {
      speakerClustererRef.current.renameSpeaker(speakerIdOrOldName, newName);
      renameSpeaker(speakerIdOrOldName, newName);
    },
    [renameSpeaker]
  );

  const commitVoiceprintEnrollment = useCallback(
    (speakerKey: string, displayName: string, explicitConsent: boolean) => {
      const clusterVp = speakerClustererRef.current.getClusterVoiceprint(speakerKey);
      const fallbackEmbedding = new Array<number>(192).fill(0);
      const hashSeed = Array.from(speakerKey + displayName).reduce(
        (acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 192,
        0
      );
      fallbackEmbedding[hashSeed] = 1.0;

      registerSpeakerProfile({
        displayName,
        embedding: clusterVp && clusterVp.centroid.length > 0 ? clusterVp.centroid : fallbackEmbedding,
        sampleDurationMs: clusterVp?.totalDurationMs ?? 8000,
        consented: explicitConsent,
      });
    },
    [registerSpeakerProfile]
  );

  const handleConfirmTentativeMatch = useCallback(
    (speakerId: string, profileId: string, profileName: string) => {
      speakerClustererRef.current.confirmProfileMatch(speakerId, profileId, profileName);
      markProfileMatched(profileId);
      renameSpeaker(speakerId, profileName);
    },
    [markProfileMatched, renameSpeaker]
  );

  const handleRejectTentativeMatch = useCallback(
    (speakerId: string, profileId: string) => {
      speakerClustererRef.current.rejectProfileMatch(speakerId, profileId);
      dismissTentativeMatch(speakerId, profileId);
    },
    [dismissTentativeMatch]
  );

  // 处理增量洞察补丁（严格遵循不可覆盖的人工编辑保护）
  const processInsightPatch = useCallback((item: any, win: WindowPayload) => {
    if (!item || !item.patch) return;
    const { action, topicId, patch } = item;
    const currentStore = useMeetingStore.getState();
    const nowTime = formatSeconds(currentStore.elapsedSeconds);
    const defaultEvidenceId =
      patch.evidenceRefs?.[0]?.segmentId || win.segments[win.segments.length - 1]?.id || '';

    // 依据大模型返回提炼真实内容，杜绝套话与臆造
    const cardContent =
      patch.content ||
      (Array.isArray(patch.decisions) && patch.decisions.length > 0
        ? patch.decisions.join('；')
        : patch.title
        ? `围绕“${patch.title}”展开讨论并跟进细节`
        : '现场讨论要点');

    const rawCardType = patch.type || (action === 'ADD_TODO' ? 'action' : 'decision');
    const isTodoAction = action === 'ADD_TODO' || rawCardType === 'action';

    // 严苛过滤：只有具备明确责任人与行动承诺的才作为待办；普通讨论一律降级为阶段段落总结，杜绝假待办泛滥
    const isGenuineAction = isTodoAction && isValidActionItem(patch.title || '', cardContent);
    const cardType = isGenuineAction ? 'action' : (rawCardType === 'action' ? 'decision' : rawCardType);

    if (isGenuineAction) {
      currentStore.applyInsightPatch({
        op: 'add',
        card: {
          id: topicId || `action_${Date.now()}`,
          type: 'action',
          title: `待办：${patch.title || '新增行动项'}`,
          content: cardContent,
          timestamp: nowTime,
          evidenceSegmentId: defaultEvidenceId,
        },
      });
    } else {
      const existingCard = currentStore.insights.find(
        (c) => c.id === topicId || (patch.title && c.title === patch.title)
      );

      const titlePrefix = cardType === 'decision' && isTodoAction ? '阶段讨论洞察：' : '';
      const displayTitle = `${titlePrefix}${patch.title || '阶段讨论关键结论'}`;

      if (existingCard) {
        currentStore.applyInsightPatch({
          op: 'update',
          targetId: existingCard.id,
          title: displayTitle,
          content: cardContent,
          timestamp: nowTime,
          evidenceSegmentId: defaultEvidenceId,
          reason: '后续发言补充事实与结论',
        });
      } else {
        currentStore.applyInsightPatch({
          op: 'add',
          card: {
            id: topicId || `ins_${Date.now()}`,
            type: cardType,
            title: displayTitle,
            content: cardContent,
            timestamp: nowTime,
            evidenceSegmentId: defaultEvidenceId,
          },
        });
      }
    }

    // 动态升级会议标题：若当前是系统生成的通用标题，根据当前对话提炼的主题更新标题，后面跟上日期时间
    if (patch.title) {
      const currentTitle = currentStore.title;
      const isDefaultTitle =
        !currentTitle ||
        currentTitle.startsWith('会议记录') ||
        currentTitle.startsWith('新会议') ||
        currentTitle.startsWith('未命名');

      if (isDefaultTitle) {
        const now = new Date();
        const timeSuffix = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        currentStore.updateMeetingTitle(`${patch.title.trim()} ${timeSuffix}`);
      }
    }
  }, []);

  // 触发 AI Gateway 增量提炼洞察
  const triggerLiveInsightExtraction = useCallback(
    async (windowPayload: WindowPayload) => {
      setIsExtractingInsights(true);
      try {
        const currentInsights = useMeetingStore.getState().insights;
        const latestTopic =
          currentInsights.length > 0
            ? currentInsights[currentInsights.length - 1].title
            : undefined;

        const res = await fetch('http://localhost:3201/gateway/v1/live-insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetingId: meetingId || 'mtg_current',
            currentTopicSummary: latestTopic,
            newStableText: windowPayload.combinedText,
            contextAnchors: windowPayload.segments.map((s) => ({
              segmentId: s.id,
              quote: s.text.slice(0, 30),
            })),
          }),
        });

        if (!res.ok) {
          console.warn('[LiveInsight] AI Gateway responded with error:', res.status);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() || '';

          for (const chunk of chunks) {
            const lines = chunk.split('\n');
            let event = '';
            let dataStr = '';
            for (const line of lines) {
              if (line.startsWith('event:')) event = line.replace('event:', '').trim();
              if (line.startsWith('data:')) dataStr = line.replace('data:', '').trim();
            }

            if (event === 'insight_patch' && dataStr) {
              try {
                const parsed = JSON.parse(dataStr);
                processInsightPatch(parsed, windowPayload);
              } catch (e) {
                console.warn('[LiveInsight] JSON parse error:', e);
              }
            }
          }
        }
      } catch (err) {
        console.warn('[LiveInsight] Extraction error:', err);
      } finally {
        setIsExtractingInsights(false);
      }
    },
    [meetingId, processInsightPatch]
  );

  // 手动切换麦克风输入设备
  const handleSwitchMicrophone = useCallback(async (newDeviceId: string) => {
    setSelectedMicId(newDeviceId);
    if (audioCaptureRef.current) {
      try {
        await audioCaptureRef.current.switchDevice(newDeviceId || undefined);
        setMicError('');
      } catch (err: any) {
        setMicError(`切换音频设备失败: ${err.message || '麦克风无法访问'}`);
      }
    }
  }, []);

  // 监听 status 切换，真实驱动物理麦克风采集与流式 ASR 传输
  useEffect(() => {
    if (status === 'RECORDING') {
      setAsrStatus('connecting');
      setAsrError('');
      setMicStatus('recording');
      setMicError('');

      const asrClient = new RealStreamingAsrClient({
        wsUrl: 'ws://localhost:3201/gateway/v1/asr/stream',
        onInterimText: (text) => {
          setInterimText(text);
          if (text) {
            setAsrError('');
            setAsrStatus('connected');
          }
        },
        onFinalSentence: (sentence) => {
          setInterimText('');
          setAsrError('');
          setAsrStatus('connected');

          const estimatedDurationMs =
            typeof sentence.beginTimeMs === 'number' &&
            typeof sentence.endTimeMs === 'number' &&
            sentence.endTimeMs > sentence.beginTimeMs
              ? sentence.endTimeMs - sentence.beginTimeMs
              : Math.min(6000, Math.max(1200, sentence.text.length * 180));

          const audioSamples =
            typeof sentence.beginTimeMs === 'number' &&
            typeof sentence.endTimeMs === 'number' &&
            sentence.endTimeMs > sentence.beginTimeMs
              ? sentenceBufferRef.current.sliceByTimeMs(sentence.beginTimeMs, sentence.endTimeMs)
              : sentenceBufferRef.current.getRecentSamples(estimatedDurationMs);

          void (async () => {
            const embedding = await embeddingEngineRef.current.embedSamples(audioSamples, 16000);
            const currentProfiles = useMeetingStore.getState().speakerProfiles;
            const assigned = speakerClustererRef.current.assign({
              embedding,
              durationMs: estimatedDurationMs,
              upstreamSpeakerId: sentence.speakerId,
              knownProfiles: currentProfiles.map((p) => ({
                profileId: p.profileId,
                displayName: p.displayName,
                embedding: p.embedding,
              })),
            });

            if (assigned.autoMatchedJustNow && assigned.matchedProfileId) {
              useMeetingStore.getState().markProfileMatched(assigned.matchedProfileId);
              useMeetingStore.getState().renameSpeaker(assigned.speakerId, assigned.displayName);
            }

            const storedName =
              useMeetingStore.getState().speakerNames[assigned.speakerId] || assigned.displayName;

            const newSeg: TranscriptSegment = {
              id: `seg_${Date.now()}`,
              channel: 'mic',
              speaker: storedName,
              speakerId: assigned.speakerId,
              speakerConfidence: assigned.confidence,
              speakerColorIndex: assigned.colorIndex,
              matchedProfileId: assigned.matchedProfileId,
              tentativeProfileId: assigned.tentativeProfileId,
              tentativeProfileName: assigned.tentativeProfileName,
              beginTimeMs: sentence.beginTimeMs ?? undefined,
              endTimeMs: sentence.endTimeMs ?? undefined,
              text: sentence.text,
              timestamp: sentence.timestamp || formatSeconds(useMeetingStore.getState().elapsedSeconds),
            };
            addTranscriptSegment(newSeg);

            // 传入滑动窗口触发切片
            const windowPayload = slidingWindowRef.current.appendSegment(
              newSeg,
              useMeetingStore.getState().elapsedSeconds
            );
            if (windowPayload) {
              triggerLiveInsightExtraction(windowPayload);
            }
          })();
        },
        onStatus: (st) => {
          if (st.status === 'READY') {
            setAsrStatus('connected');
            setAsrError('');
          }
        },
        onError: (err) => {
          setAsrStatus('error');
          setAsrError(err.message);
        },
      });

      const audioCapture = new RealAudioCapture({
        sampleRate: 16000,
        deviceId: selectedMicId || undefined,
        onRmsLevel: (rms) => setRmsLevel(rms),
        onAudioChunk: (chunk) => {
          sentenceBufferRef.current.appendPcm16Chunk(chunk);
          asrClient.sendPcmChunk(chunk);
        },
        onDeviceEnded: () => {
          // 🎧 当蓝牙耳机关闭或断开连接时，自动自愈切回系统默认麦克风
          setMicError('🎧 检测到当前音频设备已断开（如蓝牙耳机关闭），已自动切回系统麦克风继续识别');
          setSelectedMicId('');
          if (audioCaptureRef.current) {
            audioCaptureRef.current.switchDevice(undefined).catch((e) => {
              console.warn('Auto switch to default mic failed:', e);
            });
          }
          if (asrClientRef.current) {
            asrClientRef.current.connect().catch(() => {});
          }
          setTimeout(() => {
            setMicError('');
          }, 4000);
        },
        onDeviceChange: async () => {
          try {
            const list = await RealAudioCapture.getAvailableMicrophones();
            setAvailableMics(list);
          } catch (e) {
            console.warn('Device change enumerate error:', e);
          }
        },
      });

      asrClientRef.current = asrClient;
      audioCaptureRef.current = audioCapture;

      // 启动 WebSocket 与麦克风物理采集
      asrClient.connect().then(() => {
        setAsrStatus('connected');
        setAsrError('');
      }).catch((err) => {
        setAsrStatus('error');
        setAsrError(err.message || '无法连接 AI 网关流式 ASR 通道');
      });

      audioCapture.start().then(() => {
        setMicStatus('recording');
      }).catch((err) => {
        const msg = (err as Error).message;
        if (msg.includes('NotAllowedError') || msg.includes('Permission') || msg.includes('权限')) {
          setMicStatus('denied');
          setMicError('系统麦克风权限未授予，请在系统设置中允许听序使用麦克风');
        } else {
          setMicStatus('error');
          setMicError(msg || '麦克风设备初始化异常');
        }
      });
    } else {
      if (audioCaptureRef.current) {
        audioCaptureRef.current.stop().catch(() => {});
        audioCaptureRef.current = null;
      }
      if (asrClientRef.current) {
        asrClientRef.current.disconnect();
        asrClientRef.current = null;
      }
      slidingWindowRef.current.clear();
      sentenceBufferRef.current.clear();
      if (status === 'IDLE' || status === 'ENDED') {
        speakerClustererRef.current.reset();
      }
      setIsExtractingInsights(false);
      setRmsLevel(0);
      setInterimText('');
      setMicStatus('idle');
      setAsrStatus('disconnected');
    }

    return () => {
      if (audioCaptureRef.current) {
        audioCaptureRef.current.stop().catch(() => {});
      }
      if (asrClientRef.current) {
        asrClientRef.current.disconnect();
      }
    };
  }, [status, addTranscriptSegment, triggerLiveInsightExtraction]);

  // 周期性时间窗口自动提炼：在会议进行中每隔 25 秒检查一次缓冲区，若累积字符数 >= 35 字自动触发增量段落洞察
  useEffect(() => {
    if (status !== 'RECORDING') return;

    const intervalId = setInterval(() => {
      if (isExtractingInsights) return;
      const currentSeconds = useMeetingStore.getState().elapsedSeconds;
      const windowPayload = slidingWindowRef.current.flush(currentSeconds, 35);
      if (windowPayload) {
        triggerLiveInsightExtraction(windowPayload);
      }
    }, 25000);

    return () => clearInterval(intervalId);
  }, [status, isExtractingInsights, triggerLiveInsightExtraction]);

  // 平滑或直接吸底滚动辅助函数（兼顾 jsdom 测试环境）
  const scrollToBottom = useCallback((smooth = true) => {
    const el = transcriptListRef.current;
    if (!el) return;
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  // 监听逐字稿更新与流式打字：未脱手时自动保持平滑吸底
  useEffect(() => {
    if (!isUserScrolledUp) {
      scrollToBottom(true);
    }
  }, [transcripts.length, interimText, isUserScrolledUp, scrollToBottom]);

  // 逐字稿向上滚动脱手检测
  const handleTranscriptScroll = useCallback(() => {
    const el = transcriptListRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom > 60) {
      setIsUserScrolledUp(true);
    } else {
      setIsUserScrolledUp(false);
    }
  }, []);

  // 联动滚动与短促呼吸高亮消退机制（依据 UIUX-DESIGN-SPEC.md 规范）
  useEffect(() => {
    if (highlightedTranscriptId && transcriptListRef.current) {
      const el = document.getElementById(highlightedTranscriptId);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // 2.5 秒后自动平滑消退高亮焦点
      const timer = setTimeout(() => {
        setHighlightedTranscriptId(null);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [highlightedTranscriptId, setHighlightedTranscriptId]);

  const handleMinimizeToPill = useCallback(() => {
    setActiveWindow('floating-pill');
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('toggle_floating_mode', { toFloating: true }).catch(() => {});
      });
    }
  }, [setActiveWindow]);

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;

    const q = questionText.trim();
    setQuestionText('');
    setIsAsking(true);

    try {
      const res = await fetch('http://localhost:3201/gateway/v1/meeting-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: meetingId || 'meet_live',
          question: q,
          asOfTextVersion: transcripts.length,
          localStableTranscript: transcripts.length
            ? transcripts.map((t) => ({ segmentId: t.id, speaker: t.speaker, text: t.text }))
            : [{ segmentId: 'seg_init', speaker: '系统', text: '本场会议已开启，正在监听双轨音频。' }],
        }),
      }).catch(() => null);

      if (res && res.ok) {
        const json = await res.json();
        const evidenceId =
          json.data?.evidenceRefs?.[0]?.segmentId ||
          json.data?.citations?.[0]?.segmentId ||
          transcripts[transcripts.length - 1]?.id ||
          '';

        addInsight({
          id: `qa-${Date.now()}`,
          type: 'qa',
          title: `提问：${q}`,
          question: q,
          content: json.data?.answer || '已完成本场会议问答分析。',
          timestamp: formatSeconds(useMeetingStore.getState().elapsedSeconds),
          evidenceSegmentId: evidenceId,
        });

        // 提问完成后若不在全部或问答视图，自动切到全部让用户立刻看到问答卡片
        if (activeFilter !== 'all' && activeFilter !== 'qa') {
          setActiveFilter('all');
        }
      } else {
        // 彻底废除假数据生成：网关异常时明确提示真实错误，绝不臆造会议内容 (对齐 AGENTS.md 铁律)
        alert('⚠️ AI 网关处理请求失败或网络不可达。根据安全防臆造铁律，系统已拒绝生成离线假数据，请确保网关运行正常后重试。');
      }
    } finally {
      setIsAsking(false);
    }
  };

  const filteredInsights = insights.filter((item) => {
    if (activeFilter !== 'all' && item.type !== activeFilter) return false;
    return true;
  });

  const filteredTranscripts = transcripts.filter((t) => {
    if (!filterKeyword) return true;
    return t.text.toLowerCase().includes(filterKeyword.toLowerCase()) ||
           t.speaker.toLowerCase().includes(filterKeyword.toLowerCase());
  });

  return (
    <div
      data-testid="workbench-page-container"
      className="flex flex-col h-full w-full flex-1 bg-canvas text-text-primary overflow-hidden select-none"
    >
      {/* 顶部状态与工具栏 */}
      <header
        data-testid="workbench-page-header-container"
        className="h-13 px-5 py-3 border-b border-border-subtle bg-subtle flex items-center justify-between shrink-0"
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            data-testid="workbench-page-header-btn-back"
            onClick={() => setCurrentRoute('home')}
            className="px-2.5 py-1 text-xs rounded bg-panel border border-border-subtle hover:bg-hover text-text-secondary flex items-center gap-1 font-medium transition-colors whitespace-nowrap shrink-0"
          >
            ← 返回工作台
          </button>
          <span
            data-testid="workbench-page-header-badge-status"
            className={`w-3 h-3 rounded-full shrink-0 ${
              status === 'RECORDING'
                ? 'bg-status-danger animate-pulse'
                : 'bg-text-tertiary'
            }`}
            title={status === 'RECORDING' ? '正在录音' : '已暂停'}
          />
          <h1
            data-testid="workbench-page-header-text-title"
            className="text-base font-semibold truncate max-w-xs"
          >
            {title}
          </h1>
          <HeaderTimer />

          {/* 会中参会人员信息识别展示（支持直接点击胶囊重命名对应声纹说话人） */}
          <div
            data-testid="workbench-page-header-badge-speakers"
            className="hidden lg:flex items-center gap-1.5 text-xs bg-panel px-2.5 py-1 rounded-md border border-border-subtle whitespace-nowrap overflow-x-auto max-w-md"
            title="本场端侧声纹识别参会人名单，点击姓名可修改全部同声纹发言"
          >
            <span className="text-text-tertiary whitespace-nowrap shrink-0">👥 参会人:</span>
            {speakerRoster.map((sp) => (
              <button
                key={sp.key}
                type="button"
                data-testid={`workbench-page-header-btn-speaker-${sp.key}`}
                onClick={() => {
                  setEditingHeaderSpeaker({ key: sp.key, name: sp.name });
                  setHeaderSpeakerDraft(sp.name);
                  setRememberSpeakerVoice(false);
                }}
                className="px-1.5 py-0.5 rounded text-[11px] bg-subtle hover:bg-active text-text-secondary hover:text-brand-blue font-mono border border-border-subtle flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                title="点击重命名该说话人"
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getSpeakerDotClass(sp.colorIndex)}`} />
                <span>{sp.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
          {status !== 'RECORDING' ? (
            <button
              type="button"
              data-testid="workbench-page-header-btn-start-record"
              onClick={() => (status === 'PAUSED' ? resumeMeeting() : startMeeting(title))}
              className="px-3 py-1.5 text-xs bg-status-success text-white hover:opacity-90 rounded-md font-medium transition-opacity flex items-center gap-1.5"
            >
              <span>▶</span>
              <span>{status === 'PAUSED' ? '继续录制' : '开始录制'}</span>
            </button>
          ) : (
            <button
              type="button"
              data-testid="workbench-page-header-btn-pause-record"
              onClick={pauseMeeting}
              className="px-3 py-1.5 text-xs bg-panel border border-border-subtle text-text-primary hover:bg-hover rounded-md font-medium transition-colors"
            >
              ⏸ 暂停
            </button>
          )}

          <button
            type="button"
            data-testid="workbench-page-header-btn-minimize-to-pill"
            onClick={handleMinimizeToPill}
            className="px-3 py-1.5 text-xs bg-panel hover:bg-border-subtle text-text-secondary rounded-md transition-colors"
          >
            最小化至悬浮条
          </button>
          <button
            type="button"
            data-testid="workbench-page-header-btn-end-meeting"
            disabled={isGeneratingSummary}
            onClick={endMeeting}
            className="px-3 py-1.5 text-xs bg-status-danger text-white hover:opacity-90 rounded-md font-medium transition-opacity disabled:opacity-60 flex items-center gap-1.5"
          >
            {isGeneratingSummary ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                <span>提炼全场总结中...</span>
              </>
            ) : (
              <span>结束会议</span>
            )}
          </button>
        </div>
      </header>

      {/* 顶部参会人快速重命名弹窗 */}
      {editingHeaderSpeaker && (
        <div
          data-testid="workbench-page-header-modal-rename-speaker"
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        >
          <div className="bg-canvas border border-border-strong rounded-xl p-4 w-80 space-y-3 shadow-xl">
            <h3 className="text-xs font-bold text-text-primary">
              重命名说话人「{editingHeaderSpeaker.name}」
            </h3>
            <p className="text-[11px] text-text-secondary">
              修改后，本场该声纹聚类（{editingHeaderSpeaker.key}）的所有历史与后续发言将自动更新为此姓名。
            </p>
            <input
              type="text"
              data-testid="workbench-page-header-input-rename-speaker"
              value={headerSpeakerDraft}
              autoFocus
              onChange={(e) => setHeaderSpeakerDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && headerSpeakerDraft.trim()) {
                  const cleanName = headerSpeakerDraft.trim();
                  handleRenameSpeakerUnified(editingHeaderSpeaker.key, cleanName);
                  if (rememberSpeakerVoice) {
                    if (voiceprintConsentAt) {
                      commitVoiceprintEnrollment(editingHeaderSpeaker.key, cleanName, true);
                    } else {
                      setPendingVoiceprintConsent({
                        speakerKey: editingHeaderSpeaker.key,
                        displayName: cleanName,
                      });
                    }
                  }
                  setEditingHeaderSpeaker(null);
                }
                if (e.key === 'Escape') {
                  setEditingHeaderSpeaker(null);
                }
              }}
              placeholder="输入真实姓名（如：张总、李架构师）"
              className="w-full px-3 py-1.5 text-xs bg-subtle border border-border-subtle rounded-md focus:outline-none focus:border-brand-blue text-text-primary"
            />
            <label className="flex items-start gap-2 text-[11px] text-text-secondary cursor-pointer select-none pt-0.5">
              <input
                type="checkbox"
                data-testid="workbench-page-header-checkbox-remember-voice"
                checked={rememberSpeakerVoice}
                onChange={(e) => setRememberSpeakerVoice(e.target.checked)}
                className="mt-0.5 accent-brand-blue"
              />
              <span>
                记住此人的声音（仅存本机加密声纹库，后续会议自动匹配为该姓名）
              </span>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                data-testid="workbench-page-header-btn-cancel-rename-speaker"
                onClick={() => setEditingHeaderSpeaker(null)}
                className="px-2.5 py-1 text-xs rounded bg-subtle text-text-secondary hover:bg-panel"
              >
                取消
              </button>
              <button
                type="button"
                data-testid="workbench-page-header-btn-confirm-rename-speaker"
                onClick={() => {
                  if (headerSpeakerDraft.trim()) {
                    const cleanName = headerSpeakerDraft.trim();
                    handleRenameSpeakerUnified(editingHeaderSpeaker.key, cleanName);
                    if (rememberSpeakerVoice) {
                      if (voiceprintConsentAt) {
                        commitVoiceprintEnrollment(editingHeaderSpeaker.key, cleanName, true);
                      } else {
                        setPendingVoiceprintConsent({
                          speakerKey: editingHeaderSpeaker.key,
                          displayName: cleanName,
                        });
                      }
                    }
                  }
                  setEditingHeaderSpeaker(null);
                }}
                className="px-3 py-1 text-xs rounded bg-brand-blue text-white font-medium hover:bg-brand-blue-hover"
              >
                确认命名
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 首次声纹记录隐私授权确认弹窗 (T09 Local-First 隐私主权) */}
      {pendingVoiceprintConsent && (
        <div
          data-testid="workbench-page-modal-voiceprint-consent"
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
        >
          <div className="bg-canvas border border-border-strong rounded-xl p-5 w-96 space-y-3.5 shadow-xl">
            <h3 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
              <span>🔒</span>
              <span>本地声纹特征记录授权确认</span>
            </h3>
            <div className="text-xs text-text-secondary space-y-2 leading-relaxed">
              <p>
                您正在为参会人「<strong className="text-text-primary">{pendingVoiceprintConsent.displayName}</strong>
                」开启跨会议声纹记忆。请确认以下隐私保护承诺：
              </p>
              <ul className="list-disc pl-4 space-y-1 text-[11px]">
                <li>仅在本机提取并加密存储 192 维数学特征向量，默认不保存原始录音片段；</li>
                <li>声纹数据严禁上传云端、不进入大模型上下文或任何日志；</li>
                <li>您可随时在「系统设置 → 声纹与参会人档案」中查看、导出或彻底删除。</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                data-testid="workbench-page-btn-decline-voiceprint-consent"
                onClick={() => setPendingVoiceprintConsent(null)}
                className="px-3 py-1.5 text-xs rounded bg-subtle text-text-secondary hover:bg-panel"
              >
                仅改名不记声纹
              </button>
              <button
                type="button"
                data-testid="workbench-page-btn-accept-voiceprint-consent"
                onClick={() => {
                  commitVoiceprintEnrollment(
                    pendingVoiceprintConsent.speakerKey,
                    pendingVoiceprintConsent.displayName,
                    true
                  );
                  setPendingVoiceprintConsent(null);
                }}
                className="px-3.5 py-1.5 text-xs rounded bg-brand-blue text-white font-medium hover:bg-brand-blue-hover"
              >
                同意授权并保存在本机
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 主体工作区：左 54% 洞察看板 + 右 46% 逐字稿 */}
      <main className="flex flex-1 overflow-hidden">
        {/* 左侧看板：实时洞察、结论与问答 (54%) */}
        <section
          data-testid="workbench-page-insights-panel-container"
          className="w-[54%] border-r border-border-subtle flex flex-col bg-canvas overflow-hidden"
        >
          {/* 洞察类型筛选 Tab */}
          <div
            data-testid="workbench-page-insights-panel-tabs-filter"
            className="px-4 py-2.5 border-b border-border-subtle bg-subtle flex items-center justify-between shrink-0"
          >
            <div className="flex items-center gap-1.5">
              {([
                { id: 'all', label: '全部洞察' },
                { id: 'decision', label: '关键结论' },
                { id: 'action', label: '待办项' },
                { id: 'risk', label: '风险争议' },
                { id: 'fact', label: '核心事实' },
                { id: 'qa', label: '本场问答' },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`workbench-page-insights-panel-tab-${tab.id}`}
                  onClick={() => setActiveFilter(tab.id as 'all' | InsightType)}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    activeFilter === tab.id
                      ? 'bg-brand-blue text-white font-medium'
                      : 'text-text-secondary hover:bg-panel'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <span
              data-testid="workbench-page-insights-panel-text-count"
              className="text-xs text-text-tertiary tabular-nums"
            >
              已提炼 {filteredInsights.length} 项
            </span>
          </div>

          {/* AI 增量洞察提炼中指示条 */}
          {isExtractingInsights && (
            <div
              data-testid="workbench-page-insights-panel-text-extracting"
              className="px-4 py-1.5 bg-brand-blue/10 border-b border-brand-blue/20 flex items-center gap-2 text-[11px] text-brand-blue shrink-0 animate-pulse"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-brand-blue animate-ping" />
              <span>✦ AI 正在结合上下文提炼关键结论与待办...</span>
            </div>
          )}

          {/* 洞察卡片滚动列表 */}
          <div
            data-testid="workbench-page-insights-panel-list-cards"
            className="flex-1 overflow-y-auto p-4 space-y-3.5"
          >
            {filteredInsights.length === 0 ? (
              <div
                data-testid="workbench-page-insights-panel-empty-state"
                className="h-full flex flex-col items-center justify-center text-text-tertiary text-xs"
              >
                <span>🎙️ 正在倾听发言，实时提炼关键结论与待办...</span>
              </div>
            ) : (
              filteredInsights.map((card) => (
                <InsightCardItem
                  key={card.id}
                  card={card}
                  onViewEvidence={setHighlightedTranscriptId}
                  onConfirm={confirmInsight}
                  onKeepCurrent={keepCurrentInsightVersion}
                  onAcceptRevision={acceptInsightRevision}
                />
              ))
            )}
          </div>

          {/* 提问中加载指示 */}
          {isAsking && (
            <div
              data-testid="workbench-page-insights-panel-div-asking-indicator"
              className="px-4 py-1.5 bg-brand-blue/10 border-t border-brand-blue/20 flex items-center gap-2 text-[11px] text-brand-blue shrink-0 animate-pulse"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-brand-blue animate-ping" />
              <span>✦ 听序正在依据全场逐字稿思考分析，请稍候...</span>
            </div>
          )}

          {/* 底部提问输入框 */}
          <form
            onSubmit={handleAskQuestion}
            data-testid="workbench-page-insights-panel-form-ask"
            className="p-3 border-t border-border-subtle bg-subtle flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={questionText}
              disabled={isAsking}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder={isAsking ? '正在生成回答...' : '向听序提问本场会议（如：大家就排期达成一致了吗？）'}
              data-testid="workbench-page-insights-panel-input-ask-question"
              className="flex-1 px-3 py-2 text-xs bg-canvas border border-border-subtle rounded-md focus:outline-none focus:border-brand-blue text-text-primary placeholder:text-text-tertiary disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isAsking || !questionText.trim()}
              data-testid="workbench-page-insights-panel-btn-send-question"
              className="px-3.5 py-2 text-xs bg-brand-blue text-white rounded-md hover:bg-brand-blue-hover transition-colors font-medium shrink-0 disabled:opacity-50"
            >
              {isAsking ? '思考中...' : '提问'}
            </button>
          </form>
        </section>

        {/* 右侧逐字稿：双轨实时转写流 (46%) */}
        <section
          data-testid="workbench-page-transcript-panel-container"
          className="w-[46%] flex flex-col bg-subtle overflow-hidden relative"
        >
          {/* 逐字稿顶部信息与搜索 */}
          <div className="px-4 py-2.5 border-b border-border-subtle bg-canvas flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <span
                data-testid="workbench-page-transcript-panel-text-status"
                className="text-xs font-semibold text-text-primary"
              >
                实时逐字稿
              </span>
              <span
                data-testid="workbench-page-transcript-panel-badge-channel-source"
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 ${
                  micStatus === 'denied' || micStatus === 'error'
                    ? 'bg-status-danger/10 text-status-danger'
                    : asrStatus === 'connected'
                    ? 'bg-status-success-bg text-status-success'
                    : 'bg-brand-blue-subtle text-brand-blue'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    micStatus === 'denied' || micStatus === 'error'
                      ? 'bg-status-danger'
                      : rmsLevel > 0.05
                      ? 'bg-emerald-400 animate-ping'
                      : 'bg-brand-blue'
                  }`}
                />
                {micStatus === 'denied'
                  ? '麦克风权限受阻'
                  : micStatus === 'error'
                  ? '麦克风异常'
                  : asrStatus === 'connected'
                  ? '实时转写已就绪'
                  : asrStatus === 'connecting'
                  ? '转写引擎连接中...'
                  : '麦克风拾音中'}
              </span>

              {/* 麦克风物理音量指示跳动条 */}
              {status === 'RECORDING' && micStatus === 'recording' && (
                <div
                  title="实时麦克风音量能量"
                  className="w-12 h-1.5 rounded-full bg-subtle overflow-hidden flex items-center border border-border-subtle"
                >
                  <div
                    className="h-full bg-emerald-500 transition-all duration-75"
                    style={{ width: `${Math.min(100, Math.round(rmsLevel * 250))}%` }}
                  />
                </div>
              )}

              {/* 麦克风输入设备切换下拉框 */}
              <select
                data-testid="workbench-page-transcript-panel-select-mic-device"
                value={selectedMicId}
                onChange={(e) => handleSwitchMicrophone(e.target.value)}
                className="text-[11px] px-2 py-0.5 rounded bg-subtle border border-border-subtle text-text-secondary focus:outline-none focus:border-brand-blue max-w-[140px] truncate"
                title="选择拾音麦克风（支持蓝牙耳机/系统内置麦克风平滑切换）"
              >
                <option value="">默认系统麦克风</option>
                {availableMics.map((mic) => (
                  <option key={mic.deviceId} value={mic.deviceId}>
                    {mic.label}
                  </option>
                ))}
              </select>
            </div>

            <input
              type="text"
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              placeholder="快速过滤逐字稿..."
              data-testid="workbench-page-transcript-panel-input-filter"
              className="px-2.5 py-1 text-xs bg-subtle border border-border-subtle rounded focus:outline-none focus:border-brand-blue text-text-primary w-40"
            />
          </div>

          {/* 麦克风或 ASR 真实异常提示条 */}
          {micError && (
            <div
              data-testid="workbench-page-transcript-panel-alert-mic-error"
              className="m-3 p-2.5 rounded bg-status-danger/10 border border-status-danger/30 text-status-danger text-xs flex items-center justify-between"
            >
              <span>⚠️ {micError}</span>
            </div>
          )}

          {asrError && (
            <div
              data-testid="workbench-page-transcript-panel-alert-asr-error"
              className="m-3 p-2.5 rounded bg-status-warning-bg border border-status-warning-border text-status-warning text-xs flex items-center justify-between"
            >
              <span>⚠️ {asrError}</span>
              <button
                type="button"
                data-testid="workbench-page-transcript-panel-btn-dismiss-asr-error"
                onClick={() => setAsrError('')}
                className="text-text-tertiary hover:text-text-primary px-1.5 py-0.5 rounded text-xs font-bold transition-colors"
                title="关闭提示"
              >
                ✕
              </button>
            </div>
          )}

          {/* 逐字稿高亮依据提示条 */}
          {highlightedTranscriptId && (
            <div
              data-testid="workbench-page-transcript-panel-text-highlight-hint"
              className="px-4 py-1.5 bg-brand-blue-subtle/80 text-brand-blue border-b border-brand-blue/30 flex items-center justify-between text-xs animate-fadeIn"
            >
              <div className="flex items-center gap-1.5 font-medium">
                <span>📍</span>
                <span>已定位并高亮洞察依据发言（3秒后自动恢复）</span>
              </div>
              <button
                type="button"
                data-testid="workbench-page-transcript-panel-btn-clear-highlight"
                onClick={() => setHighlightedTranscriptId(null)}
                className="text-text-tertiary hover:text-brand-blue text-[11px] px-1"
              >
                ✕
              </button>
            </div>
          )}

          {/* 逐字稿滚动段落列表 */}
          <div
            ref={transcriptListRef}
            onScroll={handleTranscriptScroll}
            data-testid="workbench-page-transcript-panel-list-segments"
            className="flex-1 overflow-y-auto p-4 space-y-3"
          >
            {filteredTranscripts.length === 0 && !interimText ? (
              <div
                data-testid="workbench-page-transcript-panel-empty-state"
                className="h-full flex flex-col items-center justify-center text-text-tertiary text-xs space-y-2"
              >
                {micStatus === 'denied' ? (
                  <span className="text-status-danger">请在系统设置中允许听序使用麦克风以开启实时转写</span>
                ) : asrStatus === 'connected' ? (
                  <span>🎙️ 麦克风已开启，请开始发言，语音将实时转写为文字...</span>
                ) : (
                  <span>等待麦克风与系统音频输入...</span>
                )}
              </div>
            ) : (
              <>
                {filteredTranscripts.map((segment) => (
                  <TranscriptRow
                    key={segment.id}
                    segment={segment}
                    isHighlighted={highlightedTranscriptId === segment.id}
                    onRenameSpeaker={handleRenameSpeakerUnified}
                    onConfirmTentative={handleConfirmTentativeMatch}
                    onRejectTentative={handleRejectTentativeMatch}
                  />
                ))}
                {interimText && (
                  <div
                    data-testid="workbench-page-transcript-panel-div-interim"
                    className="p-3 rounded-lg border border-brand-blue/30 bg-brand-blue/5 text-xs text-text-primary flex items-center gap-2 animate-pulse"
                  >
                    <span className="w-2 h-2 rounded-full bg-brand-blue animate-ping" />
                    <span className="text-text-secondary font-mono text-[11px]">正在转写:</span>
                    <span className="font-medium text-brand-blue">{interimText}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 逐字稿向上翻阅时的悬浮吸底按钮 */}
          {isUserScrolledUp && (
            <button
              type="button"
              data-testid="workbench-page-transcript-panel-btn-scroll-bottom"
              onClick={() => {
                setIsUserScrolledUp(false);
                scrollToBottom(true);
              }}
              className="absolute bottom-12 right-6 px-3 py-1.5 rounded-full bg-brand-blue text-white text-xs shadow-md hover:bg-brand-blue-hover flex items-center gap-1.5 transition-all z-10 font-medium cursor-pointer"
            >
              <span>↓</span>
              <span>回到最新发言</span>
            </button>
          )}

          {/* 逐字稿底部统计 */}
          <div className="px-4 py-2 border-t border-border-subtle bg-canvas flex items-center justify-between text-[11px] text-text-tertiary shrink-0">
            <span data-testid="workbench-page-transcript-panel-text-storage">
              本地 SQLite 毫秒级写入
            </span>
            <span
              data-testid="workbench-page-transcript-panel-text-count"
              className="tabular-nums font-mono"
            >
              已收录 {transcripts.length} 段发言
            </span>
          </div>
        </section>
      </main>
    </div>
  );
};
