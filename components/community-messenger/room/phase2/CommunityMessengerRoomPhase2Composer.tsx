"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { ArrowUp, Mic, Plus, Trash2 } from "lucide-react";
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { communityMessengerRoomIsGloballyUsable } from "@/lib/community-messenger/types";
import { defaultTradeChatRoomHref } from "@/lib/chats/trade-chat-notification-href";
import { CM_CLUSTER_GAP_MS } from "@/lib/community-messenger/room/messenger-room-ui-constants";
import { describeManagementEvent } from "@/lib/community-messenger/room/describe-management-event";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { BOTTOM_NAV_STACK_ABOVE_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { useMessengerRoomUiStore } from "@/lib/community-messenger/stores/messenger-room-ui-store";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import {
  communityMessengerMemberAvatar,
  communityMessengerMessageSearchText,
  communityMessengerVoiceAudioSrc,
  extractHttpUrls,
  formatDuration,
  formatFileMeta,
  formatParticipantStatus,
  formatRoomCallStatus,
  formatTime,
  formatVoiceRecordTenThousandths,
  getLatestCallStubForSession,
  looksLikeDirectImageUrl,
  mergeRoomMessages,
  VoiceRecordingLiveWaveform,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import {
  CommunityMessengerTradeProcessSection,
  GroupRoomCallOverlay,
  MessengerTradeChatRoomDetailPrefetch,
  SeedTradeChatDetailMemoryFromSnapshot,
  VoiceMessageBubble,
} from "@/components/community-messenger/room/community-messenger-room-phase2-lazy";
import { useMessengerRoomPhase2ComposerView } from "@/components/community-messenger/room/phase2/messenger-room-phase2-composer-context";
import { useMessengerRoomMobileViewport } from "@/components/community-messenger/room/phase2/messenger-room-mobile-viewport-context";
import { useMobileKeyboardInset } from "@/lib/ui/use-mobile-keyboard-inset";
import {
  MESSENGER_COMPOSER_FOOTER_PADDING_DEFAULT_PX,
  MESSENGER_COMPOSER_FOOTER_PADDING_IOS_SLACK_PX,
  MESSENGER_COMPOSER_KEYBOARD_INSET_IOS_EXTRA_PX,
  MESSENGER_DELIVERY_COMPOSER_FOOTER_EXTRA_PX,
} from "@/lib/ui/messenger-chat-viewport-tuning";
import { useMatchMaxWidthMd } from "@/lib/ui/use-match-max-width";
import { isLikelyIosWebKit } from "@/lib/ui/is-likely-ios-webkit";
import { useCommunityMessengerRoomTypingPublisher } from "@/lib/community-messenger/realtime/typing/use-community-messenger-room-typing";
import { cmMessengerPerfVerboseLog } from "@/lib/community-messenger/room/cm-messenger-perf-verbose-log";
import { cancelScheduledWhenBrowserIdle, scheduleWhenBrowserIdle } from "@/lib/ui/network-policy";
import {
  notifyChatInputCommitForPerf,
  notifyChatInputKeydownForPerf,
  recordRouteEntryElapsedMetric,
  recordRouteEntryElapsedMetricOnce,
  recordRouteEntryFirstInteractive,
  recordRouteEntryMetric,
} from "@/lib/runtime/samarket-runtime-debug";
import { useMessengerRoomClientPhase1Context } from "@/lib/community-messenger/room/messenger-room-client-phase1-context";
import { getMessengerRoomComposerPhase2Bridge } from "@/lib/community-messenger/room/messenger-room-composer-phase2-bridge";
import {
  finalizeCmRoomEntryComposerFrameVisibleMs,
  getCmRoomEntryBootstrapMeta,
  isCmRoomEntryMilestoneFinalized,
} from "@/lib/community-messenger/room/cm-room-entry-instrumentation";
import {
  noteCmRoomSubtreeAttach,
  shouldBlockCmRoomStrictEffectReRun,
  shouldSkipCmRoomSubtreeSurfaceAttach,
} from "@/lib/community-messenger/room/cm-room-subtree-stability";
import {
  bumpCmPolishComposerRender,
  cmPolishAnalysisEnabled,
  logCmPolishAnalysis,
  recordCmPolishSendClick,
} from "@/lib/community-messenger/monitoring/cm-polish-analysis";
import {
  cmRenderAnalysisEnabled,
  logCmRenderAnalysis,
} from "@/lib/community-messenger/monitoring/cm-render-analysis";
import {
  buildReplyPreviewSnapshot,
  formatReplyQuoteKakaoHeader,
} from "@/lib/community-messenger/message-actions/message-reply-policy";
import { MessengerInputBar } from "@/components/community-messenger/line-ui";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";
import {
  DELIVERY_BUYER_QUICK_REPLY_KEYS,
  DELIVERY_OWNER_QUICK_REPLY_KEYS,
} from "@/lib/store-order-chat/delivery-room-quick-replies";
import type { MessageKey } from "@/lib/i18n/messages";

function isDomTextareaLikelyVisible(el: HTMLTextAreaElement): boolean {
  const st = window.getComputedStyle(el);
  if (st.visibility === "hidden" || st.display === "none" || st.pointerEvents === "none") return false;
  if (el.offsetWidth <= 0 || el.offsetHeight <= 0) return false;
  try {
    if (typeof el.checkVisibility === "function") {
      return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }
  } catch {
    /* ignore */
  }
  return true;
}

function recordCmComposerInputReadyMilestones(
  ta: HTMLTextAreaElement,
  notifyComposerTextareaVisibleForSeededBootstrap: () => void
): void {
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "composer_textarea_visible_ms");
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "input_ready_ms");
  recordRouteEntryFirstInteractive("messenger_room_entry");
  if (!ta.disabled) {
    recordRouteEntryElapsedMetricOnce("messenger_room_entry", "first_input_enabled_ms");
  }
  notifyComposerTextareaVisibleForSeededBootstrap();
}

