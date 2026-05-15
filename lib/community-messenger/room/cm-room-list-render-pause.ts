"use client";

import { CM_ROOM_ENTRY_PRIORITY_DURATION_MS } from "@/lib/community-messenger/room/cm-room-entry-priority-mode";

let paused = false;
let pauseRoomId = "";
let pauseStartedPerf = 0;
let pauseEndTimer: ReturnType<typeof setTimeout> | null = null;
let deferredUpdatesCount = 0;
const deferredQueue: Array<() => void> = [];

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function beginCmRoomListRenderPause(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  if (pauseEndTimer != null) {
    clearTimeout(pauseEndTimer);
    pauseEndTimer = null;
  }
  paused = true;
  pauseRoomId = id;
  pauseStartedPerf = perfNow();
  deferredUpdatesCount = 0;
  deferredQueue.length = 0;
  logCmRoomListRenderPaused({ paused: true, duration_ms: CM_ROOM_ENTRY_PRIORITY_DURATION_MS, deferred_updates_count: 0 });
  pauseEndTimer = setTimeout(() => {
    endCmRoomListRenderPause("duration");
  }, CM_ROOM_ENTRY_PRIORITY_DURATION_MS);
}

export function endCmRoomListRenderPause(reason: "duration" | "room_unmount" = "duration"): void {
  if (!paused) return;
  if (pauseEndTimer != null) {
    clearTimeout(pauseEndTimer);
    pauseEndTimer = null;
  }
  const durationMs = Math.round(perfNow() - pauseStartedPerf);
  paused = false;
  const pending = deferredQueue.splice(0);
  const count = deferredUpdatesCount;
  deferredUpdatesCount = 0;
  pauseRoomId = "";
  logCmRoomListRenderPaused({
    paused: false,
    duration_ms: durationMs,
    deferred_updates_count: count,
    end_reason: reason,
  });
  for (const run of pending) {
    try {
      run();
    } catch {
      /* ignore */
    }
  }
}

export function shouldPauseCmRoomListRender(): boolean {
  return paused;
}

/** 방 진입 중 목록 subtree 렌더·패치 동결 (`room_opening === true`) */
export function isRoomListSubtreeFrozen(): boolean {
  return paused;
}

export function isRoomOpening(): boolean {
  return paused;
}

export function shouldFreezeRoomListSubtree(): boolean {
  return paused;
}

export function deferCmRoomListRenderUpdate(run: () => void): void {
  if (!paused) {
    run();
    return;
  }
  deferredUpdatesCount += 1;
  deferredQueue.push(run);
}

export function logCmRoomListRenderPaused(payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console -- list render pause diagnostics
  console.log("[cm-room-list-render-paused]", payload);
}
