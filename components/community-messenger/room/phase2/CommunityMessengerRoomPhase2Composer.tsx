"use client";

import Link from "next/link";
import { ArrowUp, Mic, Plus, Trash2 } from "lucide-react";
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
} from "@/lib/ui/messenger-chat-viewport-tuning";
import { useMatchMaxWidthMd } from "@/lib/ui/use-match-max-width";
import { isLikelyIosWebKit } from "@/lib/ui/is-likely-ios-webkit";
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
    seededSilentHoldReleasedRef.current = false;
  }, [roomKey]);

  useLayoutEffect(() => {
    if (!composerMountRecordedRef.current) {
      composerMountRecordedRef.current = true;
      recordRouteEntryElapsedMetric("messenger_room_entry", "composer_mount_ms");
    }
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

  const { keyboardOverlapSuppressed, messengerKeyboardChromeOpen } = useMessengerRoomMobileViewport();
  const keyboardInsetPx = useMobileKeyboardInset({ disableOverlapEstimate: keyboardOverlapSuppressed });
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
  const footerExtraBottomPx =
    keyboardInsetPx > 0
      ? keyboardInsetPx +
        (isLikelyIosWebKit() && messengerComposerDense ? MESSENGER_COMPOSER_KEYBOARD_INSET_IOS_EXTRA_PX : 0)
      : iosMessengerSlack
        ? MESSENGER_COMPOSER_FOOTER_PADDING_IOS_SLACK_PX
        : MESSENGER_COMPOSER_FOOTER_PADDING_DEFAULT_PX;
  return (
    <>
      <footer
        data-cm-composer
        {...(!vm.voiceRecording ? { "data-cm-line-composer-footer": true } : {})}
        className={`sticky bottom-0 z-[5] shrink-0 border-t px-3 pt-2 transition-[background-color] duration-200 ${
          vm.voiceRecording
            ? "border-sky-200/90 bg-gradient-to-b from-sky-50/95 via-white to-white"
            : "border-[#e5e7eb] bg-white"
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
              className="shrink-0 rounded-ui-rect px-2 py-1 text-[12px] font-semibold text-[color:var(--cm-room-text-muted)] active:bg-sam-surface/80"
            >
              취소
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
        <MessengerInputBar>
          <div className="flex min-h-[54px] min-w-0 items-center justify-center justify-self-stretch self-stretch">
            {!vm.voiceRecording ? (
              <button
                type="button"
                data-cm-line-plus-btn
                onClick={() => vm.setActiveSheet("attach")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-transparent text-[#1f2937] transition hover:bg-black/[0.06] active:bg-black/[0.08]"
                aria-label="첨부 메뉴"
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
                    (vm.voiceRecording && vm.voiceHandsFree)
                  }
                  className={`sam-cm-voice-mic-ripple-btn absolute right-1.5 top-1/2 z-[5] flex h-8 w-8 -translate-y-1/2 touch-none select-none items-center justify-center rounded-full shadow-none transition-[transform,background-color,color] duration-200 active:scale-[0.96] disabled:text-[#9ca3af] disabled:opacity-45 ${
                    vm.voiceMicArming
                      ? "bg-[color:var(--cm-room-primary-soft)] text-[color:var(--cm-room-primary)] ring-2 ring-[color:var(--cm-room-primary)]/45"
                      : "bg-transparent text-[#1f2937] hover:bg-black/[0.06] active:bg-black/[0.08]"
                  }`}
                  aria-label="음성 메시지 — 길게 눌러 녹음, 왼쪽으로 밀어 취소, 위로 밀어 잠금"
                  title={
                    draft.trim()
                      ? "글자를 지우면 음성 녹음을 사용할 수 있습니다"
                      : "길게 눌러 녹음 · 손 떼면 전송 · 왼쪽 밀면 취소 · 위로 밀면 잠금"
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
                  <span className="shrink-0 text-center sam-text-xxs font-medium leading-tight text-sam-fg">잠금 녹음 중</span>
                </div>
                <button
                  type="button"
                  onClick={() => void vm.finalizeVoiceRecording(false)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sam-border bg-sam-surface text-sam-muted shadow-none"
                  aria-label="녹음 삭제"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => void vm.finalizeVoiceRecording(true)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sam-primary text-sam-on-primary shadow-none"
                  aria-label="음성 전송"
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--cm-room-primary)] text-white shadow-none transition active:scale-[0.98] disabled:bg-[color:var(--cm-room-primary-disabled)] disabled:text-white"
                aria-label="전송"
              >
                <ArrowUp className="h-5 w-5" strokeWidth={2.25} />
              </button>
            ) : (
              <div className="pointer-events-none h-9 w-9 shrink-0" aria-hidden />
            )}
          </div>
        </MessengerInputBar>
      </footer>
    </>
  );
}
