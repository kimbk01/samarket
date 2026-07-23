/**
 * Freeze TARGET paths — Phase H files must exist (writers not_wired until cutover).
 * Re-export for file-lock / docs.
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

/** Quarantine candidates — call-site removal in Phase J after cutover proof (do not delete now). */
export const PHASE_H_QUARANTINE_CANDIDATES = [
  { id: "R1", symbol: "applyCommunityMessengerUnreadOptimistic" },
  { id: "R2", symbol: "OWNER_HUB_BADGE_POLL_MS hub surface write" },
  { id: "R3", symbol: "App Icon 45s poll + hub resync cross-write" },
  { id: "R4", symbol: "Bell adminNotice supplement parallel write" },
] as const;
