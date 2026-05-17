"use client";

/**
 * R2-M11C — layout vs room segment vs RSC flight 분해(계측 전용).
 * 켜기: sessionStorage `samarket:debug:runtime=1`
 */
import {
  judgeR2M11CVerdictCategory,
  type R2M11CLayoutServerPayload,
  type R2M11CRoomSegmentServerPayload,
  type R2M11CVerdictCategory,
} from "@/lib/community-messenger/room/cm-room-r2-m11c-layout-server-timers";
import { readR2M11BPhasesSnapshot } from "@/lib/community-messenger/room/cm-room-r2-m11b-breakdown";
import { samarketRuntimeDebugEnabled, samarketRuntimeDebugLog } from "@/lib/runtime/samarket-runtime-debug";

const K_LAYOUT = "samarket:cm:r2m11c:layout:";
const K_ROOM_SEG = "samarket:cm:r2m11c:room_seg:";
const K_BREAKDOWN = "samarket:cm:r2m11c:breakdown_done:";

function readLayoutPayload(roomId: string): R2M11CLayoutServerPayload | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(K_LAYOUT + roomId.trim());
    if (!raw) return null;
    return JSON.parse(raw) as R2M11CLayoutServerPayload;
  } catch {
    return null;
  }
}

function readRoomSegmentPayload(roomId: string): R2M11CRoomSegmentServerPayload | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(K_ROOM_SEG + roomId.trim());
    if (!raw) return null;
    return JSON.parse(raw) as R2M11CRoomSegmentServerPayload;
  } catch {
    return null;
  }
}

export function noteR2M11CLayoutServerPayload(roomId: string, payload: R2M11CLayoutServerPayload): void {
  if (!samarketRuntimeDebugEnabled() || typeof sessionStorage === "undefined") return;
  const id = roomId.trim();
  if (!id) return;
  try {
    sessionStorage.setItem(K_LAYOUT + id, JSON.stringify(payload));
    sessionStorage.removeItem(K_BREAKDOWN + id);
  } catch {
    /* ignore */
  }
  tryEmitR2M11CBreakdown(id);
}

/** @deprecated — use noteR2M11CRoomSegmentServerTiming */
export function noteR2M11CRoomSegmentServerMs(roomId: string, wallMs: number): void {
  noteR2M11CRoomSegmentServerTiming(roomId, {
    room_segment_server_start_ms: 0,
    room_segment_server_done_ms: wallMs,
    room_segment_server_wall_ms: wallMs,
  });
}

export function noteR2M11CRoomSegmentServerTiming(
  roomId: string,
  payload: R2M11CRoomSegmentServerPayload
): void {
  if (!samarketRuntimeDebugEnabled() || typeof sessionStorage === "undefined") return;
  const id = roomId.trim();
  if (!id) return;
  try {
    sessionStorage.setItem(K_ROOM_SEG + id, JSON.stringify(payload));
    sessionStorage.removeItem(K_BREAKDOWN + id);
  } catch {
    /* ignore */
  }
  tryEmitR2M11CBreakdown(id);
}

function tryEmitR2M11CBreakdown(roomId: string): void {
  if (!samarketRuntimeDebugEnabled() || typeof sessionStorage === "undefined") return;
  const id = roomId.trim();
  const doneKey = K_BREAKDOWN + id;
  try {
    if (sessionStorage.getItem(doneKey) === "1") return;
  } catch {
    return;
  }

  const layout = readLayoutPayload(id);
  const roomSeg = readRoomSegmentPayload(id);
  const m11b = readR2M11BPhasesSnapshot(id);

  if (!layout || !roomSeg) return;
  const flightStart = m11b.flight_response_start ?? null;
  const flightDone = m11b.flight_response_done ?? null;
  const rscFlightMs =
    flightStart != null && flightDone != null ? Math.max(0, Math.round(flightDone - flightStart)) : null;
  if (rscFlightMs == null || m11b.suspense_release == null) return;

  const routeT0 = m11b.route_change_start ?? null;
  const suspense = m11b.suspense_release ?? null;
  const routeChangeToSuspense =
    routeT0 != null && suspense != null ? Math.max(0, Math.round(suspense - routeT0)) : null;

  const remainingFlightGap = Math.max(
    0,
    rscFlightMs - layout.parallel_bottleneck_ms - roomSeg.room_segment_server_wall_ms
  );

  const verdictCategory: R2M11CVerdictCategory = judgeR2M11CVerdictCategory({
    main_layout_total_ms: layout.main_layout_total_ms,
    bottom_nav_load_ms: layout.bottom_nav_load_ms,
    menu_load_ms: layout.menu_load_ms,
    auth_profile_await_ms: layout.auth_profile_await_ms,
    auth_profile_invoked: layout.auth_profile_invoked,
    remaining_flight_gap_ms: remainingFlightGap,
    rsc_flight_ms: rscFlightMs,
  });

  const payload = {
    roomId: id,
    marks: {
      layout_entry_ms: layout.layout_entry_ms,
      headers_cookies_ms: layout.headers_cookies_ms,
      headers_cookies_invoked: layout.headers_cookies_invoked,
      auth_profile_await_ms: layout.auth_profile_await_ms,
      auth_profile_invoked: layout.auth_profile_invoked,
      bottom_nav_load_ms: layout.bottom_nav_load_ms,
      menu_load_ms: layout.menu_load_ms,
      children_render_before_ms: layout.children_render_before_ms,
      room_segment_server_start_ms: roomSeg.room_segment_server_start_ms,
      room_segment_server_done_ms: roomSeg.room_segment_server_done_ms,
      rsc_flight_done_ms: rscFlightMs,
    },
    main_layout_total_ms: layout.main_layout_total_ms,
    bottom_nav_load_ms: layout.bottom_nav_load_ms,
    menu_category_load_ms: layout.menu_load_ms,
    auth_layout_ms: layout.auth_profile_await_ms,
    room_segment_server_ms: roomSeg.room_segment_server_wall_ms,
    remaining_flight_gap_ms: remainingFlightGap,
    rsc_flight_ms: rscFlightMs,
    route_change_to_suspense_release_ms: routeChangeToSuspense,
    layout_timing: layout,
    room_segment_timing: roomSeg,
    verdict_category: verdictCategory,
    verdict_label_ko:
      verdictCategory === "layout_server_work"
        ? "layout 서버 작업"
        : verdictCategory === "bottom_nav_menu"
          ? "bottom nav/menu"
          : verdictCategory === "auth_profile"
            ? "auth/profile"
            : "Next RSC flight 자체",
  };

  try {
    sessionStorage.setItem(doneKey, "1");
  } catch {
    /* ignore */
  }
  samarketRuntimeDebugLog("r2-m11c", "layout_flight_breakdown", payload);
  if (typeof console !== "undefined" && typeof console.log === "function") {
    console.log(`[R2-M11C-BREAKDOWN] ${JSON.stringify(payload)}`);
  }
}

export function resetR2M11CBreakdownForTests(): void {
  if (typeof sessionStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(K_LAYOUT) || k?.startsWith(K_ROOM_SEG) || k?.startsWith(K_BREAKDOWN)) {
      keys.push(k);
    }
  }
  for (const k of keys) {
    try {
      sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

export function tryEmitR2M11CAfterM11BPhase(roomId: string): void {
  tryEmitR2M11CBreakdown(roomId.trim());
}
