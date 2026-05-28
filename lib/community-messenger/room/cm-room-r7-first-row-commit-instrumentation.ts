"use client";

import { cmRoomEntryTraceEnabled } from "@/lib/community-messenger/room/cm-room-entry-instrumentation";
import { entryTimingT0 } from "@/lib/community-messenger/room/cm-room-entry-timing";
import { recordRouteEntryElapsedMetricOnce } from "@/lib/runtime/samarket-runtime-debug";

export type CmRoomRenderSource = "seed" | "bootstrap" | "realtime" | "virtualizer_upgrade" | "unknown";

/** 진입 direct paint — tail N rows only before pass3 / heavy upgrade */
export const CM_ROOM_ENTRY_SEED_PAINT_ROW_CAP = 12;

type R7RoomState = {
  room_open_ms: number | null;
  phase1_seed_available_ms: number | null;
  timeline_mount_begin_ms: number | null;
  timeline_rows_prepare_ms: number | null;
  first_row_commit_begin_ms: number | null;
  first_row_commit_end_ms: number | null;
  first_row_dom_visible_ms: number | null;
  direct_layout_used: boolean | null;
  seed_rows_rendered_count: number | null;
  render_source: CmRoomRenderSource | null;
};

const stateByRoom = new Map<string, R7RoomState>();
const firstRowCommitEndedRooms = new Set<string>();

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

function roomState(roomId: string): R7RoomState {
  const id = roomId.trim();
  let st = stateByRoom.get(id);
  if (!st) {
    st = {
      room_open_ms: null,
      phase1_seed_available_ms: null,
      timeline_mount_begin_ms: null,
      timeline_rows_prepare_ms: null,
      first_row_commit_begin_ms: null,
      first_row_commit_end_ms: null,
      first_row_dom_visible_ms: null,
      direct_layout_used: null,
      seed_rows_rendered_count: null,
      render_source: null,
    };
    stateByRoom.set(id, st);
  }
  return st;
}

function pushPerfEvent(roomId: string, event: string, payload: Record<string, unknown>): void {
  if (!cmRoomEntryTraceEnabled()) return;
  if (typeof window === "undefined") return;
  const row = { event, room_id_suffix: roomId.length <= 8 ? roomId : roomId.slice(-8), t_ms: t0Ms(), ...payload };
  const bag = window.__cmPerfEvents ?? [];
  bag.push(row);
  window.__cmPerfEvents = bag;
}

function emitR7Log(roomId: string): void {
  if (!cmRoomEntryTraceEnabled()) return;
  if (typeof console === "undefined" || typeof console.log !== "function") return;
  const id = roomId.trim();
  if (!id) return;
  const st = roomState(id);
  const body = {
    room_id_suffix: id.length <= 8 ? id : id.slice(-8),
    room_open_ms: st.room_open_ms,
    phase1_seed_available_ms: st.phase1_seed_available_ms,
    timeline_mount_begin_ms: st.timeline_mount_begin_ms,
    timeline_rows_prepare_ms: st.timeline_rows_prepare_ms,
    first_row_commit_begin_ms: st.first_row_commit_begin_ms,
    first_row_commit_end_ms: st.first_row_commit_end_ms,
    first_row_dom_visible_ms: st.first_row_dom_visible_ms,
    direct_layout_used: st.direct_layout_used,
    seed_rows_rendered_count: st.seed_rows_rendered_count,
    render_source: st.render_source,
  };
  pushPerfEvent(id, "cm_room_r7_first_row_commit_snapshot", body);
  // eslint-disable-next-line no-console -- Playwright-collectible R7 commit breakdown
  console.log("[cm-room-r7-first-row-commit]", JSON.stringify(body));
}

export function resetCmRoomR7FirstRowCommitInstrumentation(roomId: string): void {
  const id = roomId.trim();
  if (!id) return;
  stateByRoom.delete(id);
  firstRowCommitEndedRooms.delete(id);
}

