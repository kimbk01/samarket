"use client";

import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getMessengerRoomActionErrorMessage } from "@/lib/community-messenger/room/messenger-room-action-error-messages";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { MessengerComposerSector } from "@/components/community-messenger/line-ui";
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

const noopPointer = () => undefined;

/** Phase2 chunk·controller 없이 textarea·send만 선커밋 (R2-M8). */
export const CommunityMessengerRoomPass1ComposerShell = memo(function CommunityMessengerRoomPass1ComposerShell({
  composerEntryVisible,
}: {
  composerEntryVisible: boolean;
}) {
  const { t } = useI18n();
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
    if (!text || vm.roomUnavailable) return;
    setDraft("");
    void vm.sendMessage(text);
  }, [draft, vm]);

  if (!vm) return null;

  const globallyUsable = communityMessengerRoomIsGloballyUsable(vm.snapshot.room);
  const tradeOnlyBlocked =
    Boolean(vm.snapshot.tradeMessaging) && vm.snapshot.tradeMessaging?.canSendMessage === false && globallyUsable;
  const tradeBlockedMessage = useMemo(() => {
    const tm = vm.snapshot.tradeMessaging;
    if (!tm || tm.canSendMessage !== false) return "";
    return (
      getMessengerRoomActionErrorMessage(tm.denyCode ?? undefined, t) ||
      tm.denyMessage ||
      t("nav_messenger_trade_seller_closed")
    );
  }, [vm.snapshot.tradeMessaging, t]);
  const roomUnavailable = vm.roomUnavailable;
  const voiceBridgeReady = Boolean(getMessengerRoomComposerPhase2Bridge());
  const placeholder = vm.snapshot.clientShellPlaceholder
    ? t("nav_messenger_input_placeholder")
    : roomUnavailable
      ? t("cm_ui_read_only_room")
      : t("cm_ui_message");

  return (
    <ChatComposer
      data-cm-pass1-composer-shell
      className="delivery-ui z-[5]"
    >
      <MessengerComposerSector
        draft={draft}
        placeholder={tradeOnlyBlocked ? tradeBlockedMessage || t("cm_ui_cannot_send_message") : placeholder}
        textareaRef={textareaRef}
        onTextareaRef={(node) => {
          vm.composerTextareaRef.current = node;
          if (node) noteR2M9Stage("textarea_dom_attach");
        }}
        onDraftChange={setDraft}
        onAttach={() => vm.setActiveSheet("attach")}
        onSend={commitTextSend}
        onTextareaKeyDown={(e) => {
          if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
          e.preventDefault();
          commitTextSend();
        }}
        onTextareaFocus={() => useMessengerRoomUiStore.getState().setComposerFocused(true)}
        onTextareaBlur={() => useMessengerRoomUiStore.getState().setComposerFocused(false)}
        textareaDisabled={
          roomUnavailable ||
          vm.busy === "delete-message" ||
          vm.busy === "send-image" ||
          vm.busy === "send-file" ||
          vm.busy === "send-sticker"
        }
        sendDisabled={roomUnavailable || !draft.trim()}
        sendAriaLabel={t("common_send")}
        attachAriaLabel={t("cm_ui_attachment_menu")}
        attachDisabled={roomUnavailable}
        voice={{
          recording: false,
          micArming: false,
          handsFree: false,
          elapsedMs: 0,
          peaks: [],
          cancelHint: false,
          onMicPointerDown: noopPointer,
          onMicPointerMove: noopPointer,
          onMicPointerUp: noopPointer,
          onMicPointerCancel: noopPointer,
          onFinalizeRecording: () => undefined,
          micDisabled: roomUnavailable || !voiceBridgeReady,
          micTitle: t("cm_ui_hold_record_send_slide_cancel_lock"),
        }}
        t={t}
      />
    </ChatComposer>
  );
});
