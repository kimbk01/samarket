/**
 * Phase H — Bell badge — single writer contract.
 * Not wired to notification-badge-count-store yet.
 */

import {
  SURFACE_PROJECTION_NOT_WIRED,
  type BadgeProjectionSnapshot,
  type SurfaceProjectionApplyResult,
} from "@/lib/chat-domain/projections/surface-projection-types";

let lastBell: BadgeProjectionSnapshot | null = null;

export function getBellBadgeProjection(): BadgeProjectionSnapshot | null {
  return lastBell;
}

export function applyBellBadgeProjection(
  _snapshot: BadgeProjectionSnapshot,
): SurfaceProjectionApplyResult {
  return { status: "not_wired", error: SURFACE_PROJECTION_NOT_WIRED };
}

export function __applyBellBadgeProjectionForTests(snapshot: BadgeProjectionSnapshot): void {
  lastBell = snapshot;
}
