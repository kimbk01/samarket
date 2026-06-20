import type { CmScrollOwnerReason } from "@/lib/community-messenger/room/messenger-room-entry-scroll-owner";
import {
  isMessengerEntryBottomLoadReason,
  isMessengerEntryTailSettleReason,
} from "@/lib/community-messenger/room/messenger-room-entry-intent";

/** 진입 1차 scroll 완료 후 tail settle·virtual upgrade 전 단계 */
const ENTRY_INITIAL_SCROLL_REASONS = new Set<CmScrollOwnerReason>([
  "room_entry_initial",
  "initial_load",
  "push_entry_initial_load",
  "timeline_delivery_direct_paint",
  "schedule_after_rows_painted",
]);

export type MessengerRoomEntryScrollFinalizeInput = {
  reason: CmScrollOwnerReason;
  /** room_entry_restore — persisted stick-to-bottom */
  stickToBottom: boolean;
  composerHeightSynced: boolean;
};

export type MessengerRoomEntryScrollFinalizeDecision = {
  markInitialScrollDone: boolean;
  markEntrySettled: boolean;
  pendingTailSettle: boolean;
  completeTailSettle: boolean;
};

function isEntryBottomTargetReason(reason: CmScrollOwnerReason, stickToBottom: boolean): boolean {
  if (isMessengerEntryBottomLoadReason(reason)) return true;
  if (reason === "room_entry_initial") return true;
  if (reason === "timeline_delivery_direct_paint") return true;
  if (reason === "schedule_after_rows_painted") return true;
  if (reason === "room_entry_restore" && stickToBottom) return true;
  return false;
}

/**
 * Layout Settle Gate — entryScrollSettled 는 tail·composer 준비 후 1회만 true.
 * initial_load 직후 virtual upgrade·chrome keep-bottom 이 tail 을 덮어쓰지 않게 한다.
 */
export function resolveMessengerRoomEntryScrollFinalize(
  input: MessengerRoomEntryScrollFinalizeInput
): MessengerRoomEntryScrollFinalizeDecision {
  const { reason, stickToBottom, composerHeightSynced } = input;

  if (isMessengerEntryTailSettleReason(reason)) {
    return {
      markInitialScrollDone: false,
      markEntrySettled: true,
      pendingTailSettle: false,
      completeTailSettle: true,
    };
  }

  if (reason === "reentry_hydration_restored") {
    return {
      markInitialScrollDone: true,
      markEntrySettled: true,
      pendingTailSettle: false,
      completeTailSettle: true,
    };
  }

  if (reason === "room_entry_restore" && !stickToBottom) {
    return {
      markInitialScrollDone: true,
      markEntrySettled: true,
      pendingTailSettle: false,
      completeTailSettle: true,
    };
  }

  if (!ENTRY_INITIAL_SCROLL_REASONS.has(reason) && reason !== "room_entry_restore") {
    return {
      markInitialScrollDone: false,
      markEntrySettled: false,
      pendingTailSettle: false,
      completeTailSettle: false,
    };
  }

  if (!isEntryBottomTargetReason(reason, stickToBottom)) {
    return {
      markInitialScrollDone: false,
      markEntrySettled: false,
      pendingTailSettle: false,
      completeTailSettle: false,
    };
  }

  if (composerHeightSynced) {
    return {
      markInitialScrollDone: true,
      markEntrySettled: true,
      pendingTailSettle: false,
      completeTailSettle: true,
    };
  }

  return {
    markInitialScrollDone: true,
    markEntrySettled: false,
    pendingTailSettle: true,
    completeTailSettle: false,
  };
}
