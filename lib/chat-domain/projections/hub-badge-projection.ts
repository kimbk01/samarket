/**
 * Phase H extension — BottomNav Hub badge single writer (slice-1 cutover).
 * Product mutations funnel through applyHubBadgeProjection → registered store sink.
 * DO NOT: delete R2 poll yet (measurement required) · Native Call · 7/14 trash.
 */

import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import type {
  HubBadgeProjectionSourceKind,
  SurfaceProjectionApplyResult,
} from "@/lib/chat-domain/projections/surface-projection-types";

export type HubBadgeProjectionSnapshot = {
  breakdown: OwnerHubBadgeBreakdown;
  versionMs: number;
  source: HubBadgeProjectionSourceKind;
  /** Convenience mirror of breakdown.total for readers. */
  totalUnread: number;
  /** Optional 4-domain split — fail-closed omit when unknown. */
  byDomain?: Partial<
    Record<"general_direct" | "group" | "trade" | "store_order", number>
  >;
};

let lastHub: HubBadgeProjectionSnapshot | null = null;

type HubBadgeProjectionSink = (snapshot: HubBadgeProjectionSnapshot) => void;

let sink: HubBadgeProjectionSink | null = null;

/** Store registers once at module load — avoids circular import. */
export function registerHubBadgeProjectionSink(next: HubBadgeProjectionSink): void {
  sink = next;
}

/** Read-only last apply (projection layer). UI still reads owner-hub-badge-store. */
export function getHubBadgeProjection(): HubBadgeProjectionSnapshot | null {
  return lastHub;
}

/**
 * Sole Hub writer entry. Sources (fetch/poll/optimistic/broadcast/cache) must call this;
 * the registered sink mutates owner-hub-badge-store.
 */
export function applyHubBadgeProjection(
  snapshot: HubBadgeProjectionSnapshot,
): SurfaceProjectionApplyResult {
  lastHub = snapshot;
  sink?.(snapshot);
  return { status: "ok" };
}

/** @internal vitest — set last without requiring sink. */
export function __applyHubBadgeProjectionForTests(snapshot: HubBadgeProjectionSnapshot): void {
  lastHub = snapshot;
}

/** @internal vitest */
export function __resetHubBadgeProjectionForTest(): void {
  lastHub = null;
}
