"use client";

/**
 * lite bootstrap `setData` 구간 — home-sync·background hydration patch 가 겹치지 않게 지연·coalesce.
 * unread/realtime 의미는 바꾸지 않고 실행 시점만 조율한다.
 */

import { peekBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { applyHomeListPatch } from "@/lib/community-messenger/home-list-patch";
import {
  fingerprintHomeBootstrapLists,
  fingerprintHomeSyncLists,
  logHomeSyncIdenticalSkip,
} from "@/lib/community-messenger/home/home-sync-list-fingerprint";

export type DeferredHomeSyncPayload = {
  chats?: import("@/lib/community-messenger/types").CommunityMessengerRoomSummary[];
  groups?: import("@/lib/community-messenger/types").CommunityMessengerRoomSummary[];
  requests?: import("@/lib/community-messenger/types").CommunityMessengerBootstrap["requests"];
  friends?: import("@/lib/community-messenger/types").CommunityMessengerProfileLite[];
  roomMode?: "replace" | "critical_patch";
};

type DeferredHomeSyncApply = (payload: DeferredHomeSyncPayload) => void;

let liteMergeActive = false;
let liteMergeComplete = true;
let hydrationOverlap = false;
const deferredHomeSyncQueue: DeferredHomeSyncPayload[] = [];
let deferredApplyRunner: DeferredHomeSyncApply | null = null;
let lastFlushedHomeSyncFingerprint = "";

/** non-silent·silent refresh 겹침 — 한 라운드만 진행 */
let homeRefreshRoundActive = false;
let homeRefreshRoundPendingSilent: boolean | null = null;

/** visibility/pageshow 복귀 직후 silent home-sync 억제 — 검증 스크립트 2.8s 창 + idle 예약 포함 */
const HOME_VISIBILITY_RESTORE_QUIET_MS = 4_200;
let lastVisibilityRestoredAt = 0;

export function noteHomeVisibilityHidden(): void {
  lastVisibilityRestoredAt = 0;
}

export function noteHomeVisibilityRestored(): void {
  lastVisibilityRestoredAt = Date.now();
}

export function shouldBlockSilentHomeSyncForVisibilityRestore(): boolean {
  if (typeof document === "undefined") return false;
  if (document.visibilityState !== "visible") return false;
  if (lastVisibilityRestoredAt <= 0) return false;
  const elapsed = Date.now() - lastVisibilityRestoredAt;
  if (elapsed >= HOME_VISIBILITY_RESTORE_QUIET_MS) return false;
  logHomeSyncIdenticalSkip("visibility_restore_quiet", {
    elapsed_ms: elapsed,
    quiet_ms: HOME_VISIBILITY_RESTORE_QUIET_MS,
  });
  return true;
}

export function tryEnterHomeBootstrapRefreshRound(silent: boolean): boolean {
  if (silent && shouldBlockSilentHomeSyncForVisibilityRestore()) {
    return false;
  }
  if (!homeRefreshRoundActive) {
    homeRefreshRoundActive = true;
    return true;
  }
  if (silent) {
    homeRefreshRoundPendingSilent = true;
    return false;
  }
  return false;
}

export function finishHomeBootstrapRefreshRound(onPendingSilent: () => void): void {
  const pending = homeRefreshRoundPendingSilent;
  homeRefreshRoundActive = false;
  homeRefreshRoundPendingSilent = null;
  if (pending) {
    if (shouldBlockSilentHomeSyncForVisibilityRestore()) {
      return;
    }
    queueMicrotask(onPendingSilent);
  }
}

function homeSyncWouldChangeBootstrap(base: import("@/lib/community-messenger/types").CommunityMessengerBootstrap, payload: DeferredHomeSyncPayload): boolean {
  const roomMode = payload.roomMode ?? "replace";
  const next = applyHomeListPatch(
    base,
    {
      kind: "home_sync",
      chats: payload.chats,
      groups: payload.groups,
      requests: payload.requests,
      friends: payload.friends,
      roomMode,
    },
    "home-sync"
  );
  if (!next || next === base) return false;
  return fingerprintHomeBootstrapLists(next) !== fingerprintHomeBootstrapLists(base);
}

export function shouldSkipHomeSyncPayload(payload: DeferredHomeSyncPayload): boolean {
  const incomingFp = fingerprintHomeSyncLists(payload);
  if (incomingFp && incomingFp === lastFlushedHomeSyncFingerprint) {
    logHomeSyncIdenticalSkip("incoming_matches_last_flush", {
      incoming_rooms: (payload.chats?.length ?? 0) + (payload.groups?.length ?? 0),
    });
    return true;
  }

  const base = peekBootstrapCache();
  if (!base) return false;

  const cacheFp = fingerprintHomeBootstrapLists(base);
  if (incomingFp && incomingFp === cacheFp) {
    logHomeSyncIdenticalSkip("incoming_matches_bootstrap_cache", {
      incoming_rooms: (payload.chats?.length ?? 0) + (payload.groups?.length ?? 0),
      cache_rooms: (base.chats?.length ?? 0) + (base.groups?.length ?? 0),
    });
    return true;
  }

  if (!homeSyncWouldChangeBootstrap(base, payload)) {
    logHomeSyncIdenticalSkip("apply_noop_against_bootstrap", {
      incoming_rooms: (payload.chats?.length ?? 0) + (payload.groups?.length ?? 0),
      cache_rooms: (base.chats?.length ?? 0) + (base.groups?.length ?? 0),
      room_mode: payload.roomMode ?? "replace",
    });
    return true;
  }

  return false;
}

export function noteHomeSyncPayloadFlushed(payload: DeferredHomeSyncPayload): void {
  const base = peekBootstrapCache();
  const fp = base ? fingerprintHomeBootstrapLists(base) : fingerprintHomeSyncLists(payload);
  if (fp) lastFlushedHomeSyncFingerprint = fp;
}

export function beginLiteClientMergeGate(): void {
  liteMergeActive = true;
  liteMergeComplete = false;
  hydrationOverlap = false;
}

export function endLiteClientMergeGate(): void {
  liteMergeActive = false;
  liteMergeComplete = true;
  flushDeferredHomeSyncPatches();
}

export function isLiteClientMergeGateActive(): boolean {
  return liteMergeActive;
}

export function wasHydrationOverlapDuringLiteMerge(): boolean {
  return hydrationOverlap;
}

export function registerDeferredHomeSyncRunner(run: DeferredHomeSyncApply): void {
  deferredApplyRunner = run;
}

export function deferHomeSyncPatchDuringLiteMerge(payload: DeferredHomeSyncPayload): boolean {
  if (!liteMergeActive) return false;
  hydrationOverlap = true;
  const last = deferredHomeSyncQueue[deferredHomeSyncQueue.length - 1];
  if (last) {
    deferredHomeSyncQueue[deferredHomeSyncQueue.length - 1] = {
      chats: payload.chats ?? last.chats,
      groups: payload.groups ?? last.groups,
      requests: payload.requests ?? last.requests,
      friends: payload.friends ?? last.friends,
      roomMode: payload.roomMode ?? last.roomMode,
    };
  } else {
    deferredHomeSyncQueue.push(payload);
  }
  return true;
}

function flushDeferredHomeSyncPatches(): void {
  if (!deferredApplyRunner || deferredHomeSyncQueue.length === 0) return;
  const merged: DeferredHomeSyncPayload = {};
  for (const p of deferredHomeSyncQueue) {
    if (p.chats !== undefined) merged.chats = p.chats;
    if (p.groups !== undefined) merged.groups = p.groups;
    if (p.requests !== undefined) merged.requests = p.requests;
    if (p.friends !== undefined) merged.friends = p.friends;
    if (p.roomMode !== undefined) merged.roomMode = p.roomMode;
  }
  deferredHomeSyncQueue.length = 0;
  if (shouldSkipHomeSyncPayload(merged)) return;
  noteHomeSyncPayloadFlushed(merged);
  deferredApplyRunner(merged);
}

/** lite merge 완료 전 silent refresh·discoverable follow-up 을 지연할 때 */
export function shouldDeferPostLiteFollowUp(): boolean {
  return liteMergeActive || !liteMergeComplete;
}

export function markLiteMergeFollowUpsUnblocked(): void {
  liteMergeComplete = true;
}