type DeliveryVoiceRecordingPaneProps = {
  elapsedMs: number;
  peaks: number[];
  cancelHint: boolean;
  handsFree: boolean;
  onDelete: () => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

/** 배달 composer pill 안 녹음 UI — 마이크 슬롯 위치 고정을 위해 부모가 레이아웃만 담당 */
function DeliveryVoiceRecordingPane({
  elapsedMs,
  peaks,
  cancelHint,
  handsFree,
  onDelete,
  t,
}: DeliveryVoiceRecordingPaneProps) {
  const timer = (
    <span className="flex shrink-0 items-center gap-1 tabular-nums text-[13px] font-semibold leading-none text-[color:var(--delivery-dark)]">
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
      {formatVoiceRecordTenThousandths(elapsedMs)}
    </span>
  );
  if (handsFree) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5 pr-0.5">
        {timer}
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <VoiceRecordingLiveWaveform peaks={peaks} />
          <span className="shrink-0 text-[11px] font-medium leading-tight text-[color:var(--delivery-text-muted)]">
            {t("cm_ui_locked_recording")}
          </span>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[color:var(--delivery-icon-muted)]"
          aria-label={t("cm_ui_delete_recording")}
        >
          <Trash2 className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 pr-0.5">
      {timer}
      <VoiceRecordingLiveWaveform peaks={peaks} className="min-w-0 flex-1" />
      <span
        className={`shrink-0 text-[11px] leading-tight ${
          cancelHint ? "font-medium text-red-600" : "text-[color:var(--delivery-text-muted)]"
        }`}
      >
        {t("cm_ui_slide_to_cancel")}
      </span>
    </div>
  );
}

