"use client";

import type { CmBootstrapTier } from "@/lib/community-messenger/room/cm-bootstrap-orchestration";
import { cmDevHmrFlags } from "@/lib/community-messenger/dev/cm-event-loop-dev";

/** 목록 prefetch 최소 간격 — hover/visible 폭주 차단 */
export const CM_ROOM_PREFETCH_COOLDOWN_MS = 5_000;
/** 방 bootstrap snapshot reuse (fetch skip) */
export const CM_BOOTSTRAP_SNAPSHOT_REUSE_TTL_MS = 5_000;

export type CmBootstrapTriggerSource =
  | "prefetch"
  | "focus"
  | "visibilitychange"
  | "realtime"
  | "read_patch"
  | "presence"
  | "route_change"
  | "blocking_first"
  | "silent"
  | "unknown";

export function normalizeCmBootstrapTriggerSource(reason?: string | null): CmBootstrapTriggerSource {
  const r = String(reason ?? "")
    .trim()
    .toLowerCase();
  if (!r) return "unknown";
  if (r.includes("prefetch") || r.includes("list_prefetch")) return "prefetch";
  if (r.includes("visibility") || r.includes("pageshow") || r.includes("resume")) return "visibilitychange";
  if (r.includes("focus")) return "focus";
  if (r.includes("read") || r.includes("mark_read") || r.includes("patch")) return "read_patch";
  if (r.includes("presence")) return "presence";
  if (r.includes("realtime") || r.includes("silent_refresh") || r.includes("home_realtime") || r.includes("bump")) {
    return "realtime";
  }
  if (r.includes("route") || r.includes("room_client") || r.includes("blocking")) return "route_change";
  if (r.includes("blocking_first") || r === "room_client_block") return "blocking_first";
  if (r.includes("silent")) return "silent";
  return "unknown";
}

const lastTriggerAtByRoom = new Map<string, number>();
const scheduleMarkAtByRoom = new Map<string, number>();
const fetchStartMarkAtByRoom = new Map<string, number>();

type RoomBootstrapLock = { inflight: boolean; droppedWhileInflight: number };
const lockByRoom = new Map<string, RoomBootstrapLock>();

const prefetchInflightRooms = new Set<string>();
const lastPrefetchAttemptAtByRoom = new Map<string, number>();
const lastPrefetchSuccessAtByRoom = new Map<string, number>();

export function wasRoomPrefetchRecentlySuccessful(roomId: string): boolean {
  const id = roomId.trim();
  if (!id) return false;
  const at = lastPrefetchSuccessAtByRoom.get(id);
  return at != null && Date.now() - at < CM_ROOM_PREFETCH_COOLDOWN_MS;
}

export function isRoomPrefetchInflight(roomId: string): boolean {
  return prefetchInflightRooms.has(roomId.trim());
}

export function markRoomPrefetchAttempt(roomId: string): boolean {
  const id = roomId.trim();
  if (!id) return false;
  if (isRoomPrefetchInflight(id)) return false;
  const last = lastPrefetchAttemptAtByRoom.get(id) ?? 0;
  if (Date.now() - last < CM_ROOM_PREFETCH_COOLDOWN_MS) return false;
  if (wasRoomPrefetchRecentlySuccessful(id)) return false;
  lastPrefetchAttemptAtByRoom.set(id, Date.now());
  prefetchInflightRooms.add(id);
  return true;
}

export function markRoomPrefetchComplete(roomId: string, ok: boolean): void {
  const id = roomId.trim();
  prefetchInflightRooms.delete(id);
  if (ok) lastPrefetchSuccessAtByRoom.set(id, Date.now());
}

export function tryAcquireCmBootstrapRoomLock(roomId: string, highPriority: boolean): {
  acquired: boolean;
  dropped: boolean;
  inflight_existing: boolean;
} {
  const id = roomId.trim();
  if (!id) return { acquired: true, dropped: false, inflight_existing: false };
  if (highPriority) {
    return { acquired: true, dropped: false, inflight_existing: Boolean(lockByRoom.get(id)?.inflight) };
  }
  const st = lockByRoom.get(id) ?? { inflight: false, droppedWhileInflight: 0 };
  if (st.inflight) {
    st.droppedWhileInflight += 1;
    lockByRoom.set(id, st);
    return { acquired: false, dropped: true, inflight_existing: true };
  }
  st.inflight = true;
  lockByRoom.set(id, st);
  return { acquired: true, dropped: false, inflight_existing: false };
}

export function releaseCmBootstrapRoomLock(roomId: string): void {
  const id = roomId.trim();
  const st = lockByRoom.get(id);
  if (!st) return;
  st.inflight = false;
  lockByRoom.set(id, st);
}

