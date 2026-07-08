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
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

export type DeferredHomeSyncPayload = {
  chats?: CommunityMessengerRoomSummary[];
  groups?: CommunityMessengerRoomSummary[];
  requests?: CommunityMessengerBootstrap["requests"];
  friends?: CommunityMessengerBootstrap["friends"];
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

function roomUnreadCount(room: CommunityMessengerRoomSummary | undefined): number {
  return Math.max(0, Math.floor(Number(room?.unreadCount) || 0));
}

function mergeRoomSummariesPreferHigherUnread(
  prev: CommunityMessengerRoomSummary | undefined,
  incoming: CommunityMessengerRoomSummary
): CommunityMessengerRoomSummary {
  if (!prev) return incoming;
  const prevUnread = roomUnreadCount(prev);
  const incomingUnread = roomUnreadCount(incoming);
  if (incomingUnread >= prevUnread) return incoming;
  return { ...incoming, unreadCount: prevUnread };
}

function mergeRoomListsPreferHigherUnread(
  prev: CommunityMessengerRoomSummary[] | undefined,
  incoming: CommunityMessengerRoomSummary[] | undefined
): CommunityMessengerRoomSummary[] | undefined {
  if (!incoming?.length) return prev;
  if (!prev?.length) return incoming;
  const incomingById = new Map(incoming.map((room) => [room.id, room]));
  const merged = prev.map((room) => {
    const patch = incomingById.get(room.id);
    if (!patch) return room;
    incomingById.delete(room.id);
    return mergeRoomSummariesPreferHigherUnread(room, patch);
  });
  for (const patch of incomingById.values()) {
    merged.push(patch);
  }
  return merged;
}

export type HomeSyncSkipContext = {
  /** React `data` — cache-only hydrate 누락 감지용 */
  reactBase?: CommunityMessengerBootstrap | null;
};

/** server positive unread 가 React list 에 아직 반영되지 않았으면 identical skip 금지 */
export function homeSyncPayloadNeedsReactUnreadSync(
  payload: DeferredHomeSyncPayload,
  reactBase: CommunityMessengerBootstrap | null | undefined,
  cacheBase: CommunityMessengerBootstrap | null | undefined
): boolean {
  const reactById = reactBase
    ? new Map(
        [...(reactBase.chats ?? []), ...(reactBase.groups ?? [])].map((room) => [room.id, room])
      )
    : new Map<string, CommunityMessengerRoomSummary>();
  const cacheById = cacheBase
    ? new Map(
        [...(cacheBase.chats ?? []), ...(cacheBase.groups ?? [])].map((room) => [room.id, room])
      )
    : new Map<string, CommunityMessengerRoomSummary>();

  for (const room of [...(payload.chats ?? []), ...(payload.groups ?? [])]) {
    const incomingUnread = roomUnreadCount(room);
    if (incomingUnread <= 0) continue;
    const reactUnread = roomUnreadCount(reactById.get(room.id));
    if (incomingUnread > reactUnread) return true;
    if (!reactBase) {
      const cacheUnread = roomUnreadCount(cacheById.get(room.id));
      if (cacheUnread > 0 || incomingUnread > 0) return true;
    }
  }
  return false;
}

/** critical_patch payload carries a higher unread than bootstrap cache for any known room. */
export function homeSyncPayloadHasUnreadIncreaseAgainstBase(
  payload: DeferredHomeSyncPayload,
  base: CommunityMessengerBootstrap
): boolean {
  const baseById = new Map(
    [...(base.chats ?? []), ...(base.groups ?? [])].map((room) => [room.id, room])
  );
  for (const room of [...(payload.chats ?? []), ...(payload.groups ?? [])]) {
    const prev = baseById.get(room.id);
    if (!prev) continue;
    if (roomUnreadCount(room) > roomUnreadCount(prev)) return true;
  }
  return false;
}

function coalesceDeferredHomeSyncPayload(
  last: DeferredHomeSyncPayload,
  payload: DeferredHomeSyncPayload
): DeferredHomeSyncPayload {
  const hasLast =
    last.chats !== undefined ||
    last.groups !== undefined ||
    last.requests !== undefined ||
    last.friends !== undefined ||
    last.roomMode !== undefined;
  if (!hasLast) return { ...payload };

  const chats = mergeRoomListsPreferHigherUnread(last.chats, payload.chats);
  const groups = mergeRoomListsPreferHigherUnread(last.groups, payload.groups);
  return {
    chats: chats ?? last.chats ?? payload.chats,
    groups: groups ?? last.groups ?? payload.groups,
    requests: payload.requests ?? last.requests,
    friends: payload.friends ?? last.friends,
    roomMode: payload.roomMode ?? last.roomMode,
  };
}

function mergeDeferredHomeSyncQueue(queue: DeferredHomeSyncPayload[]): DeferredHomeSyncPayload {
  let merged: DeferredHomeSyncPayload = {};
  for (const payload of queue) {
    merged = coalesceDeferredHomeSyncPayload(merged, payload);
  }
  return merged;
}

function homeSyncWouldChangeBootstrap(base: CommunityMessengerBootstrap, payload: DeferredHomeSyncPayload): boolean {
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

function shouldForceApplyUnreadIncrease(payload: DeferredHomeSyncPayload): boolean {
  const base = peekBootstrapCache();
  if (!base) return false;
  return homeSyncPayloadHasUnreadIncreaseAgainstBase(payload, base);
}

export function shouldSkipHomeSyncPayload(
  payload: DeferredHomeSyncPayload,
  context?: HomeSyncSkipContext
): boolean {
  const cache = peekBootstrapCache();
  const reactBase = context?.reactBase ?? null;
  if (homeSyncPayloadNeedsReactUnreadSync(payload, reactBase, cache)) return false;
  if (shouldForceApplyUnreadIncrease(payload)) return false;

  const incomingFp = fingerprintHomeSyncLists(payload);
  if (incomingFp && incomingFp === lastFlushedHomeSyncFingerprint) {
    logHomeSyncIdenticalSkip("incoming_matches_last_flush", {
      incoming_rooms: (payload.chats?.length ?? 0) + (payload.groups?.length ?? 0),
    });
    return true;
  }

  if (!cache) return false;

  const cacheFp = fingerprintHomeBootstrapLists(cache);
  if (incomingFp && incomingFp === cacheFp) {
    logHomeSyncIdenticalSkip("incoming_matches_bootstrap_cache", {
      incoming_rooms: (payload.chats?.length ?? 0) + (payload.groups?.length ?? 0),
      cache_rooms: (cache.chats?.length ?? 0) + (cache.groups?.length ?? 0),
    });
    return true;
  }

  if (!homeSyncWouldChangeBootstrap(cache, payload)) {
    logHomeSyncIdenticalSkip("apply_noop_against_bootstrap", {
      incoming_rooms: (payload.chats?.length ?? 0) + (payload.groups?.length ?? 0),
      cache_rooms: (cache.chats?.length ?? 0) + (cache.groups?.length ?? 0),
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
    deferredHomeSyncQueue[deferredHomeSyncQueue.length - 1] = coalesceDeferredHomeSyncPayload(last, payload);
  } else {
    deferredHomeSyncQueue.push(payload);
  }
  return true;
}

function flushDeferredHomeSyncPatches(): void {
  if (!deferredApplyRunner || deferredHomeSyncQueue.length === 0) return;
  const merged = mergeDeferredHomeSyncQueue(deferredHomeSyncQueue);
  deferredHomeSyncQueue.length = 0;
  /** skip 판정은 runner(`applyHomeSyncPayload`)에서 React state 기준으로 수행 */
  deferredApplyRunner(merged);
}

/** lite merge 완료 전 silent refresh·discoverable follow-up 을 지연할 때 */
export function shouldDeferPostLiteFollowUp(): boolean {
  return liteMergeActive || !liteMergeComplete;
}

export function markLiteMergeFollowUpsUnblocked(): void {
  liteMergeComplete = true;
}

/** Vitest — 프로덕션에서 호출하지 않는다 */
export function resetLiteMergeGateStateForTests(): void {
  liteMergeActive = false;
  liteMergeComplete = true;
  hydrationOverlap = false;
  deferredHomeSyncQueue.length = 0;
  deferredApplyRunner = null;
  lastFlushedHomeSyncFingerprint = "";
  homeRefreshRoundActive = false;
  homeRefreshRoundPendingSilent = null;
  lastVisibilityRestoredAt = 0;
}
