"use client";

/**
 * 방 첫 진입 시 메인 스레드·네트워크 경쟁을 줄이기 위한 우선순위 창.
 * zero-fetch·foreground lock 로직과 분리 — 읽기 전용 게이트만 노출한다.
 */

import type { HydrationPriorityLevel } from "@/lib/community-messenger/background-hydration-scheduler";
import { beginCmRoomListRenderPause, endCmRoomListRenderPause } from "@/lib/community-messenger/room/cm-room-list-render-pause";
import {
  deferDuringRoomEntryQuietWindow,
  isCmRoomEntryQuietWindowActive,
  markRoomTapAtClick,
} from "@/lib/community-messenger/room/cm-room-entry-timing";

export const CM_ROOM_ENTRY_PRIORITY_DURATION_MS = 1500;
export const CM_ROOM_ENTRY_HOME_SYNC_DEFER_MS = CM_ROOM_ENTRY_PRIORITY_DURATION_MS;

let activeOpeningRoomId: string | null = null;
let priorityStartedPerf = 0;
let priorityEndTimer: ReturnType<typeof setTimeout> | null = null;

let pausedHomeSync = false;
let pausedPrefetch = false;
let pausedPresence = false;
let pausedMonitoring = false;
let pausedTradeMeta = false;
let pausedUnreadBadge = false;
let pausedAnalytics = false;

let homeSyncInflight = false;
let homeSyncMergeDeferred = false;
const deferredHomeSyncMerges: Array<() => void> = [];
const deferredHomeSyncFetches: Array<() => void> = [];

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function getActiveOpeningRoomId(): string | null {
  return activeOpeningRoomId;
}

export function isCmRoomEntryPriorityModeActive(): boolean {
  return activeOpeningRoomId != null;
}

export function beginCmRoomEntryPriorityMode(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  markRoomTapAtClick(id);
  beginCmRoomListRenderPause(id);
  if (priorityEndTimer != null) {
    clearTimeout(priorityEndTimer);
    priorityEndTimer = null;
  }
  activeOpeningRoomId = id;
  priorityStartedPerf = perfNow();
  pausedHomeSync = true;
  pausedPrefetch = true;
  pausedPresence = true;
  pausedMonitoring = true;
  pausedTradeMeta = true;
  pausedUnreadBadge = true;
  pausedAnalytics = true;
  homeSyncMergeDeferred = false;
  logCmRoomEntryPriorityMode({
    roomId: id,
    enabled: true,
    lightweight_mode: true,
    paused_home_sync: pausedHomeSync,
    paused_prefetch: pausedPrefetch,
    paused_presence: pausedPresence,
    paused_monitoring: pausedMonitoring,
    paused_trade_meta: pausedTradeMeta,
    paused_unread_badge: pausedUnreadBadge,
    paused_analytics: pausedAnalytics,
    duration_ms: CM_ROOM_ENTRY_PRIORITY_DURATION_MS,
  });
  priorityEndTimer = setTimeout(() => {
    endCmRoomEntryPriorityMode("duration");
  }, CM_ROOM_ENTRY_PRIORITY_DURATION_MS);
}

export function endCmRoomEntryPriorityMode(reason: "duration" | "room_shell" | "room_unmount" = "duration"): void {
  if (!activeOpeningRoomId) return;
  const roomId = activeOpeningRoomId;
  endCmRoomListRenderPause(reason === "room_unmount" ? "room_unmount" : "duration");
  const durationMs = Math.round(perfNow() - priorityStartedPerf);
  if (priorityEndTimer != null) {
    clearTimeout(priorityEndTimer);
    priorityEndTimer = null;
  }
  activeOpeningRoomId = null;
  pausedHomeSync = false;
  pausedPrefetch = false;
  pausedPresence = false;
  pausedMonitoring = false;
  pausedTradeMeta = false;
  pausedUnreadBadge = false;
  pausedAnalytics = false;
  logCmRoomEntryPriorityMode({
    roomId,
    enabled: false,
    lightweight_mode: false,
    paused_home_sync: false,
    paused_prefetch: false,
    paused_presence: false,
    paused_monitoring: false,
    paused_trade_meta: false,
    paused_unread_badge: false,
    paused_analytics: false,
    duration_ms: durationMs,
    end_reason: reason,
  });
  const merges = deferredHomeSyncMerges.splice(0, deferredHomeSyncMerges.length);
  const fetches = deferredHomeSyncFetches.splice(0, deferredHomeSyncFetches.length);
  homeSyncMergeDeferred = false;
  for (const run of merges) {
    try {
      run();
    } catch {
      /* ignore */
    }
  }
  for (const run of fetches) {
    try {
      run();
    } catch {
      /* ignore */
    }
  }
}

