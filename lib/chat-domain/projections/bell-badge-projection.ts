/**
 * Phase H extension — Bell badge single writer (slice-1 cutover).
 * Product mutations funnel through applyBellBadgeProjection → registered store sink.
 * DO NOT: delete R4 adminNotice/poll yet · Domain list · Native Call · 7/14 trash.
 */

import type { NotificationBadgeCount } from "@/lib/notifications/core/notification-event-types";
import type { SurfaceProjectionApplyResult } from "@/lib/chat-domain/projections/surface-projection-types";

export type BellBadgeProjectionSourceKind =
  | "network"
  | "read_patch"
  | "optimistic_admin"
  | "clear";

export type BellBadgeProjectionSnapshot = {
  breakdown: NotificationBadgeCount;
  versionMs: number;
  source: BellBadgeProjectionSourceKind;
  totalUnread: number;
};

let lastBell: BellBadgeProjectionSnapshot | null = null;

type BellBadgeProjectionSink = (snapshot: BellBadgeProjectionSnapshot) => void;

let sink: BellBadgeProjectionSink | null = null;

export function registerBellBadgeProjectionSink(next: BellBadgeProjectionSink): void {
  sink = next;
}

export function getBellBadgeProjection(): BellBadgeProjectionSnapshot | null {
  return lastBell;
}

export function applyBellBadgeProjection(
  snapshot: BellBadgeProjectionSnapshot,
): SurfaceProjectionApplyResult {
  lastBell = snapshot;
  sink?.(snapshot);
  return { status: "ok" };
}

/** @internal vitest */
export function __applyBellBadgeProjectionForTests(snapshot: BellBadgeProjectionSnapshot): void {
  lastBell = snapshot;
}

/** @internal vitest */
export function __resetBellBadgeProjectionForTest(): void {
  lastBell = null;
}
