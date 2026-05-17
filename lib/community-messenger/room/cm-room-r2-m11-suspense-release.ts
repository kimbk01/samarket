"use client";

/**
 * R2-M11 — route_change → Suspense release → phase1 visible 구간 계측.
 * 켜기: sessionStorage `samarket:debug:runtime=1`
 */
import { getRoomTapT0 } from "@/lib/community-messenger/room/cm-room-entry-timing";
import {
  recordAppWidePhaseLastMs,
  samarketRuntimeDebugEnabled,
  samarketRuntimeDebugLog,
} from "@/lib/runtime/samarket-runtime-debug";

export type R2M11SuspensePhase =
  | "route_change_start"
  | "suspense_fallback_visible"
  | "suspense_release"
  | "first_client_boundary"
  | "provider_commit"
  | "phase1_seed_ready"
  | "phase1_visible";

const K_ROOM_ID = "samarket:cm:r2m11:room_id";
const K_PHASES = "samarket:cm:r2m11:phases:";
const K_BREAKDOWN = "samarket:cm:r2m11:breakdown_done:";
const K_NESTED_SUSPENSE = "samarket:cm:r2m11:nested_suspense_count";

let nestedSuspenseBoundariesObserved = 0;

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function phasesKey(roomId: string): string {
  return K_PHASES + roomId.trim();
}

function readPhases(roomId: string): Partial<Record<R2M11SuspensePhase, number>> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(phasesKey(roomId));
    if (!raw) return {};
    return JSON.parse(raw) as Partial<Record<R2M11SuspensePhase, number>>;
  } catch {
    return {};
  }
}

function writePhase(roomId: string, phase: R2M11SuspensePhase, at: number): void {
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
    recordAppWidePhaseLastMs(`r2m11_${phase}_ms`, ms);
    recordAppWidePhaseLastMs(`messenger_room_entry_r2m11_${phase}_ms`, ms);
  }
  const routeT0 = phases.route_change_start;
  if (routeT0 != null && phase !== "route_change_start") {
    const seg = Math.max(0, Math.round(at - routeT0));
    recordAppWidePhaseLastMs(`r2m11_route_${phase}_ms`, seg);
    recordAppWidePhaseLastMs(`messenger_room_entry_r2m11_route_${phase}_ms`, seg);
  }
  tryEmitR2M11Breakdown(id);
}

function delta(
  phases: Partial<Record<R2M11SuspensePhase, number>>,
  a: R2M11SuspensePhase,
  b: R2M11SuspensePhase
): number | null {
  const va = phases[a];
  const vb = phases[b];
  if (va == null || vb == null) return null;
  return Math.max(0, Math.round(vb - va));
}

function tryEmitR2M11Breakdown(roomId: string): void {
  if (!samarketRuntimeDebugEnabled() || typeof sessionStorage === "undefined") return;
  const id = roomId.trim();
  const doneKey = K_BREAKDOWN + id;
  try {
    if (sessionStorage.getItem(doneKey) === "1") return;
  } catch {
    return;
  }
  const phases = readPhases(id);
  if (phases.phase1_visible == null && phases.suspense_release == null) return;
  if (phases.phase1_visible == null) return;

  let nested = nestedSuspenseBoundariesObserved;
  try {
    const stored = sessionStorage.getItem(K_NESTED_SUSPENSE);
    if (stored) nested = Number(stored) || nested;
  } catch {
    /* ignore */
  }

  const payload = {
    roomId: id,
    route_change_start_ms: phases.route_change_start ?? null,
    suspense_fallback_visible_ms: phases.suspense_fallback_visible ?? null,
    suspense_release_ms: phases.suspense_release ?? null,
    phase1_visible_ms: phases.phase1_visible ?? null,
    provider_commit_ms: phases.provider_commit ?? null,
    first_client_boundary_ms: phases.first_client_boundary ?? null,
    phase1_seed_ready_ms: phases.phase1_seed_ready ?? null,
    route_change_to_fallback_ms: delta(phases, "route_change_start", "suspense_fallback_visible"),
    route_change_to_release_ms: delta(phases, "route_change_start", "suspense_release"),
    release_to_phase1_visible_ms: delta(phases, "suspense_release", "phase1_visible"),
    release_to_provider_commit_ms: delta(phases, "suspense_release", "provider_commit"),
    nested_suspense_count: nested,
    server_await_chain_ms: 0,
    phases,
  };
  try {
    sessionStorage.setItem(doneKey, "1");
  } catch {
    /* ignore */
  }
  samarketRuntimeDebugLog("r2-m11", "suspense_release_breakdown", payload);
  if (typeof console !== "undefined" && typeof console.log === "function") {
    console.log("[R2-M11-SUSPENSE]", JSON.stringify(payload));
  }
}

export function noteR2M11NestedSuspenseBoundary(): void {
  if (!samarketRuntimeDebugEnabled()) return;
  nestedSuspenseBoundariesObserved += 1;
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(K_NESTED_SUSPENSE, String(nestedSuspenseBoundariesObserved));
  } catch {
    /* ignore */
  }
}

export function noteR2M11RouteChangeStart(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  nestedSuspenseBoundariesObserved = 0;
  writePhase(roomId, "route_change_start", perfNow());
}

export function noteR2M11SegmentLoadingFallbackVisible(): void {
  if (!samarketRuntimeDebugEnabled()) return;
  noteR2M11NestedSuspenseBoundary();
  if (typeof sessionStorage === "undefined") return;
  let roomId = "";
  try {
    roomId = sessionStorage.getItem(K_ROOM_ID)?.trim() ?? "";
  } catch {
    return;
  }
  if (!roomId) {
    try {
      roomId = sessionStorage.getItem("samarket:cm:r2m10:room_id")?.trim() ?? "";
    } catch {
      return;
    }
  }
  if (!roomId) return;
  writePhase(roomId, "suspense_fallback_visible", perfNow());
}

export function noteR2M11SuspenseRelease(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  writePhase(roomId, "suspense_release", perfNow());
}

export function noteR2M11FirstClientBoundary(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  writePhase(roomId, "first_client_boundary", perfNow());
}

export function noteR2M11ProviderCommit(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  writePhase(roomId, "provider_commit", perfNow());
}

export function noteR2M11Phase1SeedReady(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  writePhase(roomId, "phase1_seed_ready", perfNow());
}

export function noteR2M11Phase1Visible(roomId: string): void {
  if (!samarketRuntimeDebugEnabled()) return;
  writePhase(roomId, "phase1_visible", perfNow());
}

export function resetR2M11SuspenseReleaseForTests(): void {
  nestedSuspenseBoundariesObserved = 0;
  if (typeof sessionStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const k = sessionStorage.key(i);
    if (
      k === K_ROOM_ID ||
      k === K_NESTED_SUSPENSE ||
      k?.startsWith(K_PHASES) ||
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
