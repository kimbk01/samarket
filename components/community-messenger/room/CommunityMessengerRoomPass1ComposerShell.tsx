"use client";

import { ArrowUp, Mic, Plus } from "lucide-react";
import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import { MessengerInputBar } from "@/components/community-messenger/line-ui";
import { communityMessengerRoomIsGloballyUsable } from "@/lib/community-messenger/types";
import { useMessengerRoomComposerSurface } from "@/lib/community-messenger/room/use-messenger-room-composer-surface";
import { getMessengerRoomComposerPhase2Bridge } from "@/lib/community-messenger/room/messenger-room-composer-phase2-bridge";
import { useMessengerRoomComposerEarlyContext } from "@/lib/community-messenger/room/messenger-room-composer-early-context";
import { useMessengerRoomClientPhase1ContextOptional } from "@/lib/community-messenger/room/messenger-room-client-phase1-context";
import { noteCmRoomPass1ComposerMs } from "@/lib/community-messenger/room/cm-room-pass-instrumentation";
import {
  noteCmRoomSubtreeAttach,
  shouldBlockCmRoomStrictEffectReRun,
  shouldSkipCmRoomSubtreeSurfaceAttach,
} from "@/lib/community-messenger/room/cm-room-subtree-stability";
import {
  recordRouteEntryElapsedMetric,
  recordRouteEntryElapsedMetricOnce,
  recordRouteEntryFirstInteractive,
  recordRouteEntryMetric,
} from "@/lib/runtime/samarket-runtime-debug";
import { useMessengerRoomUiStore } from "@/lib/community-messenger/stores/messenger-room-ui-store";
import { MESSENGER_COMPOSER_FOOTER_PADDING_DEFAULT_PX } from "@/lib/ui/messenger-chat-viewport-tuning";
import {
  emitR2M9ProfileSummary,
  noteR2M9DomTreeBeforeComposer,
  noteR2M9Stage,
  noteR2M9SyncWork,
  scheduleR2M9LayoutAfterTextarea,
} from "@/lib/community-messenger/room/cm-room-r2-m9-entry-profile";

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
  noteR2M9Stage("textarea_visible");
  noteR2M9Stage("first_interactive");
  scheduleR2M9LayoutAfterTextarea();
  emitR2M9ProfileSummary("textarea_visible");
}

