"use client";

import type { CmBootstrapTier } from "@/lib/community-messenger/room/cm-bootstrap-orchestration";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { CM_BOOTSTRAP_SNAPSHOT_REUSE_TTL_MS } from "@/lib/community-messenger/room/cm-bootstrap-constants";
import {
  getRoomSnapshotCacheAgeMs,
  isRoomSnapshotFreshWithin,
} from "@/lib/community-messenger/room-snapshot-cache";
import { cmMessengerPerfVerboseLog } from "@/lib/community-messenger/room/cm-messenger-perf-verbose-log";

export const CM_FOREGROUND_BOOTSTRAP_REUSE_MS = CM_BOOTSTRAP_SNAPSHOT_REUSE_TTL_MS;

export type CmForegroundBootstrapSource = "room_client_block" | "room_client_legacy";

export type CmForegroundBootstrapDecision =
  | {
      action: "proceed";
      reqSrc: CmForegroundBootstrapSource;
      tier: "critical_block" | "instant_legacy";
      reason: string;
    }
  | {
      action: "skip";
      reason: string;
      reuseSnapshot: CommunityMessengerRoomSnapshot | null;
      decision: "reuse_snapshot";
      skip_fetch: true;
    };

type RoomForegroundLockState = {
  inflight: boolean;
  inflightReqSrc: CmForegroundBootstrapSource | null;
  lastSuccessAt: number;
  lastSnapshot: CommunityMessengerRoomSnapshot | null;
  lastTier: CmBootstrapTier | null;
  lastSource: CmForegroundBootstrapSource | null;
  blockSucceededAt: number | null;
  lastFailureAt: number | null;
  lastSilentSuccessAt: number;
};

const stateByRoom = new Map<string, RoomForegroundLockState>();

function roomState(roomId: string): RoomForegroundLockState {
  const id = roomId.trim();
  let st = stateByRoom.get(id);
  if (!st) {
    st = {
      inflight: false,
      inflightReqSrc: null,
      lastSuccessAt: 0,
      lastSnapshot: null,
      lastTier: null,
      lastSource: null,
      blockSucceededAt: null,
      lastFailureAt: null,
      lastSilentSuccessAt: 0,
    };
    stateByRoom.set(id, st);
  }
  return st;
}

function snapshotMatchesRoom(snap: CommunityMessengerRoomSnapshot | null, roomId: string): boolean {
  const id = roomId.trim();
  if (!id || !snap?.room?.id) return false;
  return snap.room.id.trim() === id;
}

export function clearCmRoomForegroundBootstrapLock(roomId: string): void {
  const id = roomId.trim();
  if (id) stateByRoom.delete(id);
}

export function isHardForegroundRefresh(input: {
  triggerReason?: string | null;
  forceSilentNetwork?: boolean;
  peekSnapshot?: CommunityMessengerRoomSnapshot | null;
  explicitHardRefresh?: boolean;
}): boolean {
  if (input.explicitHardRefresh || input.forceSilentNetwork) return true;
  const snap = input.peekSnapshot;
  if (snap?.clientShellPlaceholder) return true;
  const r = String(input.triggerReason ?? "")
    .trim()
    .toLowerCase();
  if (!r) return false;
  if (
    r.includes("hard_refresh") ||
    r.includes("force_network") ||
    r.includes("debounced_retry") ||
    r.includes("bootstrap_error") ||
    r.includes("empty_timeline_recover") ||
    r.includes("read_patch_force")
  ) {
    return true;
  }
  return false;
}

export type ForegroundReentryReuse = {
  snap: CommunityMessengerRoomSnapshot;
  snapshotAgeMs: number;
  source: "lock" | "cache";
};

