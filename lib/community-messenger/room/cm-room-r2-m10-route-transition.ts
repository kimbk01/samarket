"use client";

/**
 * R2-M10 — 리스트 탭 → room route page mount 구간만 분해·계측.
 * 켜기: sessionStorage `samarket:debug:runtime=1`
 */
import { getRoomTapT0 } from "@/lib/community-messenger/room/cm-room-entry-timing";
import { isRoomSnapshotFresh } from "@/lib/community-messenger/room-snapshot-cache";
import {
  recordAppWidePhaseLastMs,
  samarketRuntimeDebugEnabled,
  samarketRuntimeDebugLog,
} from "@/lib/runtime/samarket-runtime-debug";
import { noteR2M11DRoomPushStart } from "@/lib/community-messenger/room/cm-room-r2-m11d-prefetch-flight";

export type R2M10RoutePhase =
  | "list_tap_t0"
  | "click_handler_start"
  | "click_handler_done"
  | "router_push_start"
  | "router_push_done"
  | "route_change_start"
  | "route_page_mount"
  | "room_page_chunk_loaded";

const K_ROOM_ID = "samarket:cm:r2m10:room_id";
const K_PHASES = "samarket:cm:r2m10:phases:";
const K_CTX = "samarket:cm:r2m10:ctx:";
const K_BREAKDOWN = "samarket:cm:r2m10:breakdown_done:";

export type MessengerRoomNavPrefetchTapState = {
  prefetch_hit: boolean;
  snapshot_fresh: boolean;
  route_prefetch_armed: boolean;
};

let routePrefetchArmedHref = "";
let routePrefetchArmedAt = 0;
let roomPageChunkLoadedAt = 0;

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function phasesKey(roomId: string): string {
  return K_PHASES + roomId.trim();
}

function ctxKey(roomId: string): string {
  return K_CTX + roomId.trim();
}

function readPhases(roomId: string): Partial<Record<R2M10RoutePhase, number>> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(phasesKey(roomId));
    if (!raw) return {};
    return JSON.parse(raw) as Partial<Record<R2M10RoutePhase, number>>;
  } catch {
    return {};
  }
}

function writePhase(roomId: string, phase: R2M10RoutePhase, at: number): void {
  if (typeof sessionStorage === "undefined") return;
  const id = roomId.trim();
  if (!id) return;
  const phases = readPhases(id);
  if (phases[phase] != null) return;
  phases[phase] = at;
  try {
    sessionStorage.setItem(phasesKey(id), JSON.stringify(phases));
    sessionStorage.setItem(K_ROOM_ID, id);
  } catch {
    /* ignore */
  }
  const tap = getRoomTapT0();
  if (tap > 0) {
    const ms = Math.round(at - tap);
    recordAppWidePhaseLastMs(`r2m10_${phase}_ms`, ms);
    recordAppWidePhaseLastMs(`messenger_room_entry_r2m10_${phase}_ms`, ms);
  }
}

function readCtx(roomId: string): MessengerRoomNavPrefetchTapState {
  if (typeof sessionStorage === "undefined") {
    return { prefetch_hit: false, snapshot_fresh: false, route_prefetch_armed: false };
  }
  try {
    const raw = sessionStorage.getItem(ctxKey(roomId.trim()));
    if (!raw) {
      return { prefetch_hit: false, snapshot_fresh: false, route_prefetch_armed: false };
    }
    return JSON.parse(raw) as MessengerRoomNavPrefetchTapState;
  } catch {
    return { prefetch_hit: false, snapshot_fresh: false, route_prefetch_armed: false };
  }
}

function writeCtx(roomId: string, ctx: MessengerRoomNavPrefetchTapState): void {
  if (typeof sessionStorage === "undefined") return;
  const id = roomId.trim();
  if (!id) return;
  try {
    sessionStorage.setItem(ctxKey(id), JSON.stringify(ctx));
  } catch {
    /* ignore */
  }
  recordAppWidePhaseLastMs("r2m10_prefetch_hit", ctx.prefetch_hit ? 1 : 0);
  recordAppWidePhaseLastMs("messenger_room_entry_r2m10_prefetch_hit", ctx.prefetch_hit ? 1 : 0);
}

/** pointerdown 등에서 Next route prefetch 를 쐈음을 기록 */
export function noteMessengerRoomRoutePrefetchArmed(href: string): void {
  const h = href.trim();
  if (!h) return;
  routePrefetchArmedHref = h;
  routePrefetchArmedAt = perfNow();
}

/** 탭 직전 스냅샷·route prefetch 상태 */
export function messengerRoomNavPrefetchTapState(
  roomId: string,
  viewerUserId?: string | null,
  href?: string
): MessengerRoomNavPrefetchTapState {
  const id = roomId.trim();
  const snapshotFresh = isRoomSnapshotFresh(id, viewerUserId?.trim() || null);
  const hrefNorm = href?.trim() ?? "";
  const routeArmed =
    hrefNorm.length > 0 &&
    routePrefetchArmedHref === hrefNorm &&
    perfNow() - routePrefetchArmedAt < 30_000;
  const prefetchHit = snapshotFresh || routeArmed;
  return {
    prefetch_hit: prefetchHit,
    snapshot_fresh: snapshotFresh,
    route_prefetch_armed: routeArmed,
  };
}

