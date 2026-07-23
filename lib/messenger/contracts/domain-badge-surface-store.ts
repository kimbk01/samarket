/**
 * Client Domain Badge surface store — shared by Bottom Nav publish + App Icon.
 * Written only via Domain Badge Authority publish (single writer).
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
}>;

const EMPTY: DomainBadgeSurfaceSnapshot = {
  messenger: 0,
  trade: 0,
  storeOrder: 0,
  missedCall: 0,
  appIconTotal: 0,
  generation: 0,
  authority: "domain_badge",
};

let snapshot: DomainBadgeSurfaceSnapshot = EMPTY;
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
  };
}

/** Domain shell publish — updates messenger/trade/storeOrder; keeps missedCall. */
export function publishDomainBadgeShellToSurfaceStore(input: {
  communityMessengerUnread: number;
  tradeUnread: number;
  storeOrderChatUnread: number;
}): void {
  const parts = resolveDomainAppIconBadgeParts({
    ...input,
    missedCall: snapshot.missedCall,
  });
  const next = rebuild(parts, snapshot.generation + 1);
  if (
    next.messenger === snapshot.messenger &&
    next.trade === snapshot.trade &&
    next.storeOrder === snapshot.storeOrder &&
    next.appIconTotal === snapshot.appIconTotal
  ) {
    badgeSurfaceProbe("b_surface_publish_skipped_unchanged", {
      messenger: next.messenger,
      trade: next.trade,
      storeOrder: next.storeOrder,
      missedCall: snapshot.missedCall,
      appIconTotal: next.appIconTotal,
      generation: snapshot.generation,
    });
    return;
  }
  snapshot = next;
  badgeSurfaceProbe("b_surface_publish_applied", {
    messenger: snapshot.messenger,
    trade: snapshot.trade,
    storeOrder: snapshot.storeOrder,
    missedCall: snapshot.missedCall,
    appIconTotal: snapshot.appIconTotal,
    generation: snapshot.generation,
  });
  emit();
}

/** System orphan missedCall only — from badge-count poll / read patch. Room-attached excluded. */
export function publishMissedCallToDomainBadgeSurface(missedCall: number): void {
  const n = Math.max(0, Math.floor(Number(missedCall) || 0));
  if (n === snapshot.missedCall) return;
  snapshot = rebuild(
    {
      messenger: snapshot.messenger,
      trade: snapshot.trade,
      storeOrder: snapshot.storeOrder,
      missedCall: n,
    },
    snapshot.generation + 1
  );
  badgeSurfaceProbe("b_surface_missed_call_publish", {
    missedCall: snapshot.missedCall,
    appIconTotal: snapshot.appIconTotal,
    generation: snapshot.generation,
  });
  emit();
}

export function getDomainBadgeSurfaceSnapshot(): DomainBadgeSurfaceSnapshot {
  return snapshot;
}

export function getDomainBadgeSurfaceServerSnapshot(): DomainBadgeSurfaceSnapshot {
  return EMPTY;
}

export function subscribeDomainBadgeSurface(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Test helper */
export function __resetDomainBadgeSurfaceStoreForTests(): void {
  snapshot = EMPTY;
  listeners.clear();
}