export function noteCmRoomR7RoomOpen(roomId: string): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const st = roomState(roomId);
  if (st.room_open_ms != null) return;
  st.room_open_ms = t0Ms();
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "room_open_ms");
  emitR7Log(roomId);
}

export function noteCmRoomR7Phase1SeedAvailable(roomId: string, rowCount: number): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const st = roomState(roomId);
  if (st.phase1_seed_available_ms != null) return;
  st.phase1_seed_available_ms = t0Ms();
  st.seed_rows_rendered_count = rowCount;
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "phase1_seed_available_ms");
  emitR7Log(roomId);
}

export function noteCmRoomR7TimelineMountBegin(roomId: string): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const st = roomState(roomId);
  if (st.timeline_mount_begin_ms != null) return;
  st.timeline_mount_begin_ms = t0Ms();
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "timeline_mount_begin_ms");
  emitR7Log(roomId);
}

export function noteCmRoomR7TimelineRowsPrepare(
  roomId: string,
  args: {
    seedRowsRenderedCount: number;
    directLayoutUsed: boolean;
    renderSource: CmRoomRenderSource;
  }
): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const st = roomState(roomId);
  if (st.timeline_rows_prepare_ms != null) return;
  st.timeline_rows_prepare_ms = t0Ms();
  st.seed_rows_rendered_count = args.seedRowsRenderedCount;
  st.direct_layout_used = args.directLayoutUsed;
  st.render_source = args.renderSource;
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "timeline_rows_prepare_ms");
  emitR7Log(roomId);
}

export function noteCmRoomR7FirstRowCommitBegin(roomId: string): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const st = roomState(roomId);
  if (st.first_row_commit_begin_ms != null) return;
  st.first_row_commit_begin_ms = t0Ms();
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "first_row_commit_begin_ms");
  emitR7Log(roomId);
}

export function noteCmRoomR7FirstRowCommitEnd(roomId: string): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const id = roomId.trim();
  if (!id || firstRowCommitEndedRooms.has(id)) return;
  firstRowCommitEndedRooms.add(id);
  const st = roomState(id);
  st.first_row_commit_end_ms = t0Ms();
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "first_row_commit_end_ms");
  emitR7Log(id);
}

export function noteCmRoomR7FirstRowDomVisible(roomId: string): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const st = roomState(roomId);
  if (st.first_row_dom_visible_ms != null) return;
  st.first_row_dom_visible_ms = t0Ms();
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "first_row_dom_visible_ms");
  emitR7Log(roomId);
}

export function resolveCmRoomRenderSource(args: {
  displayMessageCount: number;
  roomMessageCount: number;
  virtualizerHasMeasuredRange: boolean;
}): CmRoomRenderSource {
  if (args.virtualizerHasMeasuredRange && args.displayMessageCount > 0) return "virtualizer_upgrade";
  if (args.displayMessageCount > 0) return "bootstrap";
  if (args.roomMessageCount > 0) return "seed";
  return "unknown";
}

export function sliceTimelineEntryPaintMessages<T>(messages: T[], hydrationPass: number): {
  paintMessages: T[];
  entrySliceActive: boolean;
  seedRowsRenderedCount: number;
} {
  if (messages.length === 0) {
    return { paintMessages: [], entrySliceActive: false, seedRowsRenderedCount: 0 };
  }
  const entrySliceActive =
    hydrationPass < 3 && messages.length > CM_ROOM_ENTRY_SEED_PAINT_ROW_CAP;
  if (!entrySliceActive) {
    return { paintMessages: messages, entrySliceActive: false, seedRowsRenderedCount: messages.length };
  }
  const paintMessages = messages.slice(-CM_ROOM_ENTRY_SEED_PAINT_ROW_CAP);
  return {
    paintMessages,
    entrySliceActive: true,
    seedRowsRenderedCount: paintMessages.length,
  };
}
