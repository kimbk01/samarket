/**
 * Phase H — BottomNav Hub badge — single writer contract.
 * Target path from Phase B freeze. Not wired to owner-hub-badge-store yet.
 */

import {
  SURFACE_PROJECTION_NOT_WIRED,
  type BadgeProjectionSnapshot,
  type SurfaceProjectionApplyResult,
} from "@/lib/chat-domain/projections/surface-projection-types";

let lastHub: BadgeProjectionSnapshot | null = null;

/** Read-only — product may subscribe later; until wire, returns last apply or null. */
export function getHubBadgeProjection(): BadgeProjectionSnapshot | null {
  return lastHub;
}

/**
 * Sole Hub writer entry (contract). Cutover: replace optimistic/poll/fetch multi-writes
 * with this apply only. Phase H returns not_wired so legacy store stays authority.
 */
export function applyHubBadgeProjection(
  _snapshot: BadgeProjectionSnapshot,
): SurfaceProjectionApplyResult {
  return { status: "not_wired", error: SURFACE_PROJECTION_NOT_WIRED };
}

/** Test / future cutover helper — not called from product in Phase H. */
export function __applyHubBadgeProjectionForTests(snapshot: BadgeProjectionSnapshot): void {
  lastHub = snapshot;
}