export function beginR2M10ListTap(roomId: string, viewerUserId?: string | null, href?: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const id = roomId.trim();
  if (!id) return;
  const at = getRoomTapT0() > 0 ? getRoomTapT0() : perfNow();
  writeCtx(id, messengerRoomNavPrefetchTapState(id, viewerUserId, href));
  writePhase(id, "list_tap_t0", at);
}

export function noteR2M10ClickHandlerStart(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  writePhase(roomId, "click_handler_start", perfNow());
}

export function noteR2M10ClickHandlerDone(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  writePhase(roomId, "click_handler_done", perfNow());
}

export function noteR2M10RouterPushStart(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  writePhase(roomId, "router_push_start", perfNow());
  noteR2M11DRoomPushStart(roomId);
}

export function noteR2M10RouterPushDone(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  writePhase(roomId, "router_push_done", perfNow());
}

export function noteR2M10RouteChangeStart(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  writePhase(roomId, "route_change_start", perfNow());
}

export function noteR2M10RoutePageMount(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const id = roomId.trim();
  if (!id) return;
  const at = perfNow();
  writePhase(id, "route_page_mount", at);
  const tap = getRoomTapT0();
  if (tap > 0) {
    const gap = Math.round(at - tap);
    recordAppWidePhaseLastMs("r2m10_route_mount_gap_ms", gap);
    recordAppWidePhaseLastMs("messenger_room_entry_r2m10_route_mount_gap_ms", gap);
  }
  tryEmitR2M10Breakdown(id);
}

export function noteR2M10RoomPageChunkLoaded(): void {
  if (!samarketRuntimeDebugEnabled()) return;
  if (roomPageChunkLoadedAt > 0) return;
  roomPageChunkLoadedAt = perfNow();
  if (typeof sessionStorage === "undefined") return;
  let roomId = "";
  try {
    roomId = sessionStorage.getItem(K_ROOM_ID)?.trim() ?? "";
  } catch {
    return;
  }
  if (!roomId) return;
  writePhase(roomId, "room_page_chunk_loaded", roomPageChunkLoadedAt);
}

function delta(phases: Partial<Record<R2M10RoutePhase, number>>, a: R2M10RoutePhase, b: R2M10RoutePhase): number | null {
  const t0 = phases.list_tap_t0;
  const va = phases[a];
  const vb = phases[b];
  if (t0 == null || va == null || vb == null) return null;
  return Math.max(0, Math.round(vb - va));
}

function sinceTap(phases: Partial<Record<R2M10RoutePhase, number>>, phase: R2M10RoutePhase): number | null {
  const t0 = phases.list_tap_t0;
  const p = phases[phase];
  if (t0 == null || p == null) return null;
  return Math.max(0, Math.round(p - t0));
}

function tryEmitR2M10Breakdown(roomId: string): void {
  if (typeof sessionStorage === "undefined") return;
  const id = roomId.trim();
  const doneKey = K_BREAKDOWN + id;
  try {
    if (sessionStorage.getItem(doneKey) === "1") return;
  } catch {
    return;
  }
  const phases = readPhases(id);
  if (phases.route_page_mount == null) return;
  const ctx = readCtx(id);
  const payload = {
    roomId: id,
    route_mount_gap_ms: sinceTap(phases, "route_page_mount"),
    list_tap_t0_ms: 0,
    click_handler_ms: delta(phases, "click_handler_start", "click_handler_done"),
    tap_to_push_ms: delta(phases, "list_tap_t0", "router_push_start"),
    push_to_route_change_ms: delta(phases, "router_push_done", "route_change_start"),
    route_change_to_page_mount_ms: delta(phases, "route_change_start", "route_page_mount"),
    tap_to_page_mount_ms: sinceTap(phases, "route_page_mount"),
    prefetch_hit: ctx.prefetch_hit,
    snapshot_fresh: ctx.snapshot_fresh,
    route_prefetch_armed: ctx.route_prefetch_armed,
    room_page_chunk_loaded_ms: sinceTap(phases, "room_page_chunk_loaded"),
    phases,
  };
  try {
    sessionStorage.setItem(doneKey, "1");
  } catch {
    /* ignore */
  }
  samarketRuntimeDebugLog("r2-m10", "route_transition_breakdown", payload);
  if (typeof console !== "undefined" && typeof console.log === "function") {
    console.log("[R2-M10-ROUTE]", JSON.stringify(payload));
  }
}

export function resetR2M10RouteTransitionForTests(): void {
  routePrefetchArmedHref = "";
  routePrefetchArmedAt = 0;
  roomPageChunkLoadedAt = 0;
  if (typeof sessionStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const k = sessionStorage.key(i);
    if (
      k === K_ROOM_ID ||
      k?.startsWith(K_PHASES) ||
      k?.startsWith(K_CTX) ||
      k?.startsWith(K_BREAKDOWN)
    ) {
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
