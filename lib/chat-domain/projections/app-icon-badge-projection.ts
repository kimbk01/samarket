/**
 * Phase H — App Icon badge — single writer contract.
 * Not wired to notification-unread-badge-store yet.
 */

import {
  SURFACE_PROJECTION_NOT_WIRED,
  type BadgeProjectionSnapshot,
  type SurfaceProjectionApplyResult,
} from "@/lib/chat-domain/projections/surface-projection-types";

let lastAppIcon: BadgeProjectionSnapshot | null = null;

export function getAppIconBadgeProjection(): BadgeProjectionSnapshot | null {
  return lastAppIcon;
}

export function applyAppIconBadgeProjection(
  _snapshot: BadgeProjectionSnapshot,
): SurfaceProjectionApplyResult {
  return { status: "not_wired", error: SURFACE_PROJECTION_NOT_WIRED };
}

export function __applyAppIconBadgeProjectionForTests(snapshot: BadgeProjectionSnapshot): void {
  lastAppIcon = snapshot;
}
