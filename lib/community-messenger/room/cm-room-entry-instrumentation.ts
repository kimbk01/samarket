import { cmProdParityModeEnabled } from "@/lib/community-messenger/dev/cm-event-loop-dev";
import {
  noteCmColdEntryComposerFinalized,
  noteCmColdEntryShellFinalized,
} from "@/lib/community-messenger/room/cm-cold-entry-path";
import { recordRoomEntryStage } from "@/lib/community-messenger/room/cm-room-entry-timing";
import { tryEmitRoomEntryTimingV2WhenReady } from "@/lib/community-messenger/room/cm-room-entry-timing";
import { entryTimingT0 } from "@/lib/community-messenger/room/cm-room-entry-timing";
import {
  warnCmPerfRegressionComposerVisibleMs,
  warnCmPerfRegressionShellVisibleMs,
} from "@/lib/community-messenger/room/cm-messenger-perf-regression-guard";

/**
 * Room entry perf — unread/read ack/realtime 의미 변경 없이 **측정·로그만** 담당.
 * 켜기: `NEXT_PUBLIC_MESSENGER_PERF_TRACE_ROOM_ENTRY=1` 또는 `NEXT_PUBLIC_MESSENGER_PERF_TRACE=1` (클라 번들).
 */

const MILESTONE_KEYS = [
  "room_shell_visible_ms",
  "message_list_visible_ms",
  "composer_visible_ms",
  "realtime_ready_ms",
  "deferred_history_ms",
] as const;

type MilestoneKey = (typeof MILESTONE_KEYS)[number];

let routeT0Perf = 0;
const milestones: Partial<Record<MilestoneKey, number>> = {};
const finalizedMilestones = new Set<MilestoneKey>();
let lastBootstrapPayloadKb = 0;
let lastUsedPrefetch = false;
let lastUsedCachedSnapshot = false;
let v2EmittedForRoom: string | null = null;
let traceRoomId: string | null = null;

export function cmRoomEntryTraceEnabled(): boolean {
  if (cmProdParityModeEnabled()) return false;
  try {
    return (
      typeof process !== "undefined" &&
      typeof process.env !== "undefined" &&
      (process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE_ROOM_ENTRY === "1" ||
        process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE === "1")
    );
  } catch {
    return false;
  }
}

export function isCmRoomEntryMilestoneFinalized(key: MilestoneKey): boolean {
  return finalizedMilestones.has(key);
}

export function getCmRoomEntryMilestoneMs(key: MilestoneKey): number | null {
  const ms = milestones[key];
  return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
}

function resolveMilestoneMs(): number | null {
  const t0 = entryTimingT0() || (routeT0Perf > 0 ? routeT0Perf : 0);
  if (t0 <= 0 || typeof performance === "undefined") return null;
  return Math.round(performance.now() - t0);
}

function writeMilestone(key: MilestoneKey, ms: number, finalize: boolean): boolean {
  if (finalizedMilestones.has(key)) return false;
  if (milestones[key] != null) {
    if (finalize) finalizedMilestones.add(key);
    return false;
  }
  milestones[key] = ms;
  if (finalize) finalizedMilestones.add(key);
  return true;
}

/** 목록에서 방으로 push 직전 — 진입 세션 시작 시각 */
export function markCmRoomEntryForwardNavigation(): void {
  if (!cmRoomEntryTraceEnabled()) return;
  routeT0Perf = typeof performance !== "undefined" ? performance.now() : 0;
}

/** 직링크 등 forward nav 없이 방이 열릴 때 t0 보정 */
export function ensureCmRoomEntryRouteT0(): number {
  if (!cmRoomEntryTraceEnabled()) return 0;
  if (routeT0Perf <= 0 && typeof performance !== "undefined") {
    routeT0Perf = performance.now();
  }
  return routeT0Perf;
}

export function resetCmRoomEntryTraceSession(roomId: string): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const id = String(roomId ?? "").trim();
  if (!id) return;

  const preserved: Partial<Record<MilestoneKey, number>> = {};
  const preservedFinalized = new Set<MilestoneKey>();
  if (traceRoomId === id) {
    for (const k of MILESTONE_KEYS) {
      if (finalizedMilestones.has(k) && milestones[k] != null) {
        preserved[k] = milestones[k];
        preservedFinalized.add(k);
      }
    }
  }

  traceRoomId = id;
  for (const k of MILESTONE_KEYS) delete milestones[k];
  finalizedMilestones.clear();
  Object.assign(milestones, preserved);
  for (const k of preservedFinalized) finalizedMilestones.add(k);

  lastBootstrapPayloadKb = 0;
  lastUsedPrefetch = false;
  lastUsedCachedSnapshot = false;
  if (!preservedFinalized.size) {
    v2EmittedForRoom = null;
  }
}

export function recordCmRoomEntryMilestone(key: MilestoneKey): void {
  if (!cmRoomEntryTraceEnabled()) return;
  if (finalizedMilestones.has(key)) return;
  const ms = resolveMilestoneMs();
  if (ms == null) return;
  writeMilestone(key, ms, false);
  maybeEmitCmRoomEntryV2Log(traceRoomId ?? "");
}