export type CmBootstrapTriggerChainInput = {
  trigger_source: CmBootstrapTriggerSource;
  roomId: string;
  tier: CmBootstrapTier;
  inflight_existing?: boolean;
  deduped?: boolean;
  debounced?: boolean;
  scheduled_delay_ms?: number;
  dropped?: boolean;
  skipped_reason?: string | null;
};

export function recordCmBootstrapTriggerChain(input: CmBootstrapTriggerChainInput): {
  ts: number;
  since_last_trigger_ms: number | null;
} {
  const id = input.roomId.trim();
  const now = Date.now();
  const prev = lastTriggerAtByRoom.get(id);
  const sinceLast = prev != null ? now - prev : null;
  lastTriggerAtByRoom.set(id, now);

  if (typeof performance !== "undefined") {
    performance.mark(`cm-bootstrap-trigger:${id.slice(-8)}`);
    performance.mark(`cm-bootstrap-schedule:${id.slice(-8)}`);
    scheduleMarkAtByRoom.set(id, performance.now());
  }

  // eslint-disable-next-line no-console -- bootstrap scheduling diagnostics
  console.log("[cm-bootstrap-trigger-chain]", {
    trigger_source: input.trigger_source,
    roomId: id,
    tier: input.tier,
    ts: now,
    since_last_trigger_ms: sinceLast,
    scheduled_delay_ms: input.scheduled_delay_ms ?? 0,
    actual_fetch_start_delay_ms: null,
    inflight_existing: Boolean(input.inflight_existing),
    deduped: Boolean(input.deduped),
    debounced: Boolean(input.debounced),
    dropped: Boolean(input.dropped),
    skipped_reason: input.skipped_reason ?? null,
    ...cmDevHmrFlags(),
  });

  return { ts: now, since_last_trigger_ms: sinceLast };
}

export function markCmBootstrapFetchScheduled(roomId: string, scheduledDelayMs: number): void {
  const id = roomId.trim();
  if (typeof performance === "undefined") return;
  performance.mark(`cm-bootstrap-fetch-start:${id.slice(-8)}`);
  const schedAt = scheduleMarkAtByRoom.get(id);
  const now = performance.now();
  fetchStartMarkAtByRoom.set(id, now);
  const scheduleGapMs = schedAt != null ? Math.round(now - schedAt) : 0;
  const triggerEntries = performance.getEntriesByName(`cm-bootstrap-trigger:${id.slice(-8)}`, "mark");
  const triggerAt = triggerEntries[triggerEntries.length - 1]?.startTime;
  const actualFetchStartDelayMs =
    triggerAt != null ? Math.round(now - triggerAt) : scheduleGapMs + scheduledDelayMs;

  // eslint-disable-next-line no-console -- schedule gap diagnostics
  console.log("[cm-bootstrap-schedule-gap]", {
    roomIdSuffix: id.slice(-8),
    schedule_gap_ms: scheduleGapMs,
    scheduled_delay_ms: scheduledDelayMs,
    actual_fetch_start_delay_ms: actualFetchStartDelayMs,
    fetch_queue_wait_ms: Math.max(0, actualFetchStartDelayMs - scheduledDelayMs),
    main_thread_busy_ms_estimate: Math.max(0, scheduleGapMs),
  });
}

export function markCmBootstrapFetchResolve(roomId: string): void {
  const id = roomId.trim();
  if (typeof performance === "undefined") return;
  performance.mark(`cm-bootstrap-fetch-resolve:${id.slice(-8)}`);
}

const strictEffectRuns = new Map<string, number[]>();

/** dev StrictMode effect 이중 실행 추적 */
export function cmStrictEffectRunProbe(effectName: string, roomId?: string | null): void {
  if (process.env.NODE_ENV !== "development") return;
  const key = `${effectName}:${roomId?.trim() ?? "_"}`;
  const now = Date.now();
  const prev = strictEffectRuns.get(key) ?? [];
  const recent = prev.filter((t) => now - t < 120);
  recent.push(now);
  strictEffectRuns.set(key, recent);
  if (recent.length >= 2) {
    const duplicateWithinMs = recent[recent.length - 1]! - recent[recent.length - 2]!;
    if (duplicateWithinMs < 80) {
      // eslint-disable-next-line no-console -- StrictMode probe
      console.debug("[cm-strict-double-run]", {
        effect_name: effectName,
        roomId: roomId?.trim() || null,
        duplicate_within_ms: duplicateWithinMs,
      });
    }
  }
}
