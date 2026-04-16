"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useLayoutEffect,
  useState,
} from "react";
import { communityMessengerRoomIsGloballyUsable } from "@/lib/community-messenger/types";
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
  CommunityMessengerMessageActionSheet,
  CommunityMessengerTradeProcessSection,
  GroupRoomCallOverlay,
  MessengerTradeChatRoomDetailPrefetch,
  SeedTradeChatDetailMemoryFromSnapshot,
  VoiceMessageBubble,
} from "@/components/community-messenger/room/community-messenger-room-phase2-lazy";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { useMessengerRoomMobileViewport } from "@/components/community-messenger/room/phase2/messenger-room-mobile-viewport-context";
import { useMobileKeyboardInset } from "@/lib/ui/use-mobile-keyboard-inset";
import { Sticker } from "lucide-react";

export function CommunityMessengerRoomPhase2Composer() {
  const vm = useMessengerRoomPhase2View();
  const roomKey = vm.snapshot.room.id;
  const [draft, setDraft] = useState("");
  useLayoutEffect(() => {
    setDraft(vm.message);
  }, [roomKey, vm.message]);
  const { keyboardOverlapSuppressed } = useMessengerRoomMobileViewport();
  const keyboardInsetPx = useMobileKeyboardInset({ disableOverlapEstimate: keyboardOverlapSuppressed });
  /**
   * - visualViewport 셸을 쓰면 겹침 추정을 끄고 safe-area + 기본 여백만.
   * - 그 외: 키보드 가림이 있으면 inset, 없으면 홈 인디케이터용 10px.
   */
  const footerExtraBottomPx = keyboardInsetPx > 0 ? keyboardInsetPx : 10;
  return (
    <>
      <footer
        className={`sticky bottom-0 z-[5] shrink-0 border-t border-[color:var(--cm-room-divider)] px-3 pt-2.5 transition-[background-color,box-shadow] duration-300 ${
          vm.voiceRecording
            ? "border-sky-200/90 bg-gradient-to-b from-sky-50/95 via-white to-white shadow-[0_-6px_18px_rgba(42,171,238,0.08)]"
            : "bg-[color:var(--cm-room-header-bg)] shadow-[0_-8px_28px_rgba(17,24,39,0.07)]"
        }`}
        style={{
          paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${footerExtraBottomPx}px)`,
        }}
      >
        {/**
         * 열 너비 고정: 5열을 항상 `2.75rem`으로 두어 전송·녹음·잠금 녹음 전환 시에도
         * 마이크(4열)의 화면상 위치가 동일하게 유지된다. (`auto`+다른 min-w는 마이크가 좌우로 밀림)
         */}
        <div className="grid min-h-[48px] min-w-0 grid-cols-[2.75rem_2.75rem_minmax(0,1fr)_2.75rem_2.75rem] items-center gap-2">
          {!vm.voiceRecording ? (
            <button
              type="button"
              onClick={() => vm.setActiveSheet("attach")}
              className="flex h-10 w-10 shrink-0 items-center justify-center justify-self-center self-center rounded-full bg-[color:var(--cm-room-primary-soft)] text-[color:var(--cm-room-primary)] transition active:opacity-90"
              aria-label="첨부 메뉴"
            >
              <PlusIcon className="h-5 w-5" />
            </button>
          ) : (
            <div className="h-10 w-10 shrink-0 justify-self-center self-center" aria-hidden />
          )}
          {!vm.voiceRecording ? (
            <button
              type="button"
              onClick={() => vm.setActiveSheet("stickers")}
              disabled={
                vm.roomUnavailable ||
                vm.busy === "send-sticker" ||
                vm.busy === "send" ||
                vm.busy === "send-image" ||
                vm.busy === "send-file" ||
                vm.busy === "send-voice" ||
                vm.busy === "delete-message"
              }
              className="flex h-10 w-10 shrink-0 items-center justify-center justify-self-center self-center rounded-full bg-[color:var(--cm-room-primary-soft)] text-[color:var(--cm-room-primary)] transition active:opacity-90 disabled:opacity-35"
              aria-label="스티커"
            >
              <Sticker className="h-5 w-5" strokeWidth={2} />
            </button>
          ) : (
            <div className="h-10 w-10 shrink-0 justify-self-center self-center" aria-hidden />
          )}
          <div className="flex min-h-0 min-w-0 items-center">
            {!vm.voiceRecording ? (
              <textarea
                ref={vm.composerTextareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== "NumpadEnter") return;
                  if (e.shiftKey) return;
                  if (e.nativeEvent.isComposing) return;
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
                  e.preventDefault();
                  void vm.sendMessage(draft);
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
                  vm.roomUnavailable
                    ? vm.snapshot.room.isReadonly
                      ? "읽기 전용 방입니다"
                      : vm.snapshot.room.roomStatus === "blocked"
                        ? "차단된 방입니다"
                        : "보관된 방입니다"
                    : "메시지"
                }
                className="max-h-28 min-h-[44px] min-w-0 w-full resize-none rounded-[var(--cm-room-radius-input)] border-0 bg-[color:var(--cm-room-primary-soft)] px-3.5 py-3 text-[14px] leading-normal text-[color:var(--cm-room-text)] outline-none ring-1 ring-transparent placeholder:text-[color:var(--cm-room-text-muted)] focus:ring-[color:var(--cm-room-primary)] disabled:opacity-50"
              />
            ) : vm.voiceHandsFree ? (
              <div className="flex min-h-[44px] min-w-0 w-full items-center gap-2 rounded-ui-rect border-2 border-sam-border bg-sam-app px-3 py-2 shadow-inner ring-1 ring-sam-border">
                <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-[13px] font-semibold leading-none text-sam-fg sm:text-[14px]">
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
                  {formatVoiceRecordTenThousandths(vm.voiceRecordElapsedMs)}
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <VoiceRecordingLiveWaveform peaks={vm.voiceLivePreviewBars} />
                  <span className="shrink-0 text-center text-[12px] font-medium text-sam-fg">잠금 녹음 중</span>
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
                <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-[13px] font-semibold leading-none text-sam-fg sm:text-[14px]">
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
                  {formatVoiceRecordTenThousandths(vm.voiceRecordElapsedMs)}
                </span>
                <VoiceRecordingLiveWaveform peaks={vm.voiceLivePreviewBars} />
                <span
                  className={`min-w-0 shrink-0 text-center text-[13px] ${
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
              onClick={() => void vm.sendMessage(draft)}
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
              className="flex h-10 w-10 shrink-0 items-center justify-center justify-self-center self-center rounded-full bg-[color:var(--cm-room-primary)] text-[13px] font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-40"
              aria-label="전송"
            >
              <SendPlaneIcon className="h-5 w-5 text-white" />
            </button>
          ) : (
            <div className="pointer-events-none h-10 w-10 shrink-0 justify-self-center self-center" aria-hidden />
          )}
        </div>
      </footer>
    </>
  );
}