/** PASS0 overlay·in-route shell — finalize 후 bootstrap 이 overwrite 못 함 */
export function finalizeCmRoomEntryShellVisibleMs(roomId: string, coldBootstrap = true): number | null {
  const id = String(roomId ?? "").trim();
  if (!id) return null;
  const ms = resolveMilestoneMs();
  if (ms != null) warnCmPerfRegressionShellVisibleMs(id, ms);
  if (!cmRoomEntryTraceEnabled()) return null;
  traceRoomId = id;
  if (ms == null) return null;
  if (!writeMilestone("room_shell_visible_ms", ms, true)) {
    return milestones.room_shell_visible_ms ?? ms;
  }
  recordRoomEntryStage("shell");
  noteCmColdEntryShellFinalized(id, coldBootstrap);
  maybeEmitCmRoomEntryV2Log(id);
  return ms;
}

/** PASS1 composer frame visible — textarea hydrate·bootstrap 와 분리 */
export function finalizeCmRoomEntryComposerFrameVisibleMs(roomId: string, coldBootstrap = true): number | null {
  const id = String(roomId ?? "").trim();
  if (!id) return null;
  const ms = resolveMilestoneMs();
  if (ms != null) warnCmPerfRegressionComposerVisibleMs(id, ms);
  if (!cmRoomEntryTraceEnabled()) return null;
  traceRoomId = id;
  if (ms == null) return null;
  if (!writeMilestone("composer_visible_ms", ms, true)) {
    return milestones.composer_visible_ms ?? ms;
  }
  recordRoomEntryStage("composer");
  noteCmColdEntryComposerFinalized(id, coldBootstrap);
  maybeEmitCmRoomEntryV2Log(id);
  return ms;
}

export function setCmRoomEntryBootstrapMeta(meta: {
  payload_kb: number;
  used_prefetch: boolean;
  used_cached_snapshot: boolean;
}): void {
  if (!cmRoomEntryTraceEnabled()) return;
  lastBootstrapPayloadKb = meta.payload_kb;
  lastUsedPrefetch = meta.used_prefetch;
  lastUsedCachedSnapshot = meta.used_cached_snapshot;
}

export function getCmRoomEntryBootstrapMeta(): {
  payload_kb: number;
  used_prefetch: boolean;
  used_cached_snapshot: boolean;
} {
  return {
    payload_kb: lastBootstrapPayloadKb,
    used_prefetch: lastUsedPrefetch,
    used_cached_snapshot: lastUsedCachedSnapshot,
  };
}

export function logCmRoomEntryAnalysis(payload: Record<string, unknown>): void {
  if (!cmRoomEntryTraceEnabled()) return;
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug("[cm-room-entry-analysis]", JSON.stringify(payload));
  }
}

function cmRoomEntryV2Ready(): boolean {
  return (
    milestones.room_shell_visible_ms != null && milestones.composer_visible_ms != null
  );
}

function maybeEmitCmRoomEntryV2Log(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id || !cmRoomEntryV2Ready()) return;
  tryEmitCmRoomEntryV2Log(id);
  tryEmitRoomEntryTimingV2WhenReady();
}

/**
 * 한 방 진입당 1회 — shell·composer finalize 후 호출.
 */
export function tryEmitCmRoomEntryV2Log(roomId: string): void {
  if (!cmRoomEntryTraceEnabled()) return;
  const id = String(roomId ?? "").trim();
  if (!id || v2EmittedForRoom === id) return;
  if (!cmRoomEntryV2Ready()) return;
  if (typeof console === "undefined" || typeof console.debug !== "function") return;
  v2EmittedForRoom = id;
  const body = {
    room_id_suffix: id.length <= 8 ? id : id.slice(-8),
    room_shell_visible_ms: milestones.room_shell_visible_ms ?? null,
    message_list_visible_ms: milestones.message_list_visible_ms ?? null,
    composer_visible_ms: milestones.composer_visible_ms ?? null,
    realtime_ready_ms: milestones.realtime_ready_ms ?? null,
    deferred_history_ms: milestones.deferred_history_ms ?? null,
    payload_kb: lastBootstrapPayloadKb,
    used_prefetch: lastUsedPrefetch,
    used_cached_snapshot: lastUsedCachedSnapshot,
  };
  // eslint-disable-next-line no-console -- gated room entry v2
  console.debug("[cm-room-entry-v2]", JSON.stringify(body));
}

export function resetCmRoomEntryInstrumentationForTests(): void {
  routeT0Perf = 0;
  traceRoomId = null;
  for (const k of MILESTONE_KEYS) delete milestones[k];
  finalizedMilestones.clear();
  lastBootstrapPayloadKb = 0;
  lastUsedPrefetch = false;
  lastUsedCachedSnapshot = false;
  v2EmittedForRoom = null;
}

/** @deprecated tests — use resetCmRoomEntryInstrumentationForTests */
export const resetCmRoomEntryTraceSessionForTests = resetCmRoomEntryInstrumentationForTests;
