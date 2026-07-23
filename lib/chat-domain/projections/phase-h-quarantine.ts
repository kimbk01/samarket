/**
 * Freeze TARGET paths — Phase H files must exist.
 * Hub slice-1: applyHubBadgeProjection wired; Bell/AppIcon/list stay not_wired until cutover.
 */

export const PHASE_H_PROJECTION_WRITER_PATHS = [
  "lib/chat-domain/projections/hub-badge-projection.ts",
  "lib/chat-domain/projections/bell-badge-projection.ts",
  "lib/chat-domain/projections/app-icon-badge-projection.ts",
  "lib/chat-domain/list/general-direct-list-writer.ts",
  "lib/chat-domain/list/group-list-writer.ts",
  "lib/chat-domain/list/trade-list-writer.ts",
  "lib/chat-domain/list/store-order-list-writer.ts",
] as const;

/** Quarantine candidates — R1 removed (callers=0); R2 keep; R3–R4 defer Bell/AppIcon. */
export const PHASE_H_QUARANTINE_CANDIDATES = [
  { id: "R1", symbol: "applyCommunityMessengerUnreadOptimistic", status: "removed_noop" },
  { id: "R2", symbol: "OWNER_HUB_BADGE_POLL_MS hub surface write", status: "keep" },
  { id: "R3", symbol: "App Icon 45s poll + hub resync cross-write", status: "defer" },
  { id: "R4", symbol: "Bell adminNotice supplement parallel write", status: "defer" },
] as const;
