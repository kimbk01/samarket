"use client";

import { cmRoomEntryTraceEnabled } from "@/lib/community-messenger/room/cm-room-entry-instrumentation";
import { noteCmRoomR7FirstRowDomVisible } from "@/lib/community-messenger/room/cm-room-r7-first-row-commit-instrumentation";
import { noteCmRoomR5VirtualizerReady } from "@/lib/community-messenger/room/cm-room-r5-timeline-mount-instrumentation";
import { recordCmRoomEntryMilestone } from "@/lib/community-messenger/room/cm-room-entry-instrumentation";
import { entryTimingT0 } from "@/lib/community-messenger/room/cm-room-entry-timing";
import {
  recordRouteEntryElapsedMetricOnce,
  recordRouteEntryFirstContentRender,
  scheduleRouteEntryToPaint,
} from "@/lib/runtime/samarket-runtime-debug";

export type CmRoomFmrGateReason =
  | "direct_layout_dom_row"
  | "dom_intersection"
  | "fallback_visible_rows"
  | "legacy_heavy_layout_effect"
  | "unknown";

export type CmRoomDisplayReadyGateReason =
  | "timeline_heavy_bundle"
  | "virtualizer_ready"
  | "pending_heavy"
  | "legacy_display_list"
  | "unknown";

type R6RoomState = {
  dom_first_message_visible_ms: number | null;
  fmr_recorded_ms: number | null;
  display_ready_ms: number | null;
  heavy_host_mount_ms: number | null;
  virtualizer_ready_ms: number | null;
  seed_rows_count: number | null;
  fmr_gate_reason: CmRoomFmrGateReason | null;
  display_ready_gate_reason: CmRoomDisplayReadyGateReason | null;
  was_dom_visible_before_display_ready: boolean | null;
};

const stateByRoom = new Map<string, R6RoomState>();
const domRecordedRooms = new Set<string>();
const displayReadyRecordedRooms = new Set<string>();
const pendingHeavyReadyReasonByRoom = new Map<string, CmRoomDisplayReadyGateReason>();

declare global {
  interface Window {
    __cmPerfEvents?: Array<Record<string, unknown>>;
  }
}

function t0Ms(): number | null {
  const t0 = entryTimingT0();
  if (t0 <= 0 || typeof performance === "undefined") return null;
  return Math.round(performance.now() - t0);
}

function roomState(roomId: string): R6RoomState {
  const id = roomId.trim();
  let st = stateByRoom.get(id);
  if (!st) {
    st = {
      dom_first_message_visible_ms: null,
      fmr_recorded_ms: null,
      display_ready_ms: null,
      heavy_host_mount_ms: null,
      virtualizer_ready_ms: null,
      seed_rows_count: null,
      fmr_gate_reason: null,
      display_ready_gate_reason: null,
      was_dom_visible_before_display_ready: null,
    };
    stateByRoom.set(id, st);
  }
  return st;
}

function pushPerfEvent(roomId: string, event: string, payload: Record<string, unknown>): void {
  if (!cmRoomEntryTraceEnabled()) return;
  if (typeof window === "undefined") return;
  const row = {
    event,
    room_id_suffix: roomId.length <= 8 ? roomId : roomId.slice(-8),
    t_ms: t0Ms(),
    ...payload,
  };
  const bag = window.__cmPerfEvents ?? [];
  bag.push(row);
  window.__cmPerfEvents = bag;
}

function emitR6Log(roomId: string): void {
  if (!cmRoomEntryTraceEnabled()) return;
  if (typeof console === "undefined" || typeof console.log !== "function") return;
  const id = roomId.trim();
  if (!id) return;
  const st = roomState(id);
  const body = {
    room_id_suffix: id.length <= 8 ? id : id.slice(-8),
    dom_first_message_visible_ms: st.dom_first_message_visible_ms,
    fmr_recorded_ms: st.fmr_recorded_ms,
    display_ready_ms: st.display_ready_ms,
    heavy_host_mount_ms: st.heavy_host_mount_ms,
    virtualizer_ready_ms: st.virtualizer_ready_ms,
    seed_rows_count: st.seed_rows_count,
    fmr_gate_reason: st.fmr_gate_reason,
    display_ready_gate_reason: st.display_ready_gate_reason,
    was_dom_visible_before_display_ready: st.was_dom_visible_before_display_ready,
  };
  pushPerfEvent(id, "cm_room_r6_display_gate_snapshot", body);
  // eslint-disable-next-line no-console -- Playwright-collectible R6 gate breakdown
  console.log("[cm-room-r6-display-gate]", JSON.stringify(body));
}

export function resetCmRoomR6DisplayReadyInstrumentation(roomId: string): void {
  const id = roomId.trim();
  if (!id) return;
  stateByRoom.delete(id);
  domRecordedRooms.delete(id);
  displayReadyRecordedRooms.delete(id);
  pendingHeavyReadyReasonByRoom.delete(id);
}

