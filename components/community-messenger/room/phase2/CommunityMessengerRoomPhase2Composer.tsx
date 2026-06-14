"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
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
  getLatestCallStubForSession,
  looksLikeDirectImageUrl,
  mergeRoomMessages,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import {
  CommunityMessengerTradeProcessSection,
  GroupRoomCallOverlay,
  MessengerTradeChatRoomDetailPrefetch,
  SeedTradeChatDetailMemoryFromSnapshot,
  VoiceMessageBubble,
} from "@/components/community-messenger/room/community-messenger-room-phase2-lazy";
import { useMessengerRoomPhase2ComposerView } from "@/components/community-messenger/room/phase2/messenger-room-phase2-composer-context";
import { getMessengerRoomActionErrorMessage } from "@/lib/community-messenger/room/messenger-room-action-error-messages";
import { useMessengerRoomMobileViewport } from "@/components/community-messenger/room/phase2/messenger-room-mobile-viewport-context";
import { useMatchMaxWidthMd } from "@/lib/ui/use-match-max-width";
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
import { MessengerComposerSector } from "@/components/community-messenger/line-ui";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { resolveCommunityMessengerDeliveryContextMeta } from "@/lib/community-messenger/room-context-meta";
import {
  communityMessengerRoomIsConfirmedTrade,
  resolveMessengerDotMenuCallKind,
  resolveMessengerRoomFeatureGate,
} from "@/lib/community-messenger/messenger-room-domain";
import {
  normalizeTradeChatCallPolicy,
  tradeChatCallPolicyAllowsVideo,
  tradeChatCallPolicyAllowsVoice,
} from "@/lib/trade/trade-chat-call-policy";

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
  const { t, safeT } = useI18n();
  const lastComposerPerfLogRef = useRef(0);
  const vm = useMessengerRoomPhase2ComposerView();
  const {
    notifyComposerTextareaVisibleForSeededBootstrap,
    loading: phase1Loading,
    snapshot: phase1Snapshot,
    replyToMessage,
    setReplyToMessage,
    editingMessage,
    setEditingMessage,
    setMessage,
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
  const tradeBlockedMessage = useMemo(() => {
    const tm = vm.snapshot?.tradeMessaging;
    if (!tm || tm.canSendMessage !== false) return "";
    return (
      getMessengerRoomActionErrorMessage(tm.denyCode ?? undefined, t) ||
      tm.denyMessage ||
      t("nav_messenger_trade_seller_closed")
    );
  }, [vm.snapshot?.tradeMessaging, t]);
  const deliveryCtx = useMemo(
    () => resolveCommunityMessengerDeliveryContextMeta(vm.snapshot.room),
    [vm.snapshot.room.contextMeta, vm.snapshot.room.messengerDirectKey, vm.snapshot.room.summary]
  );
  const isDeliveryRoom = deliveryCtx != null;
  const isTradeRoom = communityMessengerRoomIsConfirmedTrade(vm.snapshot.room);
  const tradeCallPolicy = useMemo(() => {
    if (!isTradeRoom) return "none";
    return normalizeTradeChatCallPolicy(vm.snapshot.tradeChatRoomDetail?.product?.tradeChatCallPolicy);
  }, [isTradeRoom, vm.snapshot.tradeChatRoomDetail?.product?.tradeChatCallPolicy]);
  const composerFeatureGate = useMemo(
    () =>
      resolveMessengerRoomFeatureGate({
        callKind: resolveMessengerDotMenuCallKind(vm.snapshot.room, { isDeliveryRoom }),
        tradeAllowCall: tradeChatCallPolicyAllowsVoice(tradeCallPolicy),
        tradeVideoCallEnabled: tradeChatCallPolicyAllowsVideo(tradeCallPolicy),
        deliveryAllowVoiceMessage: deliveryCtx?.storeVoiceMessagesEnabled,
        deliveryAllowVoiceCall: deliveryCtx?.storeVoiceCallsEnabled,
        deliveryAllowVideoCall: deliveryCtx?.storeVideoCallsEnabled,
      }),
    [
      deliveryCtx?.storeVideoCallsEnabled,
      deliveryCtx?.storeVoiceCallsEnabled,
      deliveryCtx?.storeVoiceMessagesEnabled,
      isDeliveryRoom,
      tradeCallPolicy,
      vm.snapshot.room,
    ]
  );
  const deliveryInputPlaceholder = isDeliveryRoom ? t("store_delivery_chat_input_placeholder") : null;
  const composerPlaceholder = isDeliveryRoom
    ? (deliveryInputPlaceholder ?? safeT("nav_messenger_input_placeholder", { fallbackKo: "메시지를 입력하세요", fallbackEn: "Type a message" }))
    : tradeOnlyBlocked
      ? tradeBlockedMessage || safeT("cm_ui_cannot_send_message", { fallbackKo: "메시지를 보낼 수 없습니다", fallbackEn: "You cannot send messages" })
      : vm.roomUnavailable
        ? vm.snapshot.room.isReadonly
          ? safeT("cm_ui_read_only_room", { fallbackKo: "읽기 전용 방입니다", fallbackEn: "This room is read-only" })
          : vm.snapshot.room.roomStatus === "blocked"
            ? safeT("cm_ui_blocked_room", { fallbackKo: "차단된 방입니다", fallbackEn: "This room is blocked" })
            : safeT("cm_ui_archived_room", { fallbackKo: "보관된 방입니다", fallbackEn: "This room is archived" })
        : vm.snapshot.clientShellPlaceholder
          ? safeT("nav_messenger_input_placeholder", { fallbackKo: "메시지를 입력하세요", fallbackEn: "Type a message" })
          : safeT("cm_ui_message", { fallbackKo: "메시지", fallbackEn: "Message" });

  const commitTextSend = useCallback(() => {
    if (
      vm.roomUnavailable ||
      !draft.trim() ||
      vm.busy === "send-image" ||
      vm.busy === "send-file" ||
      vm.busy === "send-voice" ||
      vm.busy === "send-sticker" ||
      vm.busy === "delete-message" ||
      vm.busy === "edit-message"
    ) {
      return;
    }
    const text = draft.trim();
    recordCmPolishSendClick();
    setDraft("");
    void vm.sendMessage(text);
  }, [draft, vm]);

  const { keyboardOverlapSuppressed, messengerKeyboardChromeOpen } = useMessengerRoomMobileViewport();
  const isNarrowViewport = useMatchMaxWidthMd();
  const composerFooterInner = (
    <>
        {editingMessage && !vm.voiceRecording ? (
          <div className="relative z-[1] mb-2 flex shrink-0 items-center gap-2 border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-primary-soft)] px-3 py-2">
            <div className="min-w-0 flex-1 border-l-2 border-[color:var(--cm-room-primary)] pl-2">
              <p className="sam-text-xxs font-bold leading-snug text-[color:var(--cm-room-primary)]">
                {t("cm_ui_editing_message_banner")}
              </p>
              <p className="mt-0.5 line-clamp-2 sam-text-helper text-[color:var(--cm-room-text-muted)]">
                {editingMessage.content.trim()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingMessage(null);
                setMessage("");
                setDraft("");
              }}
              className="shrink-0 rounded-ui-rect px-2 py-1 text-[12px] font-semibold text-[color:var(--cm-room-text-muted)] active:bg-sam-surface/80"
            >
              {t("common_cancel")}
            </button>
          </div>
        ) : replyToMessage && !vm.voiceRecording ? (
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
            <p className="font-semibold break-words">{tradeBlockedMessage}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {vm.snapshot.room.peerUserId ? (
                <Link
                  href="/community-messenger?section=friends"
                  className="sam-btn sam-btn--primary sam-btn--sm"
                >
                  {t("cm_ui_add_friend")}
                </Link>
              ) : null}
              {vm.snapshot.room.contextMeta?.kind === "trade" &&
              typeof vm.snapshot.room.contextMeta.productChatId === "string" &&
              vm.snapshot.room.contextMeta.productChatId.trim() ? (
                <Link
                  href={defaultTradeChatRoomHref(vm.snapshot.room.contextMeta.productChatId.trim(), "product_chat")}
                  className="sam-btn sam-btn--outline sam-btn--sm"
                >
                  {t("cm_ui_view_product_detail")}
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
        <MessengerComposerSector
          draft={draft}
          placeholder={composerPlaceholder}
          textareaRef={vm.composerTextareaRef}
          onDraftChange={(value) => {
            setDraft(value);
            queueMicrotask(() => notifyChatInputCommitForPerf());
          }}
          onAttach={() => vm.setActiveSheet("attach")}
          onSend={commitTextSend}
          onTextareaKeyDown={(e) => {
            notifyChatInputKeydownForPerf();
            if (e.key !== "Enter" && e.key !== "NumpadEnter") return;
            if (e.shiftKey) return;
            if (e.nativeEvent.isComposing) return;
            e.preventDefault();
            commitTextSend();
          }}
          onTextareaFocus={(e) => {
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
          onTextareaBlur={() => {
            useMessengerRoomUiStore.getState().setComposerFocused(false);
          }}
          textareaDisabled={
            vm.roomUnavailable ||
            vm.busy === "delete-message" ||
            vm.busy === "send-image" ||
            vm.busy === "send-file" ||
            vm.busy === "send-sticker"
          }
          sendDisabled={
            vm.roomUnavailable ||
            !draft.trim() ||
            vm.busy === "send-image" ||
            vm.busy === "send-file" ||
            vm.busy === "send-sticker" ||
            vm.busy === "delete-message"
          }
          sendAriaLabel={
            vm.voiceRecording && vm.voiceHandsFree ? t("cm_ui_send_voice") : t("common_send")
          }
          attachAriaLabel={t("cm_ui_attachment_menu")}
          attachDisabled={vm.roomUnavailable}
          showVoiceMic={composerFeatureGate.allowVoiceMessage}
          voice={{
            recording: vm.voiceRecording,
            micArming: vm.voiceMicArming,
            handsFree: vm.voiceHandsFree,
            elapsedMs: vm.voiceRecordElapsedMs,
            peaks: vm.voiceLivePreviewBars,
            cancelHint: vm.voiceCancelHint,
            onMicPointerDown: vm.onVoiceMicPointerDown,
            onMicPointerMove: vm.onVoiceMicPointerMove,
            onMicPointerUp: vm.onVoiceMicPointerUp,
            onMicPointerCancel: vm.onVoiceMicPointerCancel,
            onFinalizeRecording: (send) => void vm.finalizeVoiceRecording(send),
            micDisabled:
              vm.roomUnavailable ||
              vm.busy === "send-image" ||
              vm.busy === "send-file" ||
              vm.busy === "send-sticker" ||
              vm.busy === "delete-message" ||
              Boolean(draft.trim()) ||
              (vm.voiceRecording && vm.voiceHandsFree) ||
              (composerSurfaceMode === "phase1" && !getMessengerRoomComposerPhase2Bridge()),
            micTitle: draft.trim()
              ? t("cm_ui_clear_text_for_voice_recording")
              : t("cm_ui_hold_record_send_slide_cancel_lock"),
          }}
          t={t}
        />
    </>
  );

  return (
    <ChatComposer className="delivery-ui z-[5] w-full max-w-full shadow-none transition-[background-color] duration-200">
      {composerFooterInner}
    </ChatComposer>
  );
});
