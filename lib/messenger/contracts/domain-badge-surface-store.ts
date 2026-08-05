/**
 * Client Domain Badge surface store — App Icon runtime authority only.
 * Written only via Domain Badge Authority complete snapshot (single atomic publish).
 *
 * LOCK (2026-07-31 Phase 3-1):
 * - DO NOT publish shell and missedCall in separate emits (intermediate appIconTotal banned).
 * - Product path: publishDomainAppIconCompleteSnapshot only.
 * - Stale authEpoch / older async completion must not commit.
 */
"use client";

import {
  resolveDomainAppIconBadgeCount,
  resolveDomainAppIconBadgeParts,
  type DomainAppIconBadgeParts,
} from "@/lib/notifications/domain-app-icon-badge";

export type DomainBadgeSurfaceSnapshot = Readonly<{
  messenger: number;
  trade: number;
  storeOrder: number;
  missedCall: number;
  appIconTotal: number;
  generation: number;
  authority: "domain_badge";
  authEpoch: number;
}>;

const EMPTY: DomainBadgeSurfaceSnapshot = {
  messenger: 0,
  trade: 0,
  storeOrder: 0,
  missedCall: 0,
  appIconTotal: 0,
  generation: 0,
  authority: "domain_badge",
  authEpoch: 0,
};

let snapshot: DomainBadgeSurfaceSnapshot = EMPTY;
/** Bumped on logout / auth wipe — late async complete must not restore badge. */
let authEpoch = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Instrumentation — gated; counts only. Pair with NativeBadgeSync native_set. */
function badgeSurfaceProbe(event: string, payload: Record<string, unknown>): void {
  if (typeof process === "undefined") return;
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_CM_READ_BADGE_DEBUG !== "1") return;
  // eslint-disable-next-line no-console
  console.info("[badge-disconnect-probe]", event, payload);
}

function rebuild(parts: DomainAppIconBadgeParts, generation: number): DomainBadgeSurfaceSnapshot {
  return {
    ...parts,
    appIconTotal: resolveDomainAppIconBadgeCount(parts),
    generation,
    authority: "domain_badge",
    authEpoch,
  };
}

export type DomainAppIconCompletePublishInput = Readonly<{
  communityMessengerUnread: number;
  tradeUnread: number;
  storeOrderChatUnread: number;
  missedCall: number;
  /** Auth epoch captured when apply was scheduled; reject if logout happened since. */
  authEpochAtSchedule?: number;
  /**
   * Optional monotonic facts version from server (`projectionVersionMs`).
   * Reject when older than last committed factsVersion.
   */
  projectionFactsVersion?: number;
}>;

export type DomainAppIconCompletePublishResult = Readonly<{
  committed: boolean;
  reason?:
    | "unchanged"
    | "stale_auth_epoch"
    | "stale_facts_version"
    | "applied";
  appIconTotal: number;
  generation: number;
}>;

let lastFactsVersion = 0;

/**
 * THE App Icon surface commit — all four axes in one generation / one emit.
 */
