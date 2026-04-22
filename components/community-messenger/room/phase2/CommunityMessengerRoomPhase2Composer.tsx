"use client";

import Link from "next/link";
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
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
  BackIcon,
  communityMessengerMemberAvatar,
  communityMessengerMessageSearchText,
  communityMessengerVoiceAudioSrc,
  extractHttpUrls,
  FileIcon,
  formatDuration,
  formatFileMeta,
  formatParticipantStatus,
  formatRoomCallStatus,
  formatTime,
  formatVoiceRecordTenThousandths,
  getLatestCallStubForSession,
  looksLikeDirectImageUrl,
  mergeRoomMessages,
  MicHoldIcon,
  MoreIcon,
  PlusIcon,
  SendPlaneIcon,
  SendVoiceArrowIcon,
  TrashVoiceIcon,
  VideoCallIcon,
  VoiceCallIcon,
  VoiceRecordingLiveWaveform,
  ViberChatBubble,
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
import { useMatchMaxWidthMd } from "@/lib/ui/use-match-max-width";
import { useCommunityMessengerRoomTypingPublisher } from "@/lib/community-messenger/realtime/typing/use-community-messenger-room-typing";
import {
  notifyChatInputCommitForPerf,
  notifyChatInputKeydownForPerf,
  recordRouteEntryElapsedMetric,
  recordRouteEntryElapsedMetricOnce,
  recordRouteEntryMetric,
} from "@/lib/runtime/samarket-runtime-debug";
import { useMessengerRoomClientPhase1Context } from "@/lib/community-messenger/room/messenger-room-client-phase1-context";
import {
  buildReplyPreviewSnapshot,
  formatReplyQuoteKakaoHeader,
} from "@/lib/community-messenger/message-actions/message-reply-policy";
import { MessengerInputBar } from "@/components/community-messenger/line-ui";

function isDomTextareaLikelyVisible(el: HTMLTextAreaElement): boolean {
  try {
    if (typeof el.checkVisibility === "function") {
      return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }
  } catch {
    /* ignore */
  }
  const st = window.getComputedStyle(el);
  if (st.visibility === "hidden" || st.display === "none") return false;
  return el.offsetWidth > 0 && el.offsetHeight > 0;
}