export const CommunityMessengerRoomPhase2Composer = memo(function CommunityMessengerRoomPhase2Composer({
  onPass1ComposerReady,
  composerEntryVisible = true,
  composerSurfaceMode = "phase2",
}: {
  onPass1ComposerReady?: () => void;
  /** Phase2 셸이 사용자에게 보일 때만 textarea·input_ready 마일스톤 (invisible pass0 제외) */
  composerEntryVisible?: boolean;
  /** R2-M7: phase1 선커밋 surface vs phase2 본체(마일스톤 중복 방지) */
  composerSurfaceMode?: "phase1" | "phase2";
}) {
  const composerRenderPassStartRef = useRef(typeof performance !== "undefined" ? performance.now() : 0);
  composerRenderPassStartRef.current = typeof performance !== "undefined" ? performance.now() : 0;
  if (cmPolishAnalysisEnabled()) bumpCmPolishComposerRender();
  const { t } = useI18n();
  const lastComposerPerfLogRef = useRef(0);
  const vm = useMessengerRoomPhase2ComposerView();
  const {
    notifyComposerTextareaVisibleForSeededBootstrap,
    loading: phase1Loading,
    snapshot: phase1Snapshot,
    replyToMessage,
    setReplyToMessage,
    focusTimelineMessage,
  } = useMessengerRoomClientPhase1Context();
  const roomKey = vm.snapshot.room.id;
  const [draft, setDraft] = useState("");
  const composerMountRecordedRef = useRef(false);
  const composerFrameFinalizedRef = useRef(false);
  const composerFrameLoggedRef = useRef(false);
  const composerEffectCountRef = useRef(0);
  const seededSilentHoldReleasedRef = useRef(false);
  const [typingPublisherEnabled, setTypingPublisherEnabled] = useState(false);
  const [composerHeavyEnabled, setComposerHeavyEnabled] = useState(false);

  useLayoutEffect(() => {
    setComposerHeavyEnabled(false);
    const idleId = scheduleWhenBrowserIdle(() => setComposerHeavyEnabled(true), 0);
    return () => {
      cancelScheduledWhenBrowserIdle(idleId);
    };
  }, [roomKey]);

  /** 방 전환·답장 주입·전송 실패 복원 등 — Phase1 `message` 가 바뀌면 draft 에 반영(타이핑은 draft 만 갱신). */
  useLayoutEffect(() => {
    if (!composerHeavyEnabled) return;
    composerEffectCountRef.current += 1;
    recordRouteEntryMetric("messenger_room_entry", "composer_use_layout_effect_count", composerEffectCountRef.current);
    setDraft(vm.message);
  }, [roomKey, vm.message, composerHeavyEnabled]);

  useLayoutEffect(() => {
    seededSilentHoldReleasedRef.current = false;
    setTypingPublisherEnabled(false);
    const t =
      typeof window !== "undefined"
        ? window.setTimeout(() => {
            scheduleWhenBrowserIdle(() => setTypingPublisherEnabled(true), 600);
          }, 0)
        : 0;
    return () => {
      if (t !== 0) clearTimeout(t);
    };
  }, [roomKey]);

  useLayoutEffect(() => {
    if (composerFrameLoggedRef.current) return;
    composerFrameLoggedRef.current = true;
    const frameMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : 0) - composerRenderPassStartRef.current
    );
    cmMessengerPerfVerboseLog("[cm-composer-fast-frame]", {
      frame_visible_ms: frameMs,
      heavy_features_deferred: true,
    });
  }, [roomKey]);

  useEffect(() => {
    if (!composerHeavyEnabled || !cmRenderAnalysisEnabled()) return;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (now - lastComposerPerfLogRef.current < 280) return;
    lastComposerPerfLogRef.current = now;
    const ms = Math.round(now - composerRenderPassStartRef.current);
    logCmRenderAnalysis({
      composer_render_ms: ms,
      rerender_reason: "composer_commit",
    });
  }, [composerHeavyEnabled, roomKey]);

  useLayoutEffect(() => {
    const rid = String(roomKey).trim();
    if (!rid || composerFrameFinalizedRef.current) return;
    if (composerSurfaceMode !== "phase1") return;
    if (shouldBlockCmRoomStrictEffectReRun(rid, "composer_frame_finalize")) return;
    composerFrameFinalizedRef.current = true;
    if (!composerMountRecordedRef.current) {
      composerMountRecordedRef.current = true;
      recordRouteEntryElapsedMetricOnce("messenger_room_entry", "composer_mount_start_ms");
      if (!shouldSkipCmRoomSubtreeSurfaceAttach(rid, "composer")) {
        noteCmRoomSubtreeAttach(rid, "composer");
      }
      recordRouteEntryElapsedMetric("messenger_room_entry", "composer_mount_ms");
      recordRouteEntryElapsedMetricOnce("messenger_room_entry", "composer_mount_done_ms");
    }
    const meta = getCmRoomEntryBootstrapMeta();
    if (!isCmRoomEntryMilestoneFinalized("composer_visible_ms")) {
      finalizeCmRoomEntryComposerFrameVisibleMs(rid, !meta.used_cached_snapshot);
    }
    onPass1ComposerReady?.();
    if (composerEntryVisible && !seededSilentHoldReleasedRef.current) {
      const ta = vm.composerTextareaRef.current;
      if (ta instanceof HTMLTextAreaElement && isDomTextareaLikelyVisible(ta)) {
        seededSilentHoldReleasedRef.current = true;
        recordCmComposerInputReadyMilestones(ta, notifyComposerTextareaVisibleForSeededBootstrap);
      }
    }
  }, [
    composerEntryVisible,
    composerSurfaceMode,
    roomKey,
    onPass1ComposerReady,
    notifyComposerTextareaVisibleForSeededBootstrap,
    vm.composerTextareaRef,
  ]);

  useLayoutEffect(() => {
    if (composerSurfaceMode !== "phase1" || !composerEntryVisible) return;
    const rid = String(roomKey).trim();
    if (shouldBlockCmRoomStrictEffectReRun(rid, "composer_textarea_hydrate")) return;
    if (seededSilentHoldReleasedRef.current) return;
    let cancelled = false;
    let frames = 0;
    const tryRelease = () => {
      if (cancelled || seededSilentHoldReleasedRef.current) return;
      if (vm.voiceRecording) {
        seededSilentHoldReleasedRef.current = true;
        notifyComposerTextareaVisibleForSeededBootstrap();
        return;
      }
      const ta = vm.composerTextareaRef.current;
      if (!ta || !isDomTextareaLikelyVisible(ta)) return;
      seededSilentHoldReleasedRef.current = true;
      recordCmComposerInputReadyMilestones(ta, notifyComposerTextareaVisibleForSeededBootstrap);
    };
    const loop = () => {
      if (cancelled || seededSilentHoldReleasedRef.current) return;
      tryRelease();
      if (seededSilentHoldReleasedRef.current || frames >= 48) return;
      frames += 1;
      requestAnimationFrame(loop);
    };
    tryRelease();
    if (!seededSilentHoldReleasedRef.current) requestAnimationFrame(loop);
    return () => {
      cancelled = true;
    };
  }, [
    composerSurfaceMode,
    composerEntryVisible,
    roomKey,
    vm.voiceRecording,
    vm.busy,
    vm.roomUnavailable,
    notifyComposerTextareaVisibleForSeededBootstrap,
    vm.composerTextareaRef,
  ]);
  useCommunityMessengerRoomTypingPublisher({
    roomId: typingPublisherEnabled ? vm.snapshot.room.id : null,
    viewerUserId: typingPublisherEnabled ? vm.snapshot.viewerUserId : null,
    draft: typingPublisherEnabled ? draft : "",
  });

  const globallyUsable = vm.snapshot ? communityMessengerRoomIsGloballyUsable(vm.snapshot.room) : false;
  const tradeOnlyBlocked =
    Boolean(vm.snapshot?.tradeMessaging) && vm.snapshot.tradeMessaging?.canSendMessage === false && globallyUsable;
  const ctx = vm.snapshot.room.contextMeta as CommunityMessengerRoomContextMetaV1 | null | undefined;
  const isDeliveryRoom = ctx?.kind === "delivery";
  const isOwnerDeliveryRoom = isDeliveryRoom && vm.snapshot.myRole === "owner";
  const deliveryInputPlaceholder = isDeliveryRoom ? t("store_delivery_chat_input_placeholder") : null;
  const deliveryQuickReplyKeys = isOwnerDeliveryRoom
    ? DELIVERY_OWNER_QUICK_REPLY_KEYS
    : isDeliveryRoom
      ? DELIVERY_BUYER_QUICK_REPLY_KEYS
      : [];

  const commitTextSend = useCallback(() => {
    if (
      vm.roomUnavailable ||
      !draft.trim() ||
      vm.busy === "send" ||
      vm.busy === "send-image" ||
      vm.busy === "send-file" ||
      vm.busy === "send-voice" ||
      vm.busy === "send-sticker" ||
      vm.busy === "delete-message"
    ) {
      return;
    }
    const text = draft.trim();
    recordCmPolishSendClick();
    setDraft("");
    void vm.sendMessage(text);
  }, [draft, vm]);

  const { keyboardOverlapSuppressed, messengerKeyboardChromeOpen } = useMessengerRoomMobileViewport();
  const keyboardInsetPx = useMobileKeyboardInset({
    enabled: composerHeavyEnabled,
    disableOverlapEstimate: keyboardOverlapSuppressed,
  });
  const isNarrowViewport = useMatchMaxWidthMd();
  /** 일반·그룹·오픈 포함 — 키보드 크롬 시 입력 줄 높이·여백 통일 */
  const messengerComposerDense = Boolean(
    isNarrowViewport && messengerKeyboardChromeOpen && !vm.voiceRecording
  );
  /**
   * - visualViewport 셸을 쓰면 겹침 추정을 끄고 safe-area + 기본 여백만.
   * - 그 외: 키보드 가림이 있으면 inset, 없으면 홈 인디케이터용 10px.
   * - iOS + 메신저 키보드 크롬: vv·innerHeight 미세 어긋남 보정용 slack.
   */
  const iosMessengerSlack =
    isLikelyIosWebKit() &&
    keyboardOverlapSuppressed &&
    messengerComposerDense &&
    keyboardInsetPx <= 0;
  const deliveryComposerBottomExtraPx =
    isDeliveryRoom && !vm.voiceRecording ? MESSENGER_DELIVERY_COMPOSER_FOOTER_EXTRA_PX : 0;
  const footerExtraBottomPx =
    keyboardInsetPx > 0
      ? keyboardInsetPx +
        (isLikelyIosWebKit() && messengerComposerDense ? MESSENGER_COMPOSER_KEYBOARD_INSET_IOS_EXTRA_PX : 0) +
        deliveryComposerBottomExtraPx
      : iosMessengerSlack
        ? MESSENGER_COMPOSER_FOOTER_PADDING_IOS_SLACK_PX + deliveryComposerBottomExtraPx
        : MESSENGER_COMPOSER_FOOTER_PADDING_DEFAULT_PX + deliveryComposerBottomExtraPx;
  /** vv 셸이 높이·safe-bottom 을 이미 맞춤 — sticky·추가 px 패딩은 키보드 시 composer 점프 원인 */
  const composerAnchoredByShell = keyboardOverlapSuppressed;
  const footerPaddingBottom = composerAnchoredByShell
    ? `calc(env(safe-area-inset-bottom, 0px) + max(var(--chat-safe-bottom, 0px), ${deliveryComposerBottomExtraPx || MESSENGER_COMPOSER_FOOTER_PADDING_DEFAULT_PX}px))`
    : `calc(env(safe-area-inset-bottom, 0px) + ${footerExtraBottomPx}px)`;
  const composerFooterInner = (
    <>
        {replyToMessage && !vm.voiceRecording ? (
          <div className="relative z-[1] mb-2 flex shrink-0 items-center gap-2 border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-primary-soft)] px-3 py-2">
            <button
              type="button"
              className="min-w-0 flex-1 border-l-2 border-[color:var(--cm-room-primary)] pl-2 text-left transition active:opacity-90"
              onClick={() => {
                void focusTimelineMessage(replyToMessage.id);
              }}
              aria-label={t("cm_ui_go_to_reply_target_message")}
            >
              <p className="sam-text-xxs font-bold leading-snug text-[color:var(--cm-room-primary)]">
                {formatReplyQuoteKakaoHeader(replyToMessage.senderLabel)}
              </p>
              <p className="mt-0.5 line-clamp-2 sam-text-helper text-[color:var(--cm-room-text-muted)]">
                {buildReplyPreviewSnapshot(replyToMessage).previewText}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setReplyToMessage(null)}
              className="shrink-0 rounded-ui-rect px-2 py-1 text-[12px] font-semibold text-[color:var(--cm-room-text-muted)] active:bg-sam-surface/80"
            >
              {t("common_cancel")}
            </button>
          </div>
        ) : null}
        {tradeOnlyBlocked ? (
          <div
            className="mb-2 rounded-sam-md border border-sam-warning/15 bg-sam-warning-soft px-3 py-2 sam-text-helper leading-snug text-sam-warning"
            role="status"
          >
            <p className="font-semibold break-words">
              {vm.snapshot.tradeMessaging?.denyMessage ?? "판매자가 대화를 종료했습니다. 새 메시지를 보낼 수 없습니다."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {vm.snapshot.room.peerUserId ? (
                <Link
                  href="/community-messenger?section=friends"
                  className="sam-btn sam-btn--primary sam-btn--sm"
                >
                  친구 추가
                </Link>
              ) : null}
              {vm.snapshot.room.contextMeta?.kind === "trade" &&
              typeof vm.snapshot.room.contextMeta.productChatId === "string" &&
              vm.snapshot.room.contextMeta.productChatId.trim() ? (
                <Link
                  href={defaultTradeChatRoomHref(vm.snapshot.room.contextMeta.productChatId.trim(), "product_chat")}
                  className="sam-btn sam-btn--outline sam-btn--sm"
                >
                  상품 상세보기
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
        {isDeliveryRoom && !vm.voiceRecording ? (
          <div
            className="delivery-ui mb-2 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="region"
            aria-label={t("store_delivery_chat_quick_replies_aria")}
          >
            {deliveryQuickReplyKeys.map((key) => (
              <button
                key={key}
                type="button"
                disabled={vm.roomUnavailable || vm.busy === "send"}
                onClick={() => {
                  void vm.sendMessage(t(key));
                }}
                className="delivery-ui shrink-0 rounded-full border border-[color:var(--delivery-chip-border)] bg-[color:var(--delivery-chip-bg)] px-2.5 py-1.5 text-[12px] font-medium leading-[1.35] text-[color:var(--delivery-primary)] active:bg-[color:var(--delivery-primary-soft)] disabled:opacity-45"
              >
                {t(key)}
              </button>
            ))}
          </div>
        ) : null}
        {isDeliveryRoom ? (
          <div
            data-delivery-composer-row
            className="delivery-ui flex w-full max-w-full min-h-0 items-center gap-1.5 pb-1"
          >
            {!vm.voiceRecording ? (
              <button
                type="button"
                data-delivery-composer-attach
                data-cm-line-plus-btn
                onClick={() => vm.setActiveSheet("attach")}
                className="flex h-9 w-9 shrink-0 items-center justify-center text-[#191919] transition active:opacity-70"
                aria-label={t("cm_ui_attachment_menu")}
              >
                <Plus className="h-[22px] w-[22px]" strokeWidth={1.75} />
              </button>
            ) : (
              <div className="h-9 w-9 shrink-0" aria-hidden />
            )}
            <div
              data-delivery-composer-pill
              className="flex min-h-[var(--delivery-composer-row-min-h)] min-w-0 flex-[1_1_0%] items-center gap-0.5 rounded-[18px] bg-[color:var(--delivery-composer-surface)] px-2.5 py-1"
            >
              {vm.voiceRecording ? (
                <DeliveryVoiceRecordingPane
                  elapsedMs={vm.voiceRecordElapsedMs}
                  peaks={vm.voiceLivePreviewBars}
                  cancelHint={vm.voiceCancelHint}
                  handsFree={vm.voiceHandsFree}
                  onDelete={() => void vm.finalizeVoiceRecording(false)}
                  t={t}
                />
              ) : (
                <textarea
                  ref={vm.composerTextareaRef}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    queueMicrotask(() => notifyChatInputCommitForPerf());
                  }}
                  onKeyDown={(e) => {
                    notifyChatInputKeydownForPerf();
                    if (e.key !== "Enter" && e.key !== "NumpadEnter") return;
                    if (e.shiftKey) return;
                    if (e.nativeEvent.isComposing) return;
                    e.preventDefault();
                    commitTextSend();
                  }}
                  onFocus={(e) => {
                    useMessengerRoomUiStore.getState().setComposerFocused(true);
                    const ta = e.currentTarget;
                    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
                    const skipScrollIntoView =
                      isNarrowViewport && messengerKeyboardChromeOpen && keyboardOverlapSuppressed;
                    window.requestAnimationFrame(() => {
                      window.requestAnimationFrame(() => {
                        if (cmPolishAnalysisEnabled() && typeof performance !== "undefined") {
                          logCmPolishAnalysis({
                            composer_focus_to_ready_ms: Math.round((performance.now() - t0) * 1000) / 1000,
                            room_id_suffix:
                              String(vm.snapshot.room.id ?? "").length > 8
                                ? String(vm.snapshot.room.id).slice(-8)
                                : String(vm.snapshot.room.id ?? ""),
                          });
                        }
                        if (skipScrollIntoView) return;
                        try {
                          ta.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
                        } catch {
                          ta.scrollIntoView({ block: "nearest" });
                        }
                      });
                    });
                  }}
                  onBlur={() => {
                    useMessengerRoomUiStore.getState().setComposerFocused(false);
                  }}
                  rows={1}
                  disabled={
                    vm.roomUnavailable ||
                    vm.busy === "delete-message" ||
                    vm.busy === "send-image" ||
                    vm.busy === "send-file" ||
                    vm.busy === "send-sticker"
                  }
                  placeholder={deliveryInputPlaceholder ?? t("nav_messenger_input_placeholder")}
                  className="max-h-[120px] min-h-[20px] w-full min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent p-0 text-[16px] leading-[1.25] text-[color:var(--delivery-dark)] shadow-none outline-none ring-0 placeholder:text-[#888888] focus:border-0 focus:shadow-none focus:outline-none focus:ring-0 focus-visible:shadow-none focus-visible:outline-none focus-visible:ring-0 disabled:opacity-50"
                />
              )}
              <div data-delivery-composer-mic-slot className="relative h-8 w-8 shrink-0">
                {vm.voiceMicArming ? (
                  <>
                    <span className="sam-cm-voice-mic-ripple-wave pointer-events-none" aria-hidden />
                    <span
                      className="sam-cm-voice-mic-ripple-wave sam-cm-voice-mic-ripple-wave--delay pointer-events-none"
                      aria-hidden
                    />
                  </>
                ) : null}
                <button
                  type="button"
                  data-cm-line-mic-btn
                  data-delivery-composer-mic
                  onPointerDown={vm.onVoiceMicPointerDown}
                  onPointerMove={vm.onVoiceMicPointerMove}
                  onPointerUp={vm.onVoiceMicPointerUp}
                  onPointerCancel={vm.onVoiceMicPointerCancel}
                  disabled={
                    vm.roomUnavailable ||
                    vm.busy === "send" ||
                    vm.busy === "send-image" ||
                    vm.busy === "send-file" ||
                    vm.busy === "send-voice" ||
                    vm.busy === "send-sticker" ||
                    vm.busy === "delete-message" ||
                    Boolean(draft.trim()) ||
                    (vm.voiceRecording && vm.voiceHandsFree) ||
                    (composerSurfaceMode === "phase1" && !getMessengerRoomComposerPhase2Bridge())
                  }
                  className={`absolute inset-0 z-[1] flex touch-none select-none items-center justify-center rounded-full transition-[colors,transform] duration-150 disabled:opacity-35 ${
                    vm.voiceMicArming || vm.voiceRecording
                      ? "scale-125 bg-[color:var(--delivery-primary-soft)] text-[color:var(--delivery-primary)]"
                      : "bg-transparent text-[color:var(--delivery-icon-muted)]"
                  }`}
                  aria-label={t("cm_ui_voice_message_recording_guide")}
                  title={
                    draft.trim()
                      ? t("cm_ui_clear_text_for_voice_recording")
                      : t("cm_ui_hold_record_send_slide_cancel_lock")
                  }
                >
                  <Mic className="h-5 w-5 shrink-0" strokeWidth={2} />
                </button>
              </div>
            </div>
            {vm.voiceRecording && vm.voiceHandsFree ? (
              <button
                type="button"
                data-cm-line-send-btn
                onClick={() => void vm.finalizeVoiceRecording(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--delivery-primary)] text-white transition active:opacity-90"
                aria-label={t("cm_ui_send_voice")}
              >
                <ArrowUp className="h-5 w-5" strokeWidth={2.25} />
              </button>
            ) : !vm.voiceRecording ? (
              <button
                type="button"
                data-cm-line-send-btn
                onClick={() => commitTextSend()}
                disabled={
                  vm.roomUnavailable ||
                  !draft.trim() ||
                  vm.busy === "send" ||
                  vm.busy === "send-image" ||
                  vm.busy === "send-file" ||
                  vm.busy === "send-voice" ||
                  vm.busy === "send-sticker" ||
                  vm.busy === "delete-message"
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--delivery-primary)] text-white transition active:opacity-90 disabled:bg-[#d0d0d0] disabled:text-[#888888] disabled:opacity-100"
                aria-label={t("common_send")}
              >
                <ArrowUp className="h-5 w-5" strokeWidth={2.25} />
              </button>
            ) : (
              <div className="h-9 w-9 shrink-0" aria-hidden />
            )}
          </div>
        ) : (
        <MessengerInputBar>
          <div className="flex min-h-[54px] min-w-0 items-center justify-center justify-self-stretch self-stretch">
            {!vm.voiceRecording ? (
              <button
                type="button"
                data-cm-line-plus-btn
                onClick={() => vm.setActiveSheet("attach")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-transparent text-[#1f2937] transition hover:bg-black/[0.06] active:bg-black/[0.08]"
                aria-label={t("cm_ui_attachment_menu")}
              >
                <Plus className="h-[21px] w-[21px]" strokeWidth={2} />
              </button>
            ) : (
              <div className="h-9 w-9 shrink-0" aria-hidden />
            )}
          </div>
          <div className="flex min-h-[54px] min-w-0 flex-1 items-center self-stretch py-1">
            {!vm.voiceRecording ? (
              <div className="relative flex h-[38px] min-h-[38px] w-full min-w-0 items-center">
                <textarea
                  ref={vm.composerTextareaRef}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    queueMicrotask(() => notifyChatInputCommitForPerf());
                  }}
                  onKeyDown={(e) => {
                    notifyChatInputKeydownForPerf();
                    if (e.key !== "Enter" && e.key !== "NumpadEnter") return;
                    if (e.shiftKey) return;
                    if (e.nativeEvent.isComposing) return;
                    e.preventDefault();
                    commitTextSend();
                  }}
                  onFocus={(e) => {
                    useMessengerRoomUiStore.getState().setComposerFocused(true);
                    const ta = e.currentTarget;
                    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
                    const skipScrollIntoView =
                      isNarrowViewport && messengerKeyboardChromeOpen && keyboardOverlapSuppressed;
                    window.requestAnimationFrame(() => {
                      window.requestAnimationFrame(() => {
                        if (cmPolishAnalysisEnabled() && typeof performance !== "undefined") {
                          logCmPolishAnalysis({
                            composer_focus_to_ready_ms: Math.round((performance.now() - t0) * 1000) / 1000,
                            room_id_suffix:
                              String(vm.snapshot.room.id ?? "").length > 8
                                ? String(vm.snapshot.room.id).slice(-8)
                                : String(vm.snapshot.room.id ?? ""),
                          });
                        }
                        if (skipScrollIntoView) return;
                        try {
                          ta.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
                        } catch {
                          ta.scrollIntoView({ block: "nearest" });
                        }
                      });
                    });
                  }}
                  onBlur={() => {
                    useMessengerRoomUiStore.getState().setComposerFocused(false);
                  }}
                  rows={1}
                  disabled={
                    vm.roomUnavailable ||
                    vm.busy === "delete-message" ||
                    vm.busy === "send-image" ||
                    vm.busy === "send-file" ||
                    vm.busy === "send-sticker"
                  }
                  placeholder={
                    tradeOnlyBlocked
                      ? vm.snapshot.tradeMessaging?.denyMessage ?? "메시지를 보낼 수 없습니다"
                      : vm.roomUnavailable
                        ? vm.snapshot.room.isReadonly
                          ? "읽기 전용 방입니다"
                          : vm.snapshot.room.roomStatus === "blocked"
                            ? "차단된 방입니다"
                            : "보관된 방입니다"
                        : vm.snapshot.clientShellPlaceholder
                          ? "메시지를 입력하세요"
                          : "메시지"
                  }
                  className={`h-[38px] max-h-[38px] min-h-[38px] w-full min-w-0 resize-none border-0 bg-transparent pr-11 text-[14px] leading-[1.35] outline-none ring-0 placeholder:text-[#65676b] focus:outline-none disabled:opacity-50 ${
                    messengerComposerDense ? "min-h-[38px]" : "min-h-[38px]"
                  }`}
                />
                <button
                  type="button"
                  data-cm-line-mic-btn
                  onPointerDown={vm.onVoiceMicPointerDown}
                  onPointerMove={vm.onVoiceMicPointerMove}
                  onPointerUp={vm.onVoiceMicPointerUp}
                  onPointerCancel={vm.onVoiceMicPointerCancel}
                  disabled={
                    vm.roomUnavailable ||
                    vm.busy === "send" ||
                    vm.busy === "send-image" ||
                    vm.busy === "send-file" ||
                    vm.busy === "send-voice" ||
                    vm.busy === "send-sticker" ||
                    vm.busy === "delete-message" ||
                    Boolean(draft.trim()) ||
                    (vm.voiceRecording && vm.voiceHandsFree) ||
                    (composerSurfaceMode === "phase1" && !getMessengerRoomComposerPhase2Bridge())
                  }
                  className={`sam-cm-voice-mic-ripple-btn absolute right-1.5 top-1/2 z-[5] flex h-8 w-8 -translate-y-1/2 touch-none select-none items-center justify-center rounded-full shadow-none transition-[transform,background-color,color] duration-200 disabled:text-[#9ca3af] disabled:opacity-45 ${
                    vm.voiceMicArming
                      ? "scale-[1.35] bg-[color:var(--cm-room-primary-soft)] text-[color:var(--cm-room-primary)] ring-2 ring-[color:var(--cm-room-primary)]/45"
                      : "scale-100 bg-transparent text-[#1f2937] hover:bg-black/[0.06] active:scale-[0.96] active:bg-black/[0.08]"
                  }`}
                  aria-label={t("cm_ui_voice_message_recording_guide")}
                  title={
                    draft.trim()
                      ? t("cm_ui_clear_text_for_voice_recording")
                      : t("cm_ui_hold_record_send_slide_cancel_lock")
                  }
                >
                  <Mic className="h-5 w-5" strokeWidth={2} />
                </button>
              </div>
            ) : vm.voiceHandsFree ? (
              <div className="flex h-[44px] min-h-[44px] max-h-[44px] min-w-0 w-full items-center gap-1.5 rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1 shadow-none">
                <span className="flex shrink-0 items-center gap-1 tabular-nums sam-text-body-secondary text-[13px] font-semibold leading-none text-sam-fg">
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sam-danger" />
                  {formatVoiceRecordTenThousandths(vm.voiceRecordElapsedMs)}
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <VoiceRecordingLiveWaveform peaks={vm.voiceLivePreviewBars} />
                  <span className="shrink-0 text-center sam-text-xxs font-medium leading-tight text-sam-fg">{t("cm_ui_locked_recording")}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void vm.finalizeVoiceRecording(false)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sam-border bg-sam-surface text-sam-muted shadow-none"
                  aria-label={t("cm_ui_delete_recording")}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => void vm.finalizeVoiceRecording(true)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sam-primary text-sam-on-primary shadow-none"
                  aria-label={t("cm_ui_send_voice")}
                >
                  <ArrowUp className="h-4 w-4 text-sam-on-primary" strokeWidth={2.25} />
                </button>
              </div>
            ) : (
              <div className="flex h-[44px] min-h-[44px] max-h-[44px] min-w-0 w-full items-center gap-1.5 rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1 shadow-none">
                <span className="flex shrink-0 items-center gap-1 tabular-nums sam-text-body-secondary text-[13px] font-semibold leading-none text-sam-fg">
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sam-danger" />
                  {formatVoiceRecordTenThousandths(vm.voiceRecordElapsedMs)}
                </span>
                <VoiceRecordingLiveWaveform peaks={vm.voiceLivePreviewBars} />
                <span
                  className={`min-w-0 shrink-0 text-center sam-text-xxs leading-tight ${
                    vm.voiceCancelHint ? "font-medium text-sam-danger" : "text-sam-muted"
                  }`}
                >
                  ‹ 밀어서 취소
                </span>
              </div>
            )}
          </div>

          <div className="flex min-h-[54px] min-w-0 items-center justify-center justify-self-stretch self-stretch">
            {!vm.voiceRecording ? (
              <button
                type="button"
                data-cm-line-send-btn
                onClick={() => commitTextSend()}
                disabled={
                  vm.roomUnavailable ||
                  !draft.trim() ||
                  vm.busy === "send" ||
                  vm.busy === "send-image" ||
                  vm.busy === "send-file" ||
                  vm.busy === "send-voice" ||
                  vm.busy === "send-sticker" ||
                  vm.busy === "delete-message"
                }
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-none transition active:scale-[0.98] disabled:text-white ${
                  isDeliveryRoom
                    ? "bg-[color:var(--delivery-primary)] disabled:bg-[color:var(--delivery-primary)]/40"
                    : "bg-[color:var(--cm-room-primary)] disabled:bg-[color:var(--cm-room-primary-disabled)]"
                }`}
                aria-label={t("common_send")}
              >
                <ArrowUp className="h-5 w-5" strokeWidth={2.25} />
              </button>
            ) : (
              <div className="pointer-events-none h-9 w-9 shrink-0" aria-hidden />
            )}
          </div>
        </MessengerInputBar>
        )}
    </>
  );

  const composerFooterClass = `z-[5] shrink-0 w-full max-w-full ${isDeliveryRoom ? "px-2 pt-1.5" : "px-3 pt-2"} shadow-none transition-[background-color] duration-200 ${
    composerAnchoredByShell ? "shrink-0" : "sticky bottom-0"
  } ${
    vm.voiceRecording && !isDeliveryRoom
      ? "border-t border-sky-200/90 bg-gradient-to-b from-sky-50/95 via-white to-white"
      : isDeliveryRoom
        ? "delivery-ui bg-white"
        : "border-t border-[#e5e7eb] bg-white"
  }`;

  return (
    <footer
      data-cm-composer
      {...(isDeliveryRoom || !vm.voiceRecording ? { "data-cm-line-composer-footer": true } : {})}
      className={composerFooterClass}
      style={{ paddingBottom: footerPaddingBottom }}
    >
      {composerFooterInner}
    </footer>
  );
});