/** lock 또는 room snapshot cache(5s) 기준 재진입 reuse 후보 */
export function resolveForegroundReentryReuse(input: {
  roomId: string;
  viewerUserId?: string | null;
  peekSnapshot?: CommunityMessengerRoomSnapshot | null;
}): ForegroundReentryReuse | null {
  const id = input.roomId.trim();
  if (!id) return null;
  const st = roomState(id);
  const now = Date.now();

  if (st.lastSnapshot && st.lastSuccessAt > 0 && snapshotMatchesRoom(st.lastSnapshot, id)) {
    const ageMs = now - st.lastSuccessAt;
    if (ageMs <= CM_FOREGROUND_BOOTSTRAP_REUSE_MS) {
      return { snap: st.lastSnapshot, snapshotAgeMs: ageMs, source: "lock" };
    }
  }

  const peek = input.peekSnapshot ?? null;
  if (!peek || !snapshotMatchesRoom(peek, id)) return null;
  const cacheAgeMs = getRoomSnapshotCacheAgeMs(id, input.viewerUserId);
  if (cacheAgeMs == null || cacheAgeMs > CM_FOREGROUND_BOOTSTRAP_REUSE_MS) return null;
  if (
    !isRoomSnapshotFreshWithin(id, CM_FOREGROUND_BOOTSTRAP_REUSE_MS, input.viewerUserId ?? null)
  ) {
    return null;
  }
  return { snap: peek, snapshotAgeMs: cacheAgeMs, source: "cache" };
}

export function wasRoomForegroundBootstrapRecentlySuccessful(
  roomId: string,
  viewerUserId?: string | null
): boolean {
  return resolveForegroundReentryReuse({ roomId, viewerUserId }) != null;
}

function logCmRoomBootstrapLock(payload: {
  roomId: string;
  requestedTier: CmBootstrapTier | "silent" | "unknown";
  requestedSource: string;
  decision: "proceed" | "reuse_snapshot";
  reason: string;
  inflight: boolean;
  last_success_age_ms: number | null;
  has_cached_snapshot: boolean;
  reuse_snapshot: boolean;
  skip_fetch: boolean;
  lifecycle_force_block: boolean;
  hard_refresh: boolean;
}): void {
  cmMessengerPerfVerboseLog("[cm-room-bootstrap-lock]", payload);
}

export function logCmRoomReentryZeroFetch(payload: {
  roomId: string;
  used_cached_snapshot: boolean;
  foreground_fetch_skipped: boolean;
  silent_fetch_scheduled: boolean;
  silent_fetch_skipped: boolean;
  snapshot_age_ms: number | null;
}): void {
  cmMessengerPerfVerboseLog("[cm-room-reentry-zero-fetch]", payload);
}

export function logCmPrefetchSkip(payload: { roomId: string; reason: string }): void {
  cmMessengerPerfVerboseLog("[cm-prefetch-skip]", payload);
}

export function logCmLegacyBootstrapSkip(payload: {
  roomId: string;
  reason: string;
  block_success_age_ms: number | null;
  has_local_snapshot: boolean;
  has_prefetch_snapshot: boolean;
}): void {
  cmMessengerPerfVerboseLog("[cm-legacy-bootstrap-skip]", payload);
}