export function CommunityMessengerRoomPhase2Composer() {
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
  const composerEffectCountRef = useRef(0);
  const seededSilentHoldReleasedRef = useRef(false);

  /** 방 전환·답장 주입·전송 실패 복원 등 — Phase1 `message` 가 바뀌면 draft 에 반영(타이핑은 draft 만 갱신). */
  useLayoutEffect(() => {
    composerEffectCountRef.current += 1;
    recordRouteEntryMetric("messenger_room_entry", "composer_use_layout_effect_count", composerEffectCountRef.current);
    setDraft(vm.message);
  }, [roomKey, vm.message]);

  useLayoutEffect(() => {
    composerEffectCountRef.current += 1;
    recordRouteEntryMetric("messenger_room_entry", "composer_use_layout_effect_count", composerEffectCountRef.current);
    if (composerMountRecordedRef.current) return;
    composerMountRecordedRef.current = true;
    recordRouteEntryElapsedMetric("messenger_room_entry", "composer_mount_ms");
  }, []);

  useLayoutEffect(() => {
    seededSilentHoldReleasedRef.current = false;
  }, [roomKey]);

  useLayoutEffect(() => {
    if (seededSilentHoldReleasedRef.current) return;
    const tryRelease = () => {
      if (seededSilentHoldReleasedRef.current) return;
      if (vm.voiceRecording) {
        seededSilentHoldReleasedRef.current = true;
        notifyComposerTextareaVisibleForSeededBootstrap();
        return;
      }
      const ta = vm.composerTextareaRef.current;
      if (!ta || !isDomTextareaLikelyVisible(ta)) return;
      seededSilentHoldReleasedRef.current = true;
      recordRouteEntryElapsedMetricOnce("messenger_room_entry", "composer_textarea_visible_ms");
      notifyComposerTextareaVisibleForSeededBootstrap();
    };
    tryRelease();
    if (seededSilentHoldReleasedRef.current) return;
    const raf = requestAnimationFrame(() => tryRelease());
    return () => cancelAnimationFrame(raf);
  }, [
    roomKey,
    phase1Loading,
    phase1Snapshot,
    vm.voiceRecording,
    vm.busy,
    vm.roomUnavailable,
    notifyComposerTextareaVisibleForSeededBootstrap,
    vm.composerTextareaRef,
  ]);
  useCommunityMessengerRoomTypingPublisher({
    roomId: vm.snapshot.room.id,
    viewerUserId: vm.snapshot.viewerUserId,
    draft,
  });

  const globallyUsable = vm.snapshot ? communityMessengerRoomIsGloballyUsable(vm.snapshot.room) : false;
  const tradeOnlyBlocked =
    Boolean(vm.snapshot?.tradeMessaging) && vm.snapshot.tradeMessaging?.canSendMessage === false && globallyUsable;

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
    setDraft("");
    void vm.sendMessage(text);
  }, [draft, vm]);

  const { keyboardOverlapSuppressed, tradeKeyboardChromeOpen } = useMessengerRoomMobileViewport();
  const keyboardInsetPx = useMobileKeyboardInset({ disableOverlapEstimate: keyboardOverlapSuppressed });
  const isNarrowViewport = useMatchMaxWidthMd();
  const tradeContextMeta = vm.snapshot.room.contextMeta;
  const isTradeProductRoom =
    tradeContextMeta?.kind === "trade" &&
    typeof tradeContextMeta.productChatId === "string" &&
    tradeContextMeta.productChatId.trim().length > 0;
  const tradeComposerDense = Boolean(isNarrowViewport && isTradeProductRoom && tradeKeyboardChromeOpen);
  /**
   * - visualViewport 셸을 쓰면 겹침 추정을 끄고 safe-area + 기본 여백만.
   * - 그 외: 키보드 가림이 있으면 inset, 없으면 홈 인디케이터용 10px.
   */
  const footerExtraBottomPx = keyboardInsetPx > 0 ? keyboardInsetPx : 10;
  return (
    <>
      <footer
        {...(!vm.voiceRecording ? { "data-cm-line-composer-footer": true } : {})}
        className={`sticky bottom-0 z-[5] shrink-0 border-t border-[color:var(--cm-room-divider)] px-3 pt-2 transition-[background-color] duration-200 ${
          vm.voiceRecording
            ? "border-sky-200/90 bg-gradient-to-b from-sky-50/95 via-white to-white"
            : "bg-[color:var(--cm-room-header-bg)]"
        }`}
        style={{
          paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${footerExtraBottomPx}px)`,
        }}
      >
        {replyToMessage && !vm.voiceRecording ? (
          <div className="relative z-[1] mb-2 flex shrink-0 items-center gap-2 border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-primary-soft)] px-3 py-2">
            <button
              type="button"
              className="min-w-0 flex-1 border-l-2 border-[color:var(--cm-room-primary)] pl-2 text-left transition active:opacity-90"
              onClick={() => {
                void focusTimelineMessage(replyToMessage.id);
              }}
              aria-label="답장 대상 메시지로 이동"
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
              className="shrink-0 rounded-full px-2 py-1 sam-text-helper font-medium text-[color:var(--cm-room-text-muted)] active:bg-sam-surface/80"
            >
              취소
            </button>
          </div>
        ) : null}
        <MessengerInputBar
          className={
            tradeComposerDense
              ? "min-h-[44px] grid-cols-[2.5rem_minmax(0,1fr)_2.5rem_2.5rem] gap-1.5"
              : ""
          }
        >
          {tradeOnlyBlocked ? (
            <div
              className="mb-2 rounded-[var(--cm-room-radius-input)] border border-amber-200/80 bg-amber-50/90 px-3 py-2 sam-text-helper leading-snug text-amber-950"
              role="status"
            >
              <p className="font-semibold">
                {vm.snapshot.tradeMessaging?.denyMessage ?? "판매자가 대화를 종료했습니다. 새 메시지를 보낼 수 없습니다."}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {vm.snapshot.room.peerUserId ? (
                  <Link
                    href="/community-messenger?section=friends"
                    className="inline-flex min-h-9 items-center rounded-full bg-[color:var(--cm-room-primary)] px-3 py-1.5 sam-text-xxs font-semibold text-white"
                  >
                    친구 추가
                  </Link>
                ) : null}
                {vm.snapshot.room.contextMeta?.kind === "trade" &&
                typeof vm.snapshot.room.contextMeta.productChatId === "string" &&
                vm.snapshot.room.contextMeta.productChatId.trim() ? (
                  <Link
                    href={defaultTradeChatRoomHref(vm.snapshot.room.contextMeta.productChatId.trim(), "product_chat")}
                    className="inline-flex min-h-9 items-center rounded-full border border-[color:var(--cm-room-divider)] bg-white px-3 py-1.5 sam-text-xxs font-semibold text-[color:var(--cm-room-text)]"
                  >
                    상품 상세보기
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
          {!vm.voiceRecording ? (
            <button
              type="button"
              data-cm-line-plus-btn
              onClick={() => vm.setActiveSheet("attach")}
              className="flex h-10 w-10 shrink-0 items-center justify-center justify-self-center self-center rounded-full bg-[color:var(--cm-room-primary-soft)] text-[color:var(--cm-room-primary)] transition active:opacity-90"
              aria-label="첨부 메뉴"
            >
              <PlusIcon className="h-5 w-5" />
            </button>
          ) : (
            <div className="h-10 w-10 shrink-0 justify-self-center self-center" aria-hidden />
          )}
          <div className="flex min-h-0 min-w-0 items-center">
            {!vm.voiceRecording ? (
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
                  requestAnimationFrame(() => {
                    try {
                      ta.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
                    } catch {
                      ta.scrollIntoView({ block: "nearest" });
                    }
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
                      : "메시지"
                }
                className={`max-h-28 min-w-0 w-full resize-none rounded-[var(--cm-room-radius-input)] border-0 bg-[color:var(--cm-room-primary-soft)] px-3 outline-none ring-1 ring-transparent placeholder:text-[color:var(--cm-room-text-muted)] focus:ring-[color:var(--cm-room-primary)] disabled:opacity-50 ${
                  tradeComposerDense
                    ? "min-h-[38px] py-1.5 text-[15px] leading-snug text-[color:var(--cm-room-text)]"
                    : "min-h-[40px] py-2 sam-text-body leading-normal text-[color:var(--cm-room-text)]"
                }`}
              />
            ) : vm.voiceHandsFree ? (
              <div className="flex min-h-[44px] min-w-0 w-full items-center gap-2 rounded-ui-rect border-2 border-sam-border bg-sam-app px-3 py-2 shadow-inner ring-1 ring-sam-border">
                <span className="flex shrink-0 items-center gap-1.5 tabular-nums sam-text-body-secondary font-semibold leading-none text-sam-fg sm:sam-text-body">
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
                  {formatVoiceRecordTenThousandths(vm.voiceRecordElapsedMs)}
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <VoiceRecordingLiveWaveform peaks={vm.voiceLivePreviewBars} />
                  <span className="shrink-0 text-center sam-text-helper font-medium text-sam-fg">잠금 녹음 중</span>
                </div>
                <button
                  type="button"
                  onClick={() => void vm.finalizeVoiceRecording(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sam-surface text-sam-muted shadow-sm ring-1 ring-sam-border"
                  aria-label="녹음 삭제"
                >
                  <TrashVoiceIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => void vm.finalizeVoiceRecording(true)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sam-ink text-white shadow-md"
                  aria-label="음성 전송"
                >
                  <SendVoiceArrowIcon className="h-5 w-5 text-white" />
                </button>
              </div>
            ) : (
              <div className="flex min-h-[44px] min-w-0 w-full items-center gap-2 rounded-ui-rect border-2 border-sam-border bg-sam-app px-3 py-2 shadow-inner ring-1 ring-sam-border">
                <span className="flex shrink-0 items-center gap-1.5 tabular-nums sam-text-body-secondary font-semibold leading-none text-sam-fg sm:sam-text-body">
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
                  {formatVoiceRecordTenThousandths(vm.voiceRecordElapsedMs)}
                </span>
                <VoiceRecordingLiveWaveform peaks={vm.voiceLivePreviewBars} />
                <span
                  className={`min-w-0 shrink-0 text-center sam-text-body-secondary ${
                    vm.voiceCancelHint ? "font-semibold text-red-600" : "text-sam-muted"
                  }`}
                >
                  ‹ 밀어서 취소
                </span>
              </div>
            )}
          </div>

          {!vm.voiceHandsFree ? (
            <div className="relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center justify-self-center self-center overflow-visible">
              {vm.voiceRecording && !vm.voiceHandsFree ? (
                <div
                  className={`absolute bottom-full left-1/2 z-20 mb-1.5 flex -translate-x-1/2 flex-col items-center gap-0.5 rounded-ui-rect px-2.5 py-2 shadow-md ${
                    vm.voiceLockHint ? "bg-sam-ink text-white" : "bg-sam-ink/88 text-white/90 backdrop-blur-sm"
                  }`}
                >
                  <span className="text-base leading-none">⌃</span>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 1a5 5 0 0 1 5 5v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1V6a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v3h6V6a3 3 0 0 0-3-3z" />
                  </svg>
                </div>
              ) : null}
              {(vm.voiceRecording && !vm.voiceHandsFree) || vm.voiceMicArming ? (
                <span
                  className="pointer-events-none absolute inset-0 z-[1] overflow-visible"
                  aria-hidden
                >
                  <span className="sam-cm-voice-mic-ripple-wave" />
                  <span className="sam-cm-voice-mic-ripple-wave sam-cm-voice-mic-ripple-wave--delay" />
                </span>
              ) : null}
              <button
                type="button"
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
                  (vm.voiceRecording && vm.voiceHandsFree)
                }
                className={`sam-cm-voice-mic-ripple-btn relative z-[5] touch-none flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full shadow-md transition-[transform,box-shadow,background-color,ring-color] duration-200 active:scale-[0.96] disabled:opacity-35 ${
                  vm.voiceMicArming && !vm.voiceRecording
                    ? "bg-[color:var(--cm-room-primary-soft)] text-[color:var(--cm-room-primary)] ring-[3px] ring-[color:var(--cm-room-primary)]"
                    : vm.voiceRecording && !vm.voiceHandsFree
                      ? "bg-[color:var(--cm-room-primary)] text-white shadow-[0_10px_28px_rgba(107,61,241,0.38)] ring-[3px] ring-white/60"
                      : "bg-sam-border-soft text-sam-fg ring-2 ring-sam-border"
                }`}
                aria-label="음성 메시지 — 길게 눌러 녹음, 왼쪽으로 밀어 취소, 위로 밀어 잠금"
                title={
                  draft.trim()
                    ? "글자를 지우면 음성 녹음을 사용할 수 있습니다"
                    : "길게 눌러 녹음 · 손 떼면 전송 · 왼쪽 밀면 취소 · 위로 밀면 잠금"
                }
              >
                <MicHoldIcon className="h-6 w-6" />
              </button>
            </div>
          ) : (
            <div className="h-10 w-10 shrink-0 justify-self-center self-center" aria-hidden />
          )}

          {!vm.voiceRecording ? (
            <button
              type="button"
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
              className="flex h-10 w-10 shrink-0 items-center justify-center justify-self-center self-center rounded-full bg-[color:var(--cm-room-primary)] sam-text-body-secondary font-semibold text-white transition active:scale-[0.98] disabled:opacity-40"
              aria-label="전송"
            >
              <SendPlaneIcon className="h-5 w-5 text-white" />
            </button>
          ) : (
            <div className="pointer-events-none h-10 w-10 shrink-0 justify-self-center self-center" aria-hidden />
          )}
        </MessengerInputBar>
      </footer>
    </>
  );
}
