"use client";

/**
 * R2-M11B — route_change → suspense_release 구간 분해(계측 전용).
 * 켜기: sessionStorage `samarket:debug:runtime=1`
 */
import { readTradeChatEntryMark } from "@/lib/chats/trade-chat-entry-client";
import { noteTradeChatEntryJourneyMilestone } from "@/lib/trade/trade-chat-entry-journey-perf";
import { samarketRuntimeDebugEnabled, samarketRuntimeDebugLog } from "@/lib/runtime/samarket-runtime-debug";

export type R2M11BPhase =
  | "route_change_start"
  | "room_page_server_start"
  | "room_page_server_done"
  | "flight_response_start"
  | "flight_response_done"
  | "suspense_release"
  | "first_client_boundary_mount"
  | "phase1_boundary_mount"
  | "provider_commit_start"
  | "provider_commit_done"
  | "phase1_seed_ready"
  | "client_commit_done"
  | "phase1_visible";

const K_ROOM_ID = "samarket:cm:r2m11b:room_id";
const K_PHASES = "samarket:cm:r2m11b:phases:";
const K_BREAKDOWN = "samarket:cm:r2m11b:breakdown_done:";
const K_SERVER_WALL = "samarket:cm:r2m11b:server_wall_ms";

let pendingRoomPageServerWallMs: number | null = null;

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function phasesKey(roomId: string): string {
  return K_PHASES + roomId.trim();
}

function readPhases(roomId: string): Partial<Record<R2M11BPhase, number>> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(phasesKey(roomId));
    if (!raw) return {};
    return JSON.parse(raw) as Partial<Record<R2M11BPhase, number>>;
  } catch {
    return {};
  }
}

function writePhase(roomId: string, phase: R2M11BPhase, at: number): void {
  if (!samarketRuntimeDebugEnabled() || typeof sessionStorage === "undefined") return;
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
  tryEmitR2M11BBreakdown(id);
}

function delta(
  phases: Partial<Record<R2M11BPhase, number>>,
  a: R2M11BPhase,
  b: R2M11BPhase
): number | null {
  const va = phases[a];
  const vb = phases[b];
  if (va == null || vb == null) return null;
  return Math.max(0, Math.round(vb - va));
}

function readServerWallMs(roomId: string): number | null {
  if (typeof sessionStorage === "undefined") return pendingRoomPageServerWallMs;
  try {
    const raw = sessionStorage.getItem(`${K_SERVER_WALL}:${roomId.trim()}`);
    if (raw) {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
  } catch {
    /* ignore */
  }
  return pendingRoomPageServerWallMs;
}

function applyServerWallFromFlightStart(roomId: string, flightStartAt: number): void {
  const wall = readServerWallMs(roomId);
  if (wall == null || wall < 0) return;
  const phases = readPhases(roomId);
  if (phases.room_page_server_start == null) {
    writePhase(roomId, "room_page_server_start", flightStartAt);
  }
  if (phases.room_page_server_done == null) {
    writePhase(roomId, "room_page_server_done", flightStartAt + wall);
  }
}

function tryEmitR2M11BBreakdown(roomId: string): void {
  if (!samarketRuntimeDebugEnabled() || typeof sessionStorage === "undefined") return;
  const id = roomId.trim();
  const doneKey = K_BREAKDOWN + id;
  try {
    if (sessionStorage.getItem(doneKey) === "1") return;
  } catch {
    return;
  }
  const phases = readPhases(id);
  if (phases.route_change_start == null || phases.suspense_release == null) return;
  if (phases.flight_response_done == null) return;
  if (phases.phase1_visible == null) return;

  const payload = {
    roomId: id,
    phases,
    route_change_to_server_start_ms: delta(phases, "route_change_start", "room_page_server_start"),
    server_start_to_server_done_ms: delta(phases, "room_page_server_start", "room_page_server_done"),
    server_done_to_flight_done_ms: delta(phases, "room_page_server_done", "flight_response_done"),
    flight_done_to_suspense_release_ms: delta(phases, "flight_response_done", "suspense_release"),
    suspense_release_to_first_client_boundary_ms: delta(
      phases,
      "suspense_release",
      "first_client_boundary_mount"
    ),
    first_client_boundary_to_phase1_visible_ms: delta(
      phases,
      "first_client_boundary_mount",
      "phase1_visible"
    ),
    provider_commit_ms: delta(phases, "provider_commit_start", "provider_commit_done"),
    route_change_to_suspense_release_ms: delta(phases, "route_change_start", "suspense_release"),
    room_page_server_wall_ms: readServerWallMs(id),
    flight_response_ms: delta(phases, "flight_response_start", "flight_response_done"),
  };

  try {
    sessionStorage.setItem(doneKey, "1");
  } catch {
    /* ignore */
  }
  samarketRuntimeDebugLog("r2-m11b", "route_release_breakdown", payload);
  if (typeof console !== "undefined" && typeof console.log === "function") {
    console.log(`[R2-M11B-BREAKDOWN] ${JSON.stringify(payload)}`);
  }
}

export function resetR2M11BBreakdownForTests(): void {
  pendingRoomPageServerWallMs = null;
  if (typeof sessionStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const k = sessionStorage.key(i);
    if (k === K_ROOM_ID || k?.startsWith(K_PHASES) || k?.startsWith(K_BREAKDOWN) || k?.startsWith(K_SERVER_WALL)) {
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

export function noteR2M11BRoomPageServerWallMs(roomId: string, wallMs: number): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const id = roomId.trim();
  if (!id || wallMs < 0) return;
  pendingRoomPageServerWallMs = wallMs;
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`${K_SERVER_WALL}:${id}`, String(Math.round(wallMs)));
  } catch {
    /* ignore */
  }
  const phases = readPhases(id);
  if (phases.flight_response_start != null) {
    applyServerWallFromFlightStart(id, phases.flight_response_start);
  }
}

export function readR2M11BRouteChangeStartAt(roomId: string): number | null {
  return readPhases(roomId.trim()).route_change_start ?? null;
}

/** R2-M11C — M11B phase 스냅샷(계측 병합용). */
export function readR2M11BPhasesSnapshot(
  roomId: string
): Partial<Record<R2M11BPhase, number>> {
  return readPhases(roomId.trim());
}

export function noteR2M11BRouteChangeStart(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  pendingRoomPageServerWallMs = null;
  const id = roomId.trim();
  if (!id) return;
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem(K_BREAKDOWN + id);
      sessionStorage.removeItem(phasesKey(id));
      sessionStorage.removeItem(`${K_SERVER_WALL}:${id}`);
    } catch {
      /* ignore */
    }
  }
  writePhase(id, "route_change_start", perfNow());
}

