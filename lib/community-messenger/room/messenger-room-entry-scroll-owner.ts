/**
 * 채팅방 첫 진입 스크롤 단일 소유(SSOT).
 * room_entry_initial · rows-painted · virtualizer upgrade scroll_anchor 가 동시에 흔들리지 않게 한다.
 */

export type CmScrollOwnerReason =
  | "room_entry_initial"
  | "timeline_delivery_direct_paint"
  | "schedule_after_rows_painted"
  | "own_message_append"
  | "explicit"
  | "viewport_resize_restore"
  | "virtualizer_scroll_anchor"
  | string;

type RoomEntryScrollState = {
  hydrationPass: number;
  entryScrollSettled: boolean;
  layoutSettling: boolean;
  activeOwner: CmScrollOwnerReason | null;
  firstCommitRowsLocked: boolean;
};

const stateByRoom = new Map<string, RoomEntryScrollState>();

function getOrCreate(roomId: string): RoomEntryScrollState {
  const rid = roomId.trim();
  let st = stateByRoom.get(rid);
  if (!st) {
    st = {
      hydrationPass: 0,
      entryScrollSettled: false,
      layoutSettling: true,
      activeOwner: null,
      firstCommitRowsLocked: true,
    };
    stateByRoom.set(rid, st);
  }
  return st;
}

export function resetMessengerRoomEntryScrollOwner(roomId: string): void {
  const rid = roomId.trim();
  if (!rid) return;
  stateByRoom.delete(rid);
}

export function setMessengerRoomEntryHydrationPass(roomId: string, pass: number): void {
  const st = getOrCreate(roomId);
  st.hydrationPass = pass;
  logCmRoomEntryInstrumentation(roomId, "cm_room_entry_pass", { hydrationPass: pass });
}

export function getMessengerRoomEntryHydrationPass(roomId: string): number {
  return getOrCreate(roomId).hydrationPass;
}

export function isMessengerRoomEntryScrollSettled(roomId: string): boolean {
  return getOrCreate(roomId).entryScrollSettled;
}

export function isMessengerRoomLayoutSettling(roomId: string): boolean {
  return getOrCreate(roomId).layoutSettling;
}

export function setMessengerRoomFirstCommitRowsLocked(roomId: string, locked: boolean): void {
  const st = getOrCreate(roomId);
  if (st.firstCommitRowsLocked === locked) return;
  st.firstCommitRowsLocked = locked;
  logCmRoomEntryInstrumentation(
    roomId,
    locked ? "cm_first_commit_rows_lock" : "cm_first_commit_rows_unlock",
    { firstCommitRowsLocked: locked }
  );
}

/** non-store-order: virtual 전환은 pass3 + 진입 스크롤 settle 후 */
export function isMessengerRoomReadyForVirtualLayout(roomId: string): boolean {
  const st = getOrCreate(roomId);
  return st.hydrationPass >= 3 && st.entryScrollSettled;
}

const ENTRY_SCROLL_REASONS = new Set<CmScrollOwnerReason>([
  "room_entry_initial",
  "room_entry_restore",
  "timeline_delivery_direct_paint",
  "schedule_after_rows_painted",
]);