export function publishDomainAppIconCompleteSnapshot(
  input: DomainAppIconCompletePublishInput
): DomainAppIconCompletePublishResult {
  if (input.authEpochAtSchedule != null && input.authEpochAtSchedule !== authEpoch) {
    badgeSurfaceProbe("b_surface_complete_rejected_auth_epoch", {
      scheduled: input.authEpochAtSchedule,
      current: authEpoch,
    });
    return {
      committed: false,
      reason: "stale_auth_epoch",
      appIconTotal: snapshot.appIconTotal,
      generation: snapshot.generation,
    };
  }

  const factsVersion = Math.max(0, Math.floor(Number(input.projectionFactsVersion) || 0));
  if (factsVersion > 0 && factsVersion < lastFactsVersion) {
    badgeSurfaceProbe("b_surface_complete_rejected_stale_facts", {
      incoming: factsVersion,
      last: lastFactsVersion,
    });
    return {
      committed: false,
      reason: "stale_facts_version",
      appIconTotal: snapshot.appIconTotal,
      generation: snapshot.generation,
    };
  }

  const parts = resolveDomainAppIconBadgeParts({
    communityMessengerUnread: input.communityMessengerUnread,
    tradeUnread: input.tradeUnread,
    storeOrderChatUnread: input.storeOrderChatUnread,
    missedCall: input.missedCall,
  });
  const nextTotal = resolveDomainAppIconBadgeCount(parts);
  const firstHydrate = snapshot.generation === 0;
  if (
    !firstHydrate &&
    parts.messenger === snapshot.messenger &&
    parts.trade === snapshot.trade &&
    parts.storeOrder === snapshot.storeOrder &&
    parts.missedCall === snapshot.missedCall &&
    nextTotal === snapshot.appIconTotal
  ) {
    if (factsVersion > lastFactsVersion) lastFactsVersion = factsVersion;
    badgeSurfaceProbe("b_surface_complete_skipped_unchanged", {
      appIconTotal: nextTotal,
      generation: snapshot.generation,
    });
    return {
      committed: false,
      reason: "unchanged",
      appIconTotal: snapshot.appIconTotal,
      generation: snapshot.generation,
    };
  }

  snapshot = rebuild(parts, snapshot.generation + 1);
  if (factsVersion > lastFactsVersion) lastFactsVersion = factsVersion;
  badgeSurfaceProbe("b_surface_complete_applied", {
    messenger: snapshot.messenger,
    trade: snapshot.trade,
    storeOrder: snapshot.storeOrder,
    missedCall: snapshot.missedCall,
    appIconTotal: snapshot.appIconTotal,
    generation: snapshot.generation,
    authEpoch: snapshot.authEpoch,
    factsVersion: lastFactsVersion,
  });
  emit();
  return {
    committed: true,
    reason: "applied",
    appIconTotal: snapshot.appIconTotal,
    generation: snapshot.generation,
  };
}

/**
 * @deprecated Split shell publish — routes to complete with **current** missedCall only.
 * Product Apply must use publishDomainAppIconCompleteSnapshot with all axes.
 */
export function publishDomainBadgeShellToSurfaceStore(input: {
  communityMessengerUnread: number;
  tradeUnread: number;
  storeOrderChatUnread: number;
}): void {
  publishDomainAppIconCompleteSnapshot({
    ...input,
    missedCall: snapshot.missedCall,
  });
}

/**
 * @deprecated Split missedCall publish — routes to complete with **current** shell axes.
 * Product Apply must use publishDomainAppIconCompleteSnapshot with all axes.
 */
export function publishMissedCallToDomainBadgeSurface(missedCall: number): void {
  publishDomainAppIconCompleteSnapshot({
    communityMessengerUnread: snapshot.messenger,
    tradeUnread: snapshot.trade,
    storeOrderChatUnread: snapshot.storeOrder,
    missedCall,
  });
}

export function getDomainBadgeSurfaceSnapshot(): DomainBadgeSurfaceSnapshot {
  return snapshot;
}

export function getDomainBadgeSurfaceAuthEpoch(): number {
  return authEpoch;
}

export function getDomainBadgeSurfaceServerSnapshot(): DomainBadgeSurfaceSnapshot {
  return { ...EMPTY, authEpoch };
}

/**
 * Logout / auth wipe — clear App Icon surface and invalidate in-flight completes.
 */
export function resetDomainBadgeSurfaceForAuthEpoch(): void {
  authEpoch += 1;
  lastFactsVersion = 0;
  snapshot = { ...EMPTY, authEpoch, generation: 0 };
  badgeSurfaceProbe("b_surface_auth_epoch_reset", { authEpoch });
  emit();
}

export function subscribeDomainBadgeSurface(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Test helper */
export function __resetDomainBadgeSurfaceStoreForTests(): void {
  authEpoch = 0;
  lastFactsVersion = 0;
  snapshot = EMPTY;
  listeners.clear();
}