export function evaluateCmRoomForegroundBootstrap(input: {
  roomId: string;
  triggerReason?: string | null;
  forceBlock?: boolean;
  requestedLegacy?: boolean;
  hasLocalSnapshot: boolean;
  hasPrefetchSnapshot: boolean;
  peekSnapshot: CommunityMessengerRoomSnapshot | null;
  hardRefresh?: boolean;
  viewerUserId?: string | null;
}): CmForegroundBootstrapDecision {
  const id = input.roomId.trim();
  const st = roomState(id);
  const now = Date.now();
  const lifecycleForceBlock = input.forceBlock === true;
  const hardRefresh = input.hardRefresh === true;
  const lastSuccessAgeMs = st.lastSuccessAt > 0 ? now - st.lastSuccessAt : null;
  const blockSuccessAgeMs =
    st.blockSucceededAt != null && st.blockSucceededAt > 0 ? now - st.blockSucceededAt : null;

  const requestedSource: string = lifecycleForceBlock
    ? "room_client_block"
    : input.requestedLegacy
      ? "room_client_legacy"
      : "room_client_block";
  const requestedTier: CmBootstrapTier = lifecycleForceBlock ? "critical_block" : "instant_legacy";

  const hasCachedSnapshot = input.hasPrefetchSnapshot || Boolean(input.peekSnapshot);

  const logSkip = (
    reason: string,
    reuse: CommunityMessengerRoomSnapshot | null,
    snapshotAgeMs: number | null
  ): CmForegroundBootstrapDecision => {
    logCmRoomBootstrapLock({
      roomId: id,
      requestedTier,
      requestedSource,
      decision: "reuse_snapshot",
      reason,
      inflight: st.inflight,
      last_success_age_ms: snapshotAgeMs ?? lastSuccessAgeMs,
      has_cached_snapshot: hasCachedSnapshot,
      reuse_snapshot: Boolean(reuse),
      skip_fetch: true,
      lifecycle_force_block: lifecycleForceBlock,
      hard_refresh: hardRefresh,
    });
    if (input.requestedLegacy || (!lifecycleForceBlock && requestedSource === "room_client_legacy")) {
      logCmLegacyBootstrapSkip({
        roomId: id,
        reason,
        block_success_age_ms: blockSuccessAgeMs,
        has_local_snapshot: input.hasLocalSnapshot,
        has_prefetch_snapshot: input.hasPrefetchSnapshot,
      });
    }
    return {
      action: "skip",
      reason,
      reuseSnapshot: reuse,
      decision: "reuse_snapshot",
      skip_fetch: true,
    };
  };

  if (!hardRefresh) {
    const reentry = resolveForegroundReentryReuse({
      roomId: id,
      viewerUserId: input.viewerUserId,
      peekSnapshot: input.peekSnapshot,
    });
    if (reentry) {
      return logSkip("foreground_recent_success_reuse", reentry.snap, reentry.snapshotAgeMs);
    }
  }

  if (st.inflight) {
    const reuse = st.lastSnapshot ?? input.peekSnapshot;
    return logSkip("foreground_inflight", reuse, lastSuccessAgeMs);
  }

  if (input.hasLocalSnapshot || input.hasPrefetchSnapshot) {
    const reuse = input.peekSnapshot ?? st.lastSnapshot;
    if (reuse && !hardRefresh && snapshotMatchesRoom(reuse, id)) {
      const cacheAge = getRoomSnapshotCacheAgeMs(id, input.viewerUserId ?? null);
      if (cacheAge != null && cacheAge <= CM_FOREGROUND_BOOTSTRAP_REUSE_MS) {
        return logSkip("local_or_prefetch_snapshot_sufficient", reuse, cacheAge);
      }
    }
  }

  const wantsLegacy = input.requestedLegacy && !lifecycleForceBlock;
  if (wantsLegacy) {
    const blockRecent =
      blockSuccessAgeMs != null && blockSuccessAgeMs < CM_FOREGROUND_BOOTSTRAP_REUSE_MS;
    const blockFailedRecently =
      st.lastFailureAt != null && now - st.lastFailureAt < CM_FOREGROUND_BOOTSTRAP_REUSE_MS;
    const noSnapshot = !input.peekSnapshot && !st.lastSnapshot && !input.hasLocalSnapshot;
    const ttlExpired =
      lastSuccessAgeMs == null || lastSuccessAgeMs >= CM_FOREGROUND_BOOTSTRAP_REUSE_MS;

    if (blockRecent) {
      return logSkip("legacy_forbidden_after_block_success", st.lastSnapshot ?? input.peekSnapshot, blockSuccessAgeMs);
    }
    if (!blockFailedRecently && !noSnapshot && !ttlExpired) {
      return logSkip(
        "legacy_not_allowed_without_block_failure",
        st.lastSnapshot ?? input.peekSnapshot,
        lastSuccessAgeMs
      );
    }

    logCmRoomBootstrapLock({
      roomId: id,
      requestedTier: "instant_legacy",
      requestedSource: "room_client_legacy",
      decision: "proceed",
      reason: "legacy_fallback_allowed",
      inflight: false,
      last_success_age_ms: lastSuccessAgeMs,
      has_cached_snapshot: hasCachedSnapshot,
      reuse_snapshot: false,
      skip_fetch: false,
      lifecycle_force_block: false,
      hard_refresh: hardRefresh,
    });
    return { action: "proceed", reqSrc: "room_client_legacy", tier: "instant_legacy", reason: "legacy_fallback_allowed" };
  }

  logCmRoomBootstrapLock({
    roomId: id,
    requestedTier: "critical_block",
    requestedSource: "room_client_block",
    decision: "proceed",
    reason: lifecycleForceBlock ? "lifecycle_force_block" : "foreground_block_single_owner",
    inflight: false,
    last_success_age_ms: lastSuccessAgeMs,
    has_cached_snapshot: hasCachedSnapshot,
    reuse_snapshot: false,
    skip_fetch: false,
    lifecycle_force_block: lifecycleForceBlock,
    hard_refresh: hardRefresh,
  });
  return {
    action: "proceed",
    reqSrc: "room_client_block",
    tier: "critical_block",
    reason: lifecycleForceBlock ? "lifecycle_force_block" : "foreground_block_single_owner",
  };
}