export function canRunMessengerRoomScrollOwner(
  roomId: string,
  reason: CmScrollOwnerReason
): boolean {
  const rid = roomId.trim();
  if (!rid) return true;
  const st = getOrCreate(rid);
  if (reason === "own_message_append" || reason === "explicit") return true;
  if (reason === "viewport_resize_restore") {
    if (!st.entryScrollSettled) {
      logCmRoomEntryInstrumentation(roomId, "cm_scroll_owner_skipped", {
        reason,
        hydrationPass: st.hydrationPass,
        entryScrollSettled: st.entryScrollSettled,
        layoutSettling: st.layoutSettling,
        activeOwner: st.activeOwner,
      });
      return false;
    }
    return true;
  }
  if (reason === "virtualizer_scroll_anchor") {
    if (!st.entryScrollSettled || st.layoutSettling) {
      logCmRoomEntryInstrumentation(roomId, "cm_scroll_owner_skipped", {
        reason,
        hydrationPass: st.hydrationPass,
        entryScrollSettled: st.entryScrollSettled,
        layoutSettling: st.layoutSettling,
        activeOwner: st.activeOwner,
      });
      return false;
    }
    return true;
  }
  if (!ENTRY_SCROLL_REASONS.has(reason)) return true;
  if (st.activeOwner != null && st.activeOwner !== reason) {
    logCmRoomEntryInstrumentation(roomId, "cm_scroll_owner_skipped", {
      reason,
      hydrationPass: st.hydrationPass,
      entryScrollSettled: st.entryScrollSettled,
      layoutSettling: st.layoutSettling,
      activeOwner: st.activeOwner,
    });
    return false;
  }
  return true;
}

export function markMessengerRoomScrollOwnerRun(
  roomId: string,
  reason: CmScrollOwnerReason,
  metrics?: {
    scrollTop?: number;
    scrollHeight?: number;
    clientHeight?: number;
    rowCount?: number;
    directLayout?: boolean;
    holdDirectDom?: boolean;
    measuredRange?: boolean;
  }
): void {
  const st = getOrCreate(roomId);
  if (ENTRY_SCROLL_REASONS.has(reason)) {
    st.activeOwner = reason;
  }
  logCmRoomEntryInstrumentation(roomId, "cm_scroll_owner_run", {
    reason,
    hydrationPass: st.hydrationPass,
    entryScrollSettled: st.entryScrollSettled,
    layoutSettling: st.layoutSettling,
    activeOwner: st.activeOwner,
    ...metrics,
  });
}

export function markMessengerRoomEntryScrollSettled(roomId: string, reason: CmScrollOwnerReason): void {
  const st = getOrCreate(roomId);
  st.entryScrollSettled = true;
  st.activeOwner = null;
  logCmRoomEntryInstrumentation(roomId, "cm_scroll_owner_settled", {
    reason,
    hydrationPass: st.hydrationPass,
    entryScrollSettled: true,
    layoutSettling: st.layoutSettling,
  });
}

export function markMessengerRoomLayoutSettling(roomId: string, settling: boolean): void {
  const st = getOrCreate(roomId);
  st.layoutSettling = settling;
}

export function logCmTimelineLayoutModeChanged(
  roomId: string,
  payload: {
    directLayout: boolean;
    hydrationPass: number;
    holdDirectDom: boolean;
    measuredRange: boolean;
    rowCount: number;
  }
): void {
  logCmRoomEntryInstrumentation(roomId, "cm_timeline_layout_mode_changed", payload);
}

export function logCmVirtualizerUpgradeBegin(
  roomId: string,
  payload: Record<string, unknown>
): void {
  logCmRoomEntryInstrumentation(roomId, "cm_virtualizer_upgrade_begin", payload);
}

export function logCmVirtualizerUpgradeCommit(
  roomId: string,
  payload: Record<string, unknown>
): void {
  logCmRoomEntryInstrumentation(roomId, "cm_virtualizer_upgrade_commit", payload);
}

function logCmRoomEntryInstrumentation(
  roomId: string,
  event: string,
  payload: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  const rid = roomId.trim();
  const body = {
    event,
    roomId: rid.length > 8 ? rid.slice(-8) : rid,
    ts: typeof performance !== "undefined" ? Math.round(performance.now()) : 0,
    ...payload,
  };
  try {
    console.debug("[cm-room-entry-scroll]", JSON.stringify(body));
  } catch {
    /* noop */
  }
}

/** 테스트·디버그용 */
export function __getMessengerRoomEntryScrollStateForTest(
  roomId: string
): RoomEntryScrollState | undefined {
  const rid = roomId.trim();
  return stateByRoom.get(rid);
}