export function noteR2M11BFlightResponseStart(roomId: string, at?: number): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const id = roomId.trim();
  if (!id) return;
  const t = at ?? perfNow();
  writePhase(id, "flight_response_start", t);
  applyServerWallFromFlightStart(id, t);
}

export function noteR2M11BFlightResponseDone(roomId: string, at?: number): void {
  if (readTradeChatEntryMark()) {
    noteTradeChatEntryJourneyMilestone("room_rsc_flight_done");
  }
  if (!samarketRuntimeDebugEnabled()) return;
  const id = roomId.trim();
  if (!id) return;
  const phases = readPhases(id);
  const t = at ?? perfNow();
  const suspenseAt = phases.suspense_release;
  if (suspenseAt != null && t > suspenseAt) return;
  writePhase(id, "flight_response_done", t);
}

export function noteR2M11BSuspenseRelease(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  writePhase(roomId.trim(), "suspense_release", perfNow());
}

export function noteR2M11BFirstClientBoundaryMount(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  writePhase(roomId.trim(), "first_client_boundary_mount", perfNow());
}

export function noteR2M11BPhase1BoundaryMount(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  writePhase(roomId.trim(), "phase1_boundary_mount", perfNow());
}

export function noteR2M11BProviderCommitStart(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  writePhase(roomId.trim(), "provider_commit_start", perfNow());
}

export function noteR2M11BProviderCommitDone(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  writePhase(roomId.trim(), "provider_commit_done", perfNow());
}

export function noteR2M11BPhase1SeedReady(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  writePhase(roomId.trim(), "phase1_seed_ready", perfNow());
}

export function noteR2M11BClientCommitDone(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  writePhase(roomId.trim(), "client_commit_done", perfNow());
}

export function noteR2M11BPhase1Visible(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  writePhase(roomId.trim(), "phase1_visible", perfNow());
}

/** RSC flight — PerformanceResourceTiming (fetchStart/responseEnd, navigation time origin). */
export function noteR2M11BFlightFromResourceTiming(
  roomId: string,
  entry: PerformanceResourceTiming,
  routeChangeStartAt: number
): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const id = roomId.trim();
  if (!id) return;
  const fetchStart = entry.fetchStart > 0 ? entry.fetchStart : entry.startTime;
  const responseEnd = entry.responseEnd > 0 ? entry.responseEnd : fetchStart + entry.duration;
  if (fetchStart < routeChangeStartAt - 50) return;
  noteR2M11BFlightResponseStart(id, fetchStart);
  noteR2M11BFlightResponseDone(id, responseEnd);
}

export function pickRoomFlightResourceTiming(
  roomId: string,
  routeChangeStartAt: number
): PerformanceResourceTiming | null {
  if (typeof performance === "undefined") return null;
  const path = `/community-messenger/rooms/${encodeURIComponent(roomId.trim())}`;
  const candidates = performance
    .getEntriesByType("resource")
    .filter((e): e is PerformanceResourceTiming => e instanceof PerformanceResourceTiming)
    .filter((e) => {
      if (e.startTime < routeChangeStartAt - 50) return false;
      const name = e.name;
      return name.includes("_rsc=") && name.includes(path);
    })
    .sort((a, b) => a.startTime - b.startTime);
  return candidates[0] ?? null;
}

export function tryCaptureR2M11BFlightFromPerformance(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const id = roomId.trim();
  if (!id) return;
  const routeT0 = readPhases(id).route_change_start;
  if (routeT0 == null) return;
  const entry = pickRoomFlightResourceTiming(id, routeT0);
  if (!entry) return;
  noteR2M11BFlightFromResourceTiming(id, entry, routeT0);
}