/** Phase2 chunk·controller 없이 textarea·send만 선커밋 (R2-M8). */
export const CommunityMessengerRoomPass1ComposerShell = memo(function CommunityMessengerRoomPass1ComposerShell({
  composerEntryVisible,
}: {
  composerEntryVisible: boolean;
}) {
  const earlyVm = useMessengerRoomComposerEarlyContext();
  const phase1Vm = useMessengerRoomComposerSurface();
  const vm = earlyVm ?? phase1Vm;
  const phase1Ctx = useMessengerRoomClientPhase1ContextOptional();
  const notifyComposerTextareaVisibleForSeededBootstrap =
    phase1Ctx?.notifyComposerTextareaVisibleForSeededBootstrap ?? (() => undefined);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mountRecordedRef = useRef(false);
  const inputReadyRecordedRef = useRef(false);
  const roomKey = vm?.snapshot.room.id ?? "";

  useLayoutEffect(() => {
    setDraft(vm?.message ?? "");
  }, [roomKey, vm?.message]);

  useLayoutEffect(() => {
    const rid = String(roomKey).trim();
    if (!rid || !composerEntryVisible || mountRecordedRef.current) return;
    if (shouldBlockCmRoomStrictEffectReRun(rid, "pass1_composer_mount")) return;
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    noteR2M9DomTreeBeforeComposer();
    mountRecordedRef.current = true;
    noteR2M9Stage("composer_subtree_mount");
    recordRouteEntryElapsedMetricOnce("messenger_room_entry", "composer_mount_start_ms");
    if (!shouldSkipCmRoomSubtreeSurfaceAttach(rid, "composer")) {
      noteCmRoomSubtreeAttach(rid, "composer");
    }
    recordRouteEntryElapsedMetric("messenger_room_entry", "composer_mount_ms");
    recordRouteEntryElapsedMetricOnce("messenger_room_entry", "composer_mount_done_ms");
    noteCmRoomPass1ComposerMs();
    if (t0 > 0) {
      noteR2M9SyncWork("composer_subtree_layout", t0);
      noteR2M9Stage("composer_react_commit_end");
    }
  }, [composerEntryVisible, roomKey]);

  useLayoutEffect(() => {
    if (!composerEntryVisible || inputReadyRecordedRef.current) return;
    const tryRecord = () => {
      if (inputReadyRecordedRef.current) return;
      const ta = textareaRef.current;
      if (!ta || !isDomTextareaLikelyVisible(ta)) return;
      inputReadyRecordedRef.current = true;
      recordCmComposerInputReadyMilestones(ta, notifyComposerTextareaVisibleForSeededBootstrap);
    };
    tryRecord();
    if (inputReadyRecordedRef.current) return;
    let frames = 0;
    let cancelled = false;
    const loop = () => {
      if (cancelled || inputReadyRecordedRef.current) return;
      tryRecord();
      if (inputReadyRecordedRef.current || frames >= 48) return;
      frames += 1;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => {
      cancelled = true;
    };
  }, [composerEntryVisible, notifyComposerTextareaVisibleForSeededBootstrap, roomKey]);

  const commitTextSend = useCallback(() => {
    if (!vm) return;
    const text = draft.trim();
    if (!text || vm.roomUnavailable || vm.busy === "send") return;
    setDraft("");
    void vm.sendMessage(text);
  }, [draft, vm]);

  if (!vm) return null;

  const globallyUsable = communityMessengerRoomIsGloballyUsable(vm.snapshot.room);
  const tradeOnlyBlocked =
    Boolean(vm.snapshot.tradeMessaging) && vm.snapshot.tradeMessaging?.canSendMessage === false && globallyUsable;
  const roomUnavailable = vm.roomUnavailable;
  const voiceBridgeReady = Boolean(getMessengerRoomComposerPhase2Bridge());
  const placeholder = vm.snapshot.clientShellPlaceholder
    ? "메시지를 입력하세요"
    : roomUnavailable
      ? "읽기 전용 방입니다"
      : "메시지";

  return (
    <footer
      data-cm-composer
      data-cm-line-composer-footer
      data-cm-pass1-composer-shell
      className="sticky bottom-0 z-[5] shrink-0 border-t border-[#e5e7eb] bg-white px-3 pt-2"
      style={{
        paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${MESSENGER_COMPOSER_FOOTER_PADDING_DEFAULT_PX}px)`,
      }}
    >
      <MessengerInputBar>
        <div className="flex min-h-[54px] min-w-0 items-center justify-center">
          <button
            type="button"
            data-cm-line-plus-btn
            onClick={() => vm.setActiveSheet("attach")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-transparent text-[#1f2937] active:bg-black/[0.08]"
            aria-label="첨부 메뉴"
          >
            <Plus className="h-[21px] w-[21px]" strokeWidth={2} />
          </button>
        </div>
        <div className="flex min-h-[54px] min-w-0 flex-1 items-center py-1">
          <textarea
            ref={(node) => {
              textareaRef.current = node;
              vm.composerTextareaRef.current = node;
              if (node) noteR2M9Stage("textarea_dom_attach");
            }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => useMessengerRoomUiStore.getState().setComposerFocused(true)}
            onBlur={() => useMessengerRoomUiStore.getState().setComposerFocused(false)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
              e.preventDefault();
              commitTextSend();
            }}
            rows={1}
            disabled={
              roomUnavailable ||
              vm.busy === "delete-message" ||
              vm.busy === "send-image" ||
              vm.busy === "send-file" ||
              vm.busy === "send-sticker"
            }
            placeholder={tradeOnlyBlocked ? vm.snapshot.tradeMessaging?.denyMessage ?? "메시지를 보낼 수 없습니다" : placeholder}
            className="h-[38px] min-h-[38px] w-full min-w-0 resize-none border-0 bg-transparent text-[14px] leading-[1.35] outline-none placeholder:text-[#65676b] disabled:opacity-50"
          />
        </div>
        <div className="flex min-h-[54px] min-w-0 items-center justify-center">
          {!draft.trim() ? (
            <button
              type="button"
              data-cm-line-mic-btn
              disabled={roomUnavailable || !voiceBridgeReady}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-transparent text-[#1f2937] disabled:opacity-45"
              aria-label="음성 메시지"
            >
              <Mic className="h-5 w-5" strokeWidth={2} />
            </button>
          ) : (
            <button
              type="button"
              data-cm-line-send-btn
              onClick={() => commitTextSend()}
              disabled={roomUnavailable || !draft.trim() || vm.busy === "send"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--cm-room-primary)] text-white disabled:opacity-50"
              aria-label="전송"
            >
              <ArrowUp className="h-5 w-5" strokeWidth={2.25} />
            </button>
          )}
        </div>
      </MessengerInputBar>
    </footer>
  );
});
