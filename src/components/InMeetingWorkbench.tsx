import React, { useState, useRef, useEffect, memo, useCallback, useMemo } from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import { formatSeconds } from '../utils/formatTime';
import { InsightCard, InsightType, TranscriptSegment } from '../types/meeting';
import { getMeetingPipelineService, type CaptureMode } from '../audio/meetingPipelineService';
import { getTingxuClient } from '../api/tingxuClient';
import { getByokLlmClient } from '../api/byokLlmClient';

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
  const [copiedQa, setCopiedQa] = useState(false);

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
          className="p-2.5 rounded bg-panel/70 border border-border-subtle text-xs text-text-primary leading-relaxed space-y-1.5"
        >
          <div className="flex items-center justify-between text-[10px] text-brand-blue font-semibold">
            <span className="flex items-center gap-1.5">
              <span>🤖</span>
              <span>听序回答</span>
            </span>
            <button
              type="button"
              data-testid={`workbench-page-insights-panel-btn-copy-qa-${card.id}`}
              onClick={() => {
                if (navigator?.clipboard?.writeText) {
                  navigator.clipboard.writeText(card.content).catch(() => {});
                }
                setCopiedQa(true);
                setTimeout(() => setCopiedQa(false), 1500);
              }}
              className="text-text-secondary hover:text-brand-blue text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-canvas border border-transparent hover:border-border-subtle transition-colors cursor-pointer"
              title="复制回答内容"
            >
              <span>{copiedQa ? '✓' : '📋'}</span>
              <span>{copiedQa ? '已复制' : '复制'}</span>
            </button>
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
              {segment.speakerStatus === 'pending' && <span data-testid={`workbench-page-transcript-panel-badge-speaker-pending-${segment.id}`} className="text-[10px] text-text-secondary">说话人识别中</span>}
              {typeof segment.speakerConfidence === 'number' && (
                <span
                  data-testid={`workbench-page-transcript-panel-badge-speaker-confidence-${segment.id}`}
                  className="text-[10px] px-1 py-0.2 rounded bg-brand-blue-subtle text-brand-blue font-mono tabular-nums"
                  title={`端侧声纹相似度 ${Math.round(segment.speakerConfidence * 100)}%：算法基于发音生物特征计算，90% 以上代表极高确定性，确认属于该发言人`}
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
        {segment.isCorrected && (
          <span
            data-testid={`workbench-page-transcript-panel-badge-corrected-${segment.id}`}
            title={`✨ AI 实时纠偏前原文: "${segment.rawText || ''}"`}
            className="ml-1.5 inline-flex items-center text-[10px] px-1 py-0.2 rounded bg-brand-blue/10 text-brand-blue border border-brand-blue/20 font-medium select-none cursor-help"
          >
            ✨ 润色
          </span>
        )}
      </p>
    </div>
  );
});

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
    toggleFloatingPill,
    setCurrentRoute,
    startMeeting,
    pauseMeeting,
    resumeMeeting,
    endMeeting,
    addInsight,
    isGeneratingSummary,
    isDrainingAsr,
    audioDeviceStop,
    asrDrainWarning,
    renameSpeaker,
    voiceprintConsentAt,
    registerSpeakerProfile,
    markProfileMatched,
    dismissTentativeMatch,
    appearanceSettings,
    setAppearanceSettings,
    voiceprintSettings,
    setMeetingSpeakerMode,
    insightError,
    setInsightError,
    // 实时会议管道全局状态与 setters (020)
    micStatus,
    micError,
    asrStatus,
    setAsrStatus,
    asrError,
    rmsLevel,
    interimText,
    interimParts,
    isExtractingInsights,
    isSystemAudioActive,
    selectedMicId,
    setSelectedMicId,
    auxDeviceId,
    setAuxDeviceId,
    captureMode,
    setCaptureMode,
    availableMics,
    setAvailableMics,
    updateMeetingTitle,
    liveInsightSettings,
    updateLiveInsightSettings,
    triggerManualInsight,
    byokSettings,
  } = useMeetingStore();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const [activeFilter, setActiveFilter] = useState<'all' | InsightType>('all');
  const [filterKeyword, setFilterKeyword] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [showAudioHelpModal, setShowAudioHelpModal] = useState<boolean>(false);
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

  const FONT_SIZES = ['small', 'medium', 'large', 'xlarge'] as const;
  const FONT_SIZE_LABELS: Record<string, string> = {
    small: '紧凑 12px (-2px)',
    medium: '标准 14px',
    large: '舒适 16px (+2px)',
    xlarge: '醒目 18px (+4px)',
  };

  const handleIncreaseFontSize = () => {
    const currentIndex = FONT_SIZES.indexOf(appearanceSettings.fontSize);
    if (currentIndex < FONT_SIZES.length - 1) {
      setAppearanceSettings({ fontSize: FONT_SIZES[currentIndex + 1] });
    }
  };

  const handleDecreaseFontSize = () => {
    const currentIndex = FONT_SIZES.indexOf(appearanceSettings.fontSize);
    if (currentIndex > 0) {
      setAppearanceSettings({ fontSize: FONT_SIZES[currentIndex - 1] });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          handleIncreaseFontSize();
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          handleDecreaseFontSize();
        } else if (e.key === '0') {
          e.preventDefault();
          setAppearanceSettings({ fontSize: 'medium' });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appearanceSettings.fontSize, setAppearanceSettings]);

  // 初始化加载音频输入设备列表并自动侦测 Teams/内录辅助设备（通过音频门面服务统一调度）
  useEffect(() => {
    getMeetingPipelineService()
      .discoverDevices()
      .then(({ availableMics, autoDetectedAuxId }) => {
        setAvailableMics(availableMics);
        if (autoDetectedAuxId && autoDetectedAuxId !== selectedMicId) {
          setAuxDeviceId(autoDetectedAuxId);
        }
      })
      .catch(() => {});
  }, [selectedMicId]);

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
  const speakerClusterer = getMeetingPipelineService().getSpeakerClusterer();

  // 保证会中工作台挂载时，常驻会议流管道处于监听与附着状态 (020)
  useEffect(() => {
    getMeetingPipelineService().attach();
  }, []);

  // 监听并实时更新会中在线声纹聚类器参数 (T11)
  useEffect(() => {
    speakerClusterer.updateOptions({
      similarityThreshold: voiceprintSettings.similarityThreshold,
      continuityThreshold: voiceprintSettings.continuityThreshold,
      minClusterDurationMs: voiceprintSettings.minClusterDurationMs,
    });
  }, [voiceprintSettings, speakerClusterer]);

  const commitVoiceprintEnrollment = useCallback(
    (speakerKey: string, displayName: string, explicitConsent: boolean) => {
      const clusterVp = speakerClusterer.getClusterVoiceprint(speakerKey);
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
    [registerSpeakerProfile, speakerClusterer]
  );

  const handleRenameSpeakerUnified = useCallback(
    (speakerIdOrOldName: string, newName: string, alsoEnrollVoiceprint = true) => {
      const cleanName = newName.trim();
      if (!cleanName) return;
      speakerClusterer.renameSpeaker(speakerIdOrOldName, cleanName);
      renameSpeaker(speakerIdOrOldName, cleanName);

      // 无论在逐字稿中还是控制台重命名，只要改为了明确的参会人姓名，自动同步注册为本地声纹与参会人档案
      if (alsoEnrollVoiceprint) {
        commitVoiceprintEnrollment(speakerIdOrOldName, cleanName, true);
      }
    },
    [renameSpeaker, commitVoiceprintEnrollment, speakerClusterer]
  );

  const handleConfirmTentativeMatch = useCallback(
    (speakerId: string, profileId: string, profileName: string) => {
      speakerClusterer.confirmProfileMatch(speakerId, profileId, profileName);
      markProfileMatched(profileId);
      renameSpeaker(speakerId, profileName);
    },
    [markProfileMatched, renameSpeaker, speakerClusterer]
  );

  const handleRejectTentativeMatch = useCallback(
    (speakerId: string, profileId: string) => {
      speakerClusterer.rejectProfileMatch(speakerId, profileId);
      dismissTentativeMatch(speakerId, profileId);
    },
    [dismissTentativeMatch, speakerClusterer]
  );

  // 手动切换麦克风输入设备 (通过常驻会议管道)
  const handleSwitchMicrophone = useCallback(async (newDeviceId: string) => {
    setSelectedMicId(newDeviceId);
    try {
      await getMeetingPipelineService().switchDevice(newDeviceId || undefined);
    } catch (err: any) {
      console.warn('切换音频设备失败:', err);
    }
  }, [setSelectedMicId]);

  // 切换拾音模式（扬声器外放开会 / 仅个人麦克风）
  const handleSwitchCaptureMode = useCallback(async (newMode: CaptureMode) => {
    setCaptureMode(newMode);
    try {
      await getMeetingPipelineService().setCaptureMode(newMode);
    } catch (err: any) {
      console.warn('切换拾音模式失败:', err);
    }
  }, [setCaptureMode]);

  // 切换系统声音内录（免驱本地混音，用于戴耳机开会场景）
  const handleToggleSystemAudio = useCallback(async () => {
    try {
      await getMeetingPipelineService().toggleSystemAudio();
    } catch (err: any) {
      console.warn('切换系统内录失败:', err);
    }
  }, []);

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
    toggleFloatingPill(true);
  }, [toggleFloatingPill]);

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;

    const q = questionText.trim();
    setQuestionText('');
    setIsAsking(true);

    try {
      const { byokSettings, gatewayUrl } = useMeetingStore.getState();
      const isStandaloneConfigured =
        byokSettings.mode === 'standalone' &&
        (Boolean(byokSettings.llmApiKey.trim()) || byokSettings.llmProvider === 'ollama');

      let data: any;
      const chatReq = {
        meetingId: meetingId || 'meet_live',
        question: q,
        transcripts: transcripts.length
          ? transcripts.map((t) => ({ id: t.id, speaker: t.speaker, text: t.text }))
          : [{ id: 'seg_init', speaker: '系统', text: '本场会议已开启，正在监听双轨音频。' }],
      };

      if (isStandaloneConfigured) {
        data = await getByokLlmClient().chatCopilot(chatReq, byokSettings);
      } else {
        const client = getTingxuClient();
        if ('setGatewayUrl' in client) {
          (client as any).setGatewayUrl(gatewayUrl);
        }
        data = await client.copilot.chat(chatReq);
      }

      const evidenceId =
        data.citations?.[0]?.segmentId ||
        transcripts[transcripts.length - 1]?.id ||
        '';

      addInsight({
        id: `qa-${Date.now()}`,
        type: 'qa',
        title: `提问：${q}`,
        question: q,
        content: data.answer || '已完成本场会议问答分析。',
        timestamp: formatSeconds(useMeetingStore.getState().elapsedSeconds),
        evidenceSegmentId: evidenceId,
      });

      // 提问完成后若不在全部或问答视图，自动切到全部让用户立刻看到问答卡片
      if (activeFilter !== 'all' && activeFilter !== 'qa') {
        setActiveFilter('all');
      }
    } catch {
      // 彻底废除假数据生成：网关异常时明确提示真实错误，绝不臆造会议内容 (对齐 AGENTS.md 铁律)
      alert('⚠️ AI 网关处理请求失败或网络不可达。根据安全防臆造铁律，系统已拒绝生成离线假数据，请确保网关运行正常后重试。');
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
          {isEditingTitle ? (
            <div className="flex items-center gap-1 shrink min-w-0">
              <input
                type="text"
                data-testid="workbench-page-header-input-edit-title"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (titleDraft.trim()) updateMeetingTitle(titleDraft.trim());
                    setIsEditingTitle(false);
                  } else if (e.key === 'Escape') {
                    setIsEditingTitle(false);
                  }
                }}
                autoFocus
                className="px-2 py-0.5 text-xs bg-canvas border border-brand-blue rounded text-text-primary outline-hidden max-w-[160px] xl:max-w-xs shadow-2xs"
                placeholder="修改会议主题..."
              />
              <button
                type="button"
                data-testid="workbench-page-header-btn-save-title"
                onClick={() => {
                  if (titleDraft.trim()) updateMeetingTitle(titleDraft.trim());
                  setIsEditingTitle(false);
                }}
                className="px-1.5 py-0.5 text-[10px] bg-brand-blue text-white rounded font-medium hover:bg-brand-blue-hover transition-colors shrink-0 shadow-2xs cursor-pointer"
              >
                保存
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 min-w-0 max-w-[180px] xl:max-w-xs shrink group">
              <h1
                data-testid="workbench-page-header-text-title"
                onClick={() => {
                  setTitleDraft(title);
                  setIsEditingTitle(true);
                }}
                className="text-base font-semibold truncate cursor-pointer hover:text-brand-blue transition-colors"
                title={`${title} (点击修改主题)`}
              >
                {title}
              </h1>
              <button
                type="button"
                data-testid="workbench-page-header-btn-edit-title"
                onClick={() => {
                  setTitleDraft(title);
                  setIsEditingTitle(true);
                }}
                className="opacity-0 group-hover:opacity-100 hover:text-brand-blue text-text-tertiary transition-opacity p-0.5 rounded text-xs cursor-pointer shrink-0"
                title="修改会议主题"
              >
                ✏️
              </button>
            </div>
          )}
          <HeaderTimer />

          {/* 会中参会人员信息识别展示（支持直接点击胶囊重命名对应声纹说话人） */}
          <div
            data-testid="workbench-page-header-badge-speakers"
            className="hidden xl:flex items-center gap-1.5 text-xs bg-panel px-2.5 py-1 rounded-md border border-border-subtle whitespace-nowrap overflow-x-auto max-w-sm"
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
          {audioDeviceStop && !isDrainingAsr && <span data-testid="workbench-page-header-text-audio-stopping" className="text-xs text-text-secondary">等待音频设备释放…</span>}
          {isDrainingAsr && <span data-testid="workbench-page-header-text-asr-draining" className="text-xs text-text-secondary">正在完成最后一句…</span>}
          {status !== 'RECORDING' ? (
            <button
              type="button"
              data-testid="workbench-page-header-btn-start-record"
              disabled={isDrainingAsr || isGeneratingSummary || Boolean(audioDeviceStop)}
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

          {/* 快捷字号缩放胶囊 */}
          <div className="flex items-center bg-panel border border-border-subtle rounded-md px-1 py-0.5 text-xs">
            <button
              type="button"
              data-testid="workbench-page-header-btn-font-decrease"
              disabled={appearanceSettings.fontSize === 'small'}
              onClick={handleDecreaseFontSize}
              title="缩小字号 (Cmd/Ctrl + -)"
              className="px-1.5 py-0.5 hover:bg-subtle text-text-secondary hover:text-text-primary rounded disabled:opacity-40 transition-colors font-medium text-[11px]"
            >
              A-
            </button>
            <span
              data-testid="workbench-page-header-badge-font-size"
              className="px-1.5 text-[11px] text-text-tertiary select-none font-mono"
            >
              {FONT_SIZE_LABELS[appearanceSettings.fontSize] || '标准 14px'}
            </span>
            <button
              type="button"
              data-testid="workbench-page-header-btn-font-increase"
              disabled={appearanceSettings.fontSize === 'xlarge'}
              onClick={handleIncreaseFontSize}
              title="放大字号 (Cmd/Ctrl + +)"
              className="px-1.5 py-0.5 hover:bg-subtle text-text-secondary hover:text-text-primary rounded disabled:opacity-40 transition-colors font-medium text-[11px]"
            >
              A+
            </button>
          </div>

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
            disabled={isGeneratingSummary || isDrainingAsr}
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

      {asrDrainWarning && <div role="status" data-testid="workbench-page-transcript-panel-text-unfinalized-warning" className="px-4 py-2 text-xs text-status-warning bg-status-warning-bg">{asrDrainWarning}</div>}
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
                  handleRenameSpeakerUnified(editingHeaderSpeaker.key, cleanName, false);
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
                    handleRenameSpeakerUnified(editingHeaderSpeaker.key, cleanName, false);
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
                <li>仅在本机提取并加密存储 192 维数学特征向量，声纹档案不另存原始片段；会议录音仅保存在本机；</li>
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
            className="px-3.5 py-2 border-b border-border-subtle bg-subtle flex items-center justify-between gap-2 shrink-0 min-w-0"
          >
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              {([
                { id: 'all', label: '全部', title: '全部洞察' },
                { id: 'decision', label: '结论', title: '关键结论与决策' },
                { id: 'action', label: '待办', title: '行动待办事项' },
                { id: 'risk', label: '风险', title: '风险预警与分歧' },
                { id: 'fact', label: '事实', title: '核心事实与背景' },
                { id: 'qa', label: '问答', title: '本场即时问答' },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`workbench-page-insights-panel-tab-${tab.id}`}
                  onClick={() => setActiveFilter(tab.id as 'all' | InsightType)}
                  title={tab.title}
                  className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                    activeFilter === tab.id
                      ? 'bg-brand-blue text-white font-medium shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-panel'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <span
              data-testid="workbench-page-insights-panel-text-count"
              className="text-[11px] text-text-tertiary tabular-nums whitespace-nowrap shrink-0 font-mono"
            >
              {filteredInsights.length} 项
            </span>
          </div>

          {/* 实时洞察控频与手动提炼工具栏 (Plan 026 算力降费) */}
          <div
            data-testid="workbench-page-insights-panel-toolbar-control"
            className="px-3 py-1.5 border-b border-border-subtle bg-panel/40 flex items-center justify-between gap-2 shrink-0 text-xs"
          >
            {/* 模式切换小胶囊 */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-text-tertiary">模式:</span>
              <button
                type="button"
                data-testid="workbench-page-insights-panel-btn-mode-manual"
                onClick={() => updateLiveInsightSettings({ mode: 'manual' })}
                className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  liveInsightSettings.mode === 'manual'
                    ? 'bg-brand-blue/15 text-brand-blue border border-brand-blue/30 font-semibold'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
                title="手动按需提炼：开会过程不自动消耗 Token，点击【立即提炼】才触发，最省钱"
              >
                ⚡ 手动按需
              </button>
              <button
                type="button"
                data-testid="workbench-page-insights-panel-btn-mode-periodic"
                onClick={() => updateLiveInsightSettings({ mode: 'periodic' })}
                className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  liveInsightSettings.mode === 'periodic'
                    ? 'bg-brand-blue/15 text-brand-blue border border-brand-blue/30 font-semibold'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
                title={`自动周期提炼：每隔 ${liveInsightSettings.intervalSeconds || 120} 秒自动提炼一次`}
              >
                ⏱ 自动 ({liveInsightSettings.intervalSeconds || 120}s)
              </button>
              <button
                type="button"
                data-testid="workbench-page-insights-panel-btn-mode-disabled"
                onClick={() => updateLiveInsightSettings({ mode: 'disabled' })}
                className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  liveInsightSettings.mode === 'disabled'
                    ? 'bg-status-danger/15 text-status-danger border border-status-danger/30 font-semibold'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
                title="完全关闭：会中不进行任何实时洞察，0 AI 费用；会后仍可一键总结"
              >
                ⏸ 关闭
              </button>
            </div>

            {/* 手动提炼按钮 */}
            <button
              type="button"
              data-testid="workbench-page-insights-panel-btn-trigger-manual"
              disabled={isExtractingInsights || transcripts.length === 0}
              onClick={() => void triggerManualInsight()}
              className="px-2.5 py-0.5 rounded bg-brand-blue text-white hover:bg-brand-blue-hover text-[11px] font-medium flex items-center gap-1 shadow-2xs transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              title="立即提取当前未整理的发言结论与待办"
            >
              <span>{isExtractingInsights ? '⏳' : '⚡'}</span>
              <span>{isExtractingInsights ? '提炼中...' : '立即提炼洞察'}</span>
            </button>
          </div>

          {/* 洞察已关闭提示条 */}
          {liveInsightSettings.mode === 'disabled' && (
            <div
              data-testid="workbench-page-insights-panel-banner-disabled"
              className="px-3.5 py-1.5 bg-subtle border-b border-border-subtle flex items-center justify-between text-[11px] text-text-tertiary shrink-0"
            >
              <span>💡 会中实时洞察已暂停（0 算力开销）。可点击右上角「立即提炼」或等待会后完整纪要。</span>
              <button
                type="button"
                onClick={() => updateLiveInsightSettings({ mode: 'manual' })}
                className="text-brand-blue hover:underline ml-2 whitespace-nowrap"
              >
                开启手动提炼
              </button>
            </div>
          )}

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

          {/* AI 洞察提取异常警示条 */}
          {insightError && (
            <div
              data-testid="workbench-page-insights-panel-banner-error"
              className="px-4 py-2 bg-status-danger/10 border-b border-status-danger/30 flex items-center justify-between text-xs text-status-danger shrink-0"
            >
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <span className="leading-snug">{insightError}</span>
              </div>
              <button
                type="button"
                data-testid="workbench-page-insights-panel-btn-dismiss-error"
                onClick={() => setInsightError(null)}
                className="px-2 py-0.5 rounded bg-status-danger/15 hover:bg-status-danger/25 text-status-danger text-[11px] font-medium transition-colors shrink-0 ml-2"
                title="关闭错误提示"
              >
                ✕ 关闭
              </button>
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
          {/* 逐字稿顶部主栏：状态与场景模式即时切换 */}
          <div className="px-3.5 py-2 border-b border-border-subtle bg-canvas flex items-center justify-between gap-2 shrink-0 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <span
                data-testid="workbench-page-transcript-panel-text-status"
                className="text-xs font-semibold text-text-primary whitespace-nowrap"
              >
                实时逐字稿
              </span>
              <span
                data-testid="workbench-page-transcript-panel-badge-channel-source"
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 whitespace-nowrap ${
                  micStatus === 'denied' || micStatus === 'error'
                    ? 'bg-status-danger/10 text-status-danger'
                    : asrStatus === 'connected'
                    ? 'bg-status-success-bg text-status-success'
                    : 'bg-brand-blue-subtle text-brand-blue'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    micStatus === 'denied' || micStatus === 'error'
                      ? 'bg-status-danger'
                      : rmsLevel > 0.05
                      ? 'bg-emerald-400 animate-ping'
                      : 'bg-brand-blue'
                  }`}
                />
                {micStatus === 'denied'
                  ? '麦克风受阻'
                  : micStatus === 'error'
                  ? '设备异常'
                  : asrStatus === 'connected'
                  ? byokSettings.asrProvider === 'local_endpoint'
                    ? '本地ASR就绪'
                    : byokSettings.asrProvider === 'local_embedded'
                    ? '内嵌ASR就绪'
                    : '已就绪'
                  : asrStatus === 'connecting'
                  ? byokSettings.asrProvider === 'local_endpoint'
                    ? '本地ASR连接中'
                    : '连接中'
                  : asrStatus === 'error'
                  ? byokSettings.asrProvider === 'local_endpoint'
                    ? '本地ASR未连接'
                    : 'ASR异常'
                  : '拾音中'}
              </span>

              {/* 麦克风物理音量指示跳动条 */}
              {status === 'RECORDING' && micStatus === 'recording' && (
                <div
                  title="实时麦克风音量能量"
                  className="w-10 h-1.5 rounded-full bg-subtle overflow-hidden flex items-center border border-border-subtle shrink-0"
                >
                  <div
                    className="h-full bg-emerald-500 transition-all duration-75"
                    style={{ width: `${Math.min(100, Math.round(rmsLevel * 250))}%` }}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
              {/* 会议场景模式即时切换胶囊组 */}
              <div
                data-testid="workbench-page-transcript-panel-group-modes"
                className="flex items-center rounded-md border border-border-subtle bg-subtle p-0.5 text-[11px] shrink-0"
                title="根据当前会议场景即时动态调整说话人分离策略，会中随时生效"
              >
                <button
                  type="button"
                  data-testid="workbench-page-transcript-panel-btn-mode-single"
                  onClick={() => setMeetingSpeakerMode('single')}
                  className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap flex items-center gap-1 ${
                    !voiceprintSettings.enabled
                      ? 'bg-panel text-brand-blue font-semibold shadow-xs'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                  title="单人模式：不区分发言人，纯净文字记录，杜绝一人被切分为多位发言人"
                >
                  <span>🎙️ 单人模式</span>
                </button>
                <button
                  type="button"
                  data-testid="workbench-page-transcript-panel-btn-mode-balanced"
                  onClick={() => setMeetingSpeakerMode('balanced')}
                  className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap flex items-center gap-1 ${
                    voiceprintSettings.enabled && voiceprintSettings.presetMode === 'balanced'
                      ? 'bg-panel text-brand-blue font-semibold shadow-xs'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                  title="标准多人模式：开启说话人分离，平衡相似度与连续性，适用于 2~6 人例会"
                >
                  <span>👥 标准多人</span>
                </button>
                <button
                  type="button"
                  data-testid="workbench-page-transcript-panel-btn-mode-sensitive"
                  onClick={() => setMeetingSpeakerMode('sensitive')}
                  className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap flex items-center gap-1 ${
                    voiceprintSettings.enabled && voiceprintSettings.presetMode === 'sensitive'
                      ? 'bg-panel text-brand-blue font-semibold shadow-xs'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                  title="多人激辩模式：高灵敏度声纹切分，快速捕捉频繁抢话与多方快速交替"
                >
                  <span>⚡ 多人激辩</span>
                </button>
              </div>

              <input
                type="text"
                value={filterKeyword}
                onChange={(e) => setFilterKeyword(e.target.value)}
                placeholder="过滤..."
                data-testid="workbench-page-transcript-panel-input-filter"
                className="px-2 py-0.5 text-[11px] bg-subtle border border-border-subtle rounded focus:outline-none focus:border-brand-blue text-text-primary w-20 focus:w-28 transition-all shrink-0"
              />
            </div>
          </div>

          {/* 逐字稿次级工具条：音频设备拾音与系统内录配置 */}
          <div className="px-3.5 py-1.5 border-b border-border-subtle bg-subtle/50 flex items-center justify-between gap-2 text-xs shrink-0 min-w-0">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 min-w-0">
              {/* 麦克风输入设备切换下拉框 */}
              <select
                data-testid="workbench-page-transcript-panel-select-mic-device"
                value={selectedMicId}
                onChange={(e) => handleSwitchMicrophone(e.target.value)}
                className="text-[11px] px-2 py-0.5 rounded bg-panel border border-border-subtle text-text-secondary focus:outline-none focus:border-brand-blue max-w-[130px] truncate shrink-0"
                title="选择拾音麦克风（支持蓝牙耳机/系统内置麦克风平滑切换）"
              >
                <option value="">默认麦克风</option>
                {availableMics.map((mic) => (
                  <option key={mic.deviceId} value={mic.deviceId}>
                    {mic.label}
                  </option>
                ))}
              </select>

              {/* 拾音模式选择：外放开会全员收音 vs 仅个人麦克风 */}
              <select
                data-testid="workbench-page-transcript-panel-select-capture-mode"
                value={captureMode}
                onChange={(e) => handleSwitchCaptureMode(e.target.value as CaptureMode)}
                className="text-[11px] px-2 py-0.5 rounded bg-panel border border-border-subtle text-text-secondary focus:outline-none focus:border-brand-blue max-w-[140px] truncate shrink-0"
                title="开会时推荐使用【扬声器外放开会】，麦克风将同时拾取扬声器播放的他人声音"
              >
                <option value="speaker_meeting">🔊 扬声器外放 (全员收音)</option>
                <option value="mic_only">🎤 仅个人麦克风</option>
              </select>

              {/* 戴耳机免驱系统声音内录开关 */}
              <button
                type="button"
                data-testid="workbench-page-transcript-panel-btn-toggle-system-audio"
                onClick={handleToggleSystemAudio}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
                  isSystemAudioActive
                    ? 'bg-status-success/15 border-status-success/40 text-status-success font-medium'
                    : 'bg-panel border-border-subtle text-text-secondary hover:text-text-primary'
                }`}
                title="戴耳机开会时，实时捕获 Teams/腾讯会议中远端同事声音并转文字（录音保存在本机）"
              >
                {isSystemAudioActive ? '🎧 远端声音收录中' : '🎧 开启系统内录'}
              </button>

              {/* 自动检测到的 Teams / 会议内录混音通道徽章 */}
              {auxDeviceId && (
                <span
                  data-testid="workbench-page-transcript-panel-badge-aux-audio"
                  className="text-[10px] px-1.5 py-0.5 rounded bg-brand-blue-subtle text-brand-blue border border-brand-blue/30 font-medium flex items-center gap-1 shrink-0 whitespace-nowrap"
                  title="检测到会议虚拟音频设备，已开启双轨本地混音"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-blue animate-pulse" />
                  已混音: {availableMics.find((d) => d.deviceId === auxDeviceId)?.label || 'Teams音频'}
                </span>
              )}
            </div>

            {/* 音频收音排查指南小图标 */}
            <button
              type="button"
              data-testid="workbench-page-transcript-panel-btn-audio-troubleshoot"
              onClick={() => setShowAudioHelpModal(true)}
              className="text-text-tertiary hover:text-brand-blue text-[11px] px-1 py-0.5 rounded transition-colors shrink-0"
              title="音频收音排查指南"
            >
              <span>(?)</span>
            </button>
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
              className="m-3 p-2.5 rounded bg-status-warning-bg border border-status-warning-border text-status-warning text-xs flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="shrink-0">⚠️</span>
                <span className="leading-snug truncate" title={asrError}>{asrError}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {byokSettings.asrProvider === 'local_endpoint' && (
                  <button
                    type="button"
                    data-testid="workbench-page-transcript-panel-btn-open-asr-settings"
                    onClick={() => setCurrentRoute('settings')}
                    className="px-2 py-0.5 rounded bg-brand-blue text-white text-[11px] font-medium hover:bg-brand-blue-hover transition-colors shadow-2xs whitespace-nowrap"
                  >
                    配置端点
                  </button>
                )}
                <button
                  type="button"
                  data-testid="workbench-page-transcript-panel-btn-dismiss-asr-error"
                  onClick={() => setAsrStatus(asrStatus, '')}
                  className="text-text-tertiary hover:text-text-primary px-1.5 py-0.5 rounded text-xs font-bold transition-colors"
                  title="关闭提示"
                >
                  ✕
                </button>
              </div>
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
                    className="p-3 rounded-lg border border-brand-blue/30 bg-brand-blue/5 text-xs text-text-primary flex items-center gap-2"
                  >
                    <span aria-hidden="true" data-testid="workbench-page-transcript-panel-div-interim-dot" className="w-2 h-2 rounded-full bg-brand-blue" />
                    <span data-testid="workbench-page-transcript-panel-text-interim-label" className="text-text-secondary font-mono text-[11px]">正在转写:</span>
                    <span data-testid="workbench-page-transcript-panel-text-interim-content">
                      <span data-testid="workbench-page-transcript-panel-text-interim-stable" className="text-text-primary">{interimParts.stable}</span>
                      <span data-testid="workbench-page-transcript-panel-text-interim-unstable" className="text-text-secondary">{interimParts.unstable}</span>
                    </span>
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

      {/* 听不到对方声音排查指南弹窗 */}
      {showAudioHelpModal && (
        <div
          data-testid="workbench-page-transcript-panel-modal-audio-help"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <div className="bg-panel border border-border-subtle rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <span>🎙️</span> 会议音频收音排查指南
              </h3>
              <button
                type="button"
                data-testid="workbench-page-transcript-panel-btn-close-audio-help"
                onClick={() => setShowAudioHelpModal(false)}
                className="text-text-secondary hover:text-text-primary text-xs px-2 py-1 rounded"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-text-secondary leading-relaxed">
              {auxDeviceId && (
                <div className="p-3 rounded-lg bg-brand-blue-subtle/40 border border-brand-blue/30 space-y-1">
                  <div className="font-semibold text-brand-blue flex items-center gap-1.5">
                    <span>⚡ 已自动接入虚拟内录通道：{availableMics.find((d) => d.deviceId === auxDeviceId)?.label || 'Teams音频'}</span>
                  </div>
                  <p className="text-[11px] text-text-secondary">
                    听序已为您开启双轨本地混音：您的 AirPods 负责采集本人发言，此虚拟通道负责采集远端同事发言。
                  </p>
                </div>
              )}

              <div className="p-3 rounded-lg bg-bg-canvas border border-border-subtle space-y-1.5">
                <div className="font-semibold text-text-primary flex items-center gap-1.5">
                  <span>🔊 场景一：使用电脑扬声器开会（不戴耳机）</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-success/20 text-status-success font-medium">推荐最简</span>
                </div>
                <p>
                  普通麦克风自带的“回声消除”机制会主动将电脑扬声器播放出来的他人声音当做噪音过滤。
                  只需将拾音模式切换为<strong>【扬声器外放开会】</strong>，听序会自动关闭回声消除，使麦克风同时灵敏收录 Teams/腾讯会议中其他人的发言！
                </p>
                <button
                  type="button"
                  data-testid="workbench-page-transcript-panel-btn-help-switch-speaker"
                  onClick={() => {
                    handleSwitchCaptureMode('speaker_meeting');
                    setShowAudioHelpModal(false);
                  }}
                  className="mt-1 px-3 py-1.5 rounded bg-brand-blue text-white text-xs font-medium hover:bg-brand-blue-hover transition-colors"
                >
                  一键切换为【扬声器外放开会】模式
                </button>
              </div>

              <div className="p-3 rounded-lg bg-bg-canvas border border-border-subtle space-y-1.5">
                <div className="font-semibold text-text-primary flex items-center gap-1.5">
                  <span>🎧 场景二：戴耳机开会（AirPods / 蓝牙 / 有线耳机）</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-blue-subtle text-brand-blue font-medium">macOS 原生数字截流</span>
                </div>
                <p>
                  由于声音封闭在耳机耳塞内部，外部物理麦克风无法收到声音。
                  听序已接入 macOS 原生 ScreenCaptureKit 免驱系统音频截流技术，支持直接从系统声卡/Teams 捕获纯数字流，并与麦克风实时混音后转文字。
                  若首次提示系统授权，请在 macOS【系统设置】→【隐私与安全性】→【屏幕与系统音频录制】中允许听序即可。
                </p>
                <button
                  type="button"
                  data-testid="workbench-page-transcript-panel-btn-help-start-system-audio"
                  onClick={() => {
                    handleToggleSystemAudio();
                    setShowAudioHelpModal(false);
                  }}
                  className="mt-1 px-3 py-1.5 rounded bg-brand-blue-subtle text-brand-blue border border-brand-blue/30 text-xs font-medium hover:bg-brand-blue/15 transition-colors"
                >
                  {isSystemAudioActive ? '系统内录已处于开启状态' : '立即启动【系统声音内录】'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