/** 첫 메시지 DOM row 가 viewport 에 보일 때 — FMR·first paint 는 여기서만 기록 */
export function recordCmRoomDomFirstMessageVisible(args: {
  roomId: string;
  seedRowsCount: number;
  fmrGateReason: CmRoomFmrGateReason;
  directLayout: boolean;
}): boolean {
  if (!cmRoomEntryTraceEnabled()) return false;
  const id = args.roomId.trim();
  if (!id || domRecordedRooms.has(id)) return false;
  domRecordedRooms.add(id);

  const ms = t0Ms();
  const st = roomState(id);
  st.dom_first_message_visible_ms = ms;
  st.fmr_recorded_ms = ms;
  st.seed_rows_count = args.seedRowsCount;
  st.fmr_gate_reason = args.fmrGateReason;
  if (st.display_ready_ms == null) {
    st.was_dom_visible_before_display_ready = true;
    st.display_ready_gate_reason = "pending_heavy";
  } else {
    st.was_dom_visible_before_display_ready = false;
  }

  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "dom_first_message_visible_ms");
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "first_message_visible_ms");
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "message_list_first_paint_ms");
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "first_message_render_ms");
  recordRouteEntryFirstContentRender("messenger_room_entry");
  recordCmRoomEntryMilestone("message_list_visible_ms");
  scheduleRouteEntryToPaint("messenger_room_entry");
  noteCmRoomR7FirstRowDomVisible(id);

  emitR6Log(id);
  const pendingReason = pendingHeavyReadyReasonByRoom.get(id);
  if (pendingReason) {
    pendingHeavyReadyReasonByRoom.delete(id);
    recordCmRoomTimelineHeavyReady(id, pendingReason);
  }
  return true;
}

/** heavy bundle 은 먼저 붙되, display_ready 메트릭은 DOM first paint 이후에만 기록 */
export function scheduleCmRoomTimelineHeavyReadyAfterDom(
  roomId: string,
  reason: CmRoomDisplayReadyGateReason
): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const id = roomId.trim();
  if (!id) return;
  if (domRecordedRooms.has(id)) {
    recordCmRoomTimelineHeavyReady(id, reason);
    return;
  }
  pendingHeavyReadyReasonByRoom.set(id, reason);
  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      if (!pendingHeavyReadyReasonByRoom.has(id)) return;
      pendingHeavyReadyReasonByRoom.delete(id);
      recordCmRoomTimelineHeavyReady(id, reason);
    }, 4_000);
  }
}

export function noteCmRoomR6HeavyHostMount(roomId: string): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const st = roomState(roomId);
  if (st.heavy_host_mount_ms != null) return;
  st.heavy_host_mount_ms = t0Ms();
  pushPerfEvent(roomId, "heavy_host_mount", { heavy_host_mount_ms: st.heavy_host_mount_ms });
  emitR6Log(roomId);
}

export function noteCmRoomR6VirtualizerReady(roomId: string): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const st = roomState(roomId);
  if (st.virtualizer_ready_ms != null) return;
  st.virtualizer_ready_ms = t0Ms();
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "virtualizer_ready_ms");
  pushPerfEvent(roomId, "virtualizer_ready", { virtualizer_ready_ms: st.virtualizer_ready_ms });
  noteCmRoomR5VirtualizerReady(roomId);
  emitR6Log(roomId);
}

/** legacy `display_room_messages_ready` — heavy bundle·virtualizer fully attached */
export function recordCmRoomTimelineHeavyReady(roomId: string, reason: CmRoomDisplayReadyGateReason): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const id = roomId.trim();
  if (!id || displayReadyRecordedRooms.has(id)) return;
  displayReadyRecordedRooms.add(id);

  const st = roomState(id);
  const ms = t0Ms();
  st.display_ready_ms = ms;
  st.display_ready_gate_reason = reason;
  if (st.dom_first_message_visible_ms != null) {
    st.was_dom_visible_before_display_ready = true;
  } else {
    st.was_dom_visible_before_display_ready = false;
  }

  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "timeline_heavy_ready_ms");
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "display_room_messages_ready_ms");

  pushPerfEvent(id, "timeline_heavy_ready", {
    display_ready_ms: ms,
    display_ready_gate_reason: reason,
  });
  emitR6Log(id);
}

export function getCmRoomR6DisplayGateSnapshot(roomId: string): R6RoomState | null {
  const id = roomId.trim();
  if (!id) return null;
  return stateByRoom.get(id) ?? null;
}

export function isCmRoomDomFirstMessageRecorded(roomId: string): boolean {
  return domRecordedRooms.has(roomId.trim());
}
