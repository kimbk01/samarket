"use client";

/**
 * R2-M9 — room entry 218ms 분해 (측정 전용, 최적화 없음).
 * 켜기: sessionStorage `samarket:debug:runtime=1`
 *
 * 이중 t0:
 * - list: 리스트 탭 (`getRoomTapT0` / `beginRouteEntryPerf`)
 * - route: room page 첫 mount (`beginR2M9RouteMountedT0`)
 */
import { entryTimingT0, msSinceRoomTap } from "@/lib/community-messenger/room/cm-room-entry-timing";
import {
  recordAppWidePhaseLastMs,
  samarketRuntimeDebugEnabled,
  samarketRuntimeDebugLog,
} from "@/lib/runtime/samarket-runtime-debug";
export type R2M9EntryStage =
  | "list_nav_begin"
  | "route_push"
  | "route_layout_mount"
  | "route_page_mount"
  | "suspense_release"
  | "page_client_probe"
  | "room_client_wrapper_render"
  | "composer_early_module_eval"
  | "composer_early_render"
  | "composer_early_layout_commit"
  | "inner_chunk_eval"
  | "inner_first_render"
  | "phase1_hook_start"
  | "phase1_provider_render"
  | "phase2_shell_render"
  | "composer_subtree_mount"
  | "composer_react_commit_end"
  | "textarea_dom_attach"
  | "textarea_visible"
  | "layout_after_textarea_raf2"
  | "first_interactive";

const ROUTE_ENTRY_SESSION_KEY = "samarket:debug:route-entry:messenger_room_entry";

let routeMountedT0 = 0;
const listStageOnce = new Set<R2M9EntryStage>();
const routeStageOnce = new Set<R2M9EntryStage>();
let profileEmitted = false;

function messengerRoomEntryStartedAt(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = sessionStorage.getItem(ROUTE_ENTRY_SESSION_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { startedAt?: number };
    return typeof parsed.startedAt === "number" && parsed.startedAt > 0 ? parsed.startedAt : 0;
  } catch {
    return 0;
  }
}

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function msSinceListTap(): number | null {
  const tap = entryTimingT0() || messengerRoomEntryStartedAt();
  if (tap <= 0) return null;
  return Math.round(perfNow() - tap);
}

function msSinceRouteMounted(): number | null {
  if (routeMountedT0 <= 0) return null;
  return Math.round(perfNow() - routeMountedT0);
}

function writeStage(base: R2M9EntryStage, listMs: number | null, routeMs: number | null): void {
  if (listMs != null) {
    recordAppWidePhaseLastMs(`r2m9_list_${base}_ms`, listMs);
    recordAppWidePhaseLastMs(`messenger_room_entry_r2m9_list_${base}_ms`, listMs);
  }
  if (routeMs != null) {
    recordAppWidePhaseLastMs(`r2m9_route_${base}_ms`, routeMs);
    recordAppWidePhaseLastMs(`messenger_room_entry_route_${base}_ms`, routeMs);
  }
}

/** room route page/layout 첫 mount — route 기준 t0 */
export function resetR2M9ProfileSession(): void {
  routeMountedT0 = 0;
  listStageOnce.clear();
  routeStageOnce.clear();
  profileEmitted = false;
}

export function beginR2M9RouteMountedT0(): void {
  if (!samarketRuntimeDebugEnabled()) return;
  if (routeMountedT0 > 0) return;
  routeMountedT0 = perfNow();
  recordAppWidePhaseLastMs("r2m9_route_t0_set_ms", 0);
  noteR2M9Stage("route_page_mount");
}

export function noteR2M9Stage(stage: R2M9EntryStage): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const listMs = msSinceListTap();
  const routeMs = msSinceRouteMounted();
  if (listMs != null && !listStageOnce.has(stage)) {
    listStageOnce.add(stage);
    writeStage(stage, listMs, null);
  }
  if (routeMs != null && !routeStageOnce.has(stage)) {
    routeStageOnce.add(stage);
    writeStage(stage, null, routeMs);
  }
}

export function noteR2M9Metric(suffix: string, value: number): void {
  if (!samarketRuntimeDebugEnabled()) return;
  if (!Number.isFinite(value) || value < 0) return;
  const v = Math.round(value);
  recordAppWidePhaseLastMs(`r2m9_${suffix}`, v);
}

/** layout effect 본문 동기 구간(ms) */
export function noteR2M9SyncWork(suffix: string, startedAt: number): void {
  noteR2M9Metric(`sync_${suffix}_ms`, perfNow() - startedAt);
}

export function noteR2M9DomTreeBeforeComposer(): void {
  if (!samarketRuntimeDebugEnabled() || typeof document === "undefined") return;
  const roomNodes = document.querySelectorAll("[data-cm-room], [data-cm-room-pass0], [data-cm-composer]").length;
  const allNodes = document.getElementsByTagName("*").length;
  noteR2M9Metric("dom_nodes_before_composer", allNodes);
  noteR2M9Metric("dom_cm_room_nodes_before_composer", roomNodes);
}

export function scheduleR2M9LayoutAfterTextarea(): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const t0 = perfNow();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      noteR2M9Stage("layout_after_textarea_raf2");
      noteR2M9Metric("layout_reflow_after_textarea_ms", perfNow() - t0);
    });
  });
}

export function getR2M9ProfileSnapshot(): Record<string, number> {
  const g = globalThis as { __samarketAppWidePhaseLastMs?: Record<string, number> };
  const m = g.__samarketAppWidePhaseLastMs ?? {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(m)) {
    if (
      k.startsWith("r2m9_") ||
      k.startsWith("messenger_room_entry_route_") ||
      k.startsWith("messenger_room_entry_r2m9_")
    ) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
  }
  return out;
}

export function emitR2M9ProfileSummary(reason: string): void {
  if (!samarketRuntimeDebugEnabled() || profileEmitted) return;
  profileEmitted = true;
  const snap = getR2M9ProfileSnapshot();
  const tapToMount = msSinceRoomTap();
  const payload = {
    reason,
    tap_to_mount_ms: tapToMount,
    route_mounted_t0_set: routeMountedT0 > 0,
    stages: snap,
  };
  samarketRuntimeDebugLog("r2-m9", "profile", payload);
  if (typeof console !== "undefined" && typeof console.log === "function") {
    console.log("[R2-M9-PROFILE]", JSON.stringify(payload));
  }
}

export function resetR2M9ProfileForTests(): void {
  resetR2M9ProfileSession();
}