export function shouldSkipSilentBootstrap(roomId: string, forceNetwork: boolean): {
  skip: boolean;
  snapshotAgeMs: number | null;
} {
  if (forceNetwork) return { skip: false, snapshotAgeMs: null };
  const st = roomState(roomId);
  if (st.lastSilentSuccessAt <= 0) return { skip: false, snapshotAgeMs: null };
  const ageMs = Date.now() - st.lastSilentSuccessAt;
  if (ageMs < CM_FOREGROUND_BOOTSTRAP_REUSE_MS) {
    return { skip: true, snapshotAgeMs: ageMs };
  }
  return { skip: false, snapshotAgeMs: null };
}

export function markCmRoomForegroundBootstrapInflight(
  roomId: string,
  reqSrc: CmForegroundBootstrapSource
): void {
  const st = roomState(roomId);
  st.inflight = true;
  st.inflightReqSrc = reqSrc;
}

export function markCmRoomForegroundBootstrapSuccess(args: {
  roomId: string;
  snap: CommunityMessengerRoomSnapshot;
  tier: CmBootstrapTier;
  reqSrc: CmForegroundBootstrapSource;
}): void {
  const st = roomState(args.roomId);
  const now = Date.now();
  st.inflight = false;
  st.inflightReqSrc = null;
  st.lastSuccessAt = now;
  st.lastSnapshot = args.snap;
  st.lastTier = args.tier;
  st.lastSource = args.reqSrc;
  if (args.reqSrc === "room_client_block") {
    st.blockSucceededAt = now;
  }
}

export function markCmRoomSilentBootstrapSuccess(roomId: string): void {
  roomState(roomId).lastSilentSuccessAt = Date.now();
}

export function markCmRoomForegroundBootstrapFailure(roomId: string, reqSrc: CmForegroundBootstrapSource): void {
  const st = roomState(roomId);
  st.inflight = false;
  st.inflightReqSrc = null;
  st.lastFailureAt = Date.now();
  if (reqSrc === "room_client_block") {
    st.blockSucceededAt = null;
  }
}

export function releaseCmRoomForegroundBootstrapInflight(roomId: string): void {
  const st = roomState(roomId);
  st.inflight = false;
  st.inflightReqSrc = null;
}

export function touchCmRoomForegroundLockFromSnapshot(roomId: string, snap: CommunityMessengerRoomSnapshot): void {
  const id = roomId.trim();
  if (!id || !snapshotMatchesRoom(snap, id)) return;
  const st = roomState(id);
  const now = Date.now();
  st.lastSuccessAt = now;
  st.lastSnapshot = snap;
  st.lastSource = "room_client_block";
  st.lastTier = "critical_block";
  st.blockSucceededAt = now;
}