export function shouldSkipRoomPrefetchDuringEntry(roomId: string): boolean {
  const id = String(roomId ?? "").trim();
  if (!id || !isCmRoomEntryPriorityModeActive()) return false;
  const active = activeOpeningRoomId;
  if (active === id) return true;
  return pausedPrefetch;
}

export function shouldDeferHomeSyncStart(): boolean {
  return isCmRoomEntryPriorityModeActive() && pausedHomeSync;
}

export function noteHomeSyncInflightDuringEntry(inflight: boolean): void {
  if (!isCmRoomEntryPriorityModeActive()) {
    homeSyncInflight = false;
    return;
  }
  homeSyncInflight = inflight;
}

export function shouldDeferHomeSyncMerge(): boolean {
  return isCmRoomEntryPriorityModeActive() || homeSyncMergeDeferred;
}

export function deferHomeSyncMerge(run: () => void): void {
  if (!shouldDeferHomeSyncMerge()) {
    run();
    return;
  }
  homeSyncMergeDeferred = true;
  deferredHomeSyncMerges.push(run);
  logCmHomeSyncDeferredByRoomEntry({
    roomId: activeOpeningRoomId ?? "",
    home_sync_inflight: homeSyncInflight,
    merge_deferred: true,
    resume_after_ms: Math.max(
      0,
      CM_ROOM_ENTRY_HOME_SYNC_DEFER_MS - Math.round(perfNow() - priorityStartedPerf)
    ),
  });
}

export function deferHomeSyncFetch(run: () => void): void {
  if (!shouldDeferHomeSyncStart()) {
    run();
    return;
  }
  deferredHomeSyncFetches.push(run);
  logCmHomeSyncDeferredByRoomEntry({
    roomId: activeOpeningRoomId ?? "",
    home_sync_inflight: homeSyncInflight,
    merge_deferred: false,
    resume_after_ms: Math.max(
      0,
      CM_ROOM_ENTRY_HOME_SYNC_DEFER_MS - Math.round(perfNow() - priorityStartedPerf)
    ),
  });
}

export function shouldDeferMessengerMonitoringFlush(): boolean {
  return (isCmRoomEntryPriorityModeActive() && pausedMonitoring) || isCmRoomEntryQuietWindowActive();
}

export function shouldDeferDuringRoomEntryQuiet(task: () => void): boolean {
  return deferDuringRoomEntryQuietWindow(task);
}

export function shouldDeferTradeChatListMetaHydration(): boolean {
  return isCmRoomEntryPriorityModeActive() && pausedTradeMeta;
}

export function isCmRouteTransitionLightweightModeActive(): boolean {
  return isCmRoomEntryPriorityModeActive();
}

export function isRoomOpening(): boolean {
  return isCmRoomEntryPriorityModeActive();
}

export function shouldDeferUnreadBadgeRepaint(): boolean {
  return isCmRoomEntryPriorityModeActive() && pausedUnreadBadge;
}

export function shouldDeferBackgroundAnalytics(): boolean {
  return isCmRoomEntryPriorityModeActive() && pausedAnalytics;
}

export function shouldDeferBackgroundHydrationPriority(priority: HydrationPriorityLevel): boolean {
  if (!isCmRoomEntryPriorityModeActive()) return false;
  return priority !== "high";
}

export function logCmRoomEntryPriorityMode(payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console -- room entry priority diagnostics
  console.log("[cm-room-entry-priority-mode]", payload);
}

export function logCmHomeSyncDeferredByRoomEntry(payload: {
  roomId: string;
  home_sync_inflight: boolean;
  merge_deferred: boolean;
  resume_after_ms: number;
}): void {
  // eslint-disable-next-line no-console -- home-sync defer diagnostics
  console.log("[cm-home-sync-deferred-by-room-entry]", payload);
}

export function logCmRoomBootstrapPatchOnly(payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console -- bootstrap patch-only diagnostics
  console.log("[cm-room-bootstrap-patch-only]", payload);
}

export function logCmRenderRoomEntry(payload: Record<string, unknown>): void {
  if (shouldDeferBackgroundAnalytics()) return;
  // eslint-disable-next-line no-console -- room entry render diagnostics
  console.log("[cm-render-room-entry]", payload);
}
