"use client";

import { cmRoomEntryTraceEnabled } from "@/lib/community-messenger/room/cm-room-entry-instrumentation";
import { entryTimingT0 } from "@/lib/community-messenger/room/cm-room-entry-timing";
import { isMessengerRoomTimelinePaintableBootstrapSeed } from "@/lib/community-messenger/room/messenger-room-timeline-hydration";

export type CmRoomFmrSource = "seed" | "bootstrap" | "realtime" | "virtualizer" | "unknown";
export type CmRoomDisplayReadyBlocker =
  | "virtualizer"
  | "hydrationPass"
  | "emptyState"
  | "bootstrap"
  | "phase2BodyDefer"
  | "heavyLive"
  | "unknown";

type R5MountState = {
  hydration_pass_at_seed: number | null;
  timeline_seed_rows_count: number | null;
  phase2_body_mount_ms: number | null;
  timeline_component_mount_ms: number | null;
  timeline_first_row_dom_ms: number | null;
  virtualizer_ready_ms: number | null;
  heavy_live_mount_ms: number | null;
  fmr_source: CmRoomFmrSource | null;
  display_ready_blocker: CmRoomDisplayReadyBlocker | null;
  bootstrap_fingerprint_skip_count: number;
};

const stateByRoom = new Map<string, R5MountState>();

function t0Ms(): number | null {
  const t0 = entryTimingT0();
  if (t0 <= 0 || typeof performance === "undefined") return null;
  return Math.round(performance.now() - t0);
}

function roomState(roomId: string): R5MountState {
  const id = roomId.trim();
  let st = stateByRoom.get(id);
  if (!st) {
    st = {
      hydration_pass_at_seed: null,
      timeline_seed_rows_count: null,
      phase2_body_mount_ms: null,
      timeline_component_mount_ms: null,
      timeline_first_row_dom_ms: null,
      virtualizer_ready_ms: null,
      heavy_live_mount_ms: null,
      fmr_source: null,
      display_ready_blocker: null,
      bootstrap_fingerprint_skip_count: 0,
    };
    stateByRoom.set(id, st);
  }
  return st;
}

export function resetCmRoomR5TimelineMountInstrumentation(roomId: string): void {
  const id = roomId.trim();
  if (id) stateByRoom.delete(id);
}

export function noteCmRoomR5HydrationPassAtSeed(roomId: string, pass: number, seedRows: number): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const st = roomState(roomId);
  if (st.hydration_pass_at_seed == null) {
    st.hydration_pass_at_seed = pass;
    st.timeline_seed_rows_count = seedRows;
  }
}

export function noteCmRoomR5Phase2BodyMount(roomId: string): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const st = roomState(roomId);
  if (st.phase2_body_mount_ms != null) return;
  st.phase2_body_mount_ms = t0Ms();
  maybeEmit(roomId);
}

export function noteCmRoomR5TimelineComponentMount(roomId: string): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const st = roomState(roomId);
  if (st.timeline_component_mount_ms != null) return;
  st.timeline_component_mount_ms = t0Ms();
  maybeEmit(roomId);
}

export function noteCmRoomR5TimelineFirstRowDom(roomId: string): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const st = roomState(roomId);
  if (st.timeline_first_row_dom_ms != null) return;
  st.timeline_first_row_dom_ms = t0Ms();
  maybeEmit(roomId);
}

export function noteCmRoomR5VirtualizerReady(roomId: string): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const st = roomState(roomId);
  if (st.virtualizer_ready_ms != null) return;
  st.virtualizer_ready_ms = t0Ms();
  maybeEmit(roomId);
}

export function noteCmRoomR5HeavyLiveMount(roomId: string): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const st = roomState(roomId);
  if (st.heavy_live_mount_ms != null) return;
  st.heavy_live_mount_ms = t0Ms();
  maybeEmit(roomId);
}

export function noteCmRoomR5BootstrapFingerprintSkip(roomId: string): void {
  if (!cmRoomEntryTraceEnabled()) return;
  roomState(roomId).bootstrap_fingerprint_skip_count += 1;
}

export function noteCmRoomR5FmrRecorded(
  roomId: string,
  args: {
    source: CmRoomFmrSource;
    displayReadyBlocker: CmRoomDisplayReadyBlocker;
    virtualizerItemCount: number;
    displayCount: number;
    roomMessageCount: number;
    hydrationPass: number;
  }
): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const st = roomState(roomId);
  st.fmr_source = args.source;
  st.display_ready_blocker = args.displayReadyBlocker;
  maybeEmit(roomId);
}

function maybeEmit(roomId: string): void {
  if (typeof console === "undefined" || typeof console.log !== "function") return;
  const id = roomId.trim();
  if (!id) return;
  const st = roomState(id);
  // eslint-disable-next-line no-console -- Playwright-collectible R5 mount breakdown
  console.log(
    "[cm-room-r5-mount-breakdown]",
    JSON.stringify({
      room_id_suffix: id.length <= 8 ? id : id.slice(-8),
      hydration_pass_at_seed: st.hydration_pass_at_seed,
      timeline_seed_rows_count: st.timeline_seed_rows_count,
      phase2_body_mount_ms: st.phase2_body_mount_ms,
      timeline_component_mount_ms: st.timeline_component_mount_ms,
      timeline_first_row_dom_ms: st.timeline_first_row_dom_ms,
      virtualizer_ready_ms: st.virtualizer_ready_ms,
      heavy_live_mount_ms: st.heavy_live_mount_ms,
      fmr_source: st.fmr_source,
      display_ready_blocker: st.display_ready_blocker,
      bootstrap_fingerprint_skip_count: st.bootstrap_fingerprint_skip_count,
    })
  );
}

export function hasCmRoomTimelineSeedFromPhase1(phase1: {
  snapshot: { messages?: { length: number }; room: { lastMessage?: string | null } } | null;
  roomMessages?: { length: number };
}): boolean {
  if ((phase1.roomMessages?.length ?? 0) > 0) return true;
  const snapLen = phase1.snapshot?.messages?.length ?? 0;
  if (snapLen <= 0) return false;
  return isMessengerRoomTimelinePaintableBootstrapSeed(
    phase1.snapshot as Parameters<typeof isMessengerRoomTimelinePaintableBootstrapSeed>[0]
  );
}
