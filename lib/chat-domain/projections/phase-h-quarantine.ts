/**
 * Freeze TARGET paths — Phase H files must exist.
 * Hub + Domain list + Bell/AppIcon slice-1: apply* wired (ok).
 * Phase J1: R1 symbol deleted; R4 adminNotice parallel file deleted (Bell projection path kept).
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

/** Quarantine registry — deleted symbols must stay banned via verify:badge-import-ban. */
export const PHASE_H_QUARANTINE_CANDIDATES = [
  { id: "R1", symbol: "applyCommunityMessengerUnreadOptimistic", status: "deleted" },
  { id: "R2", symbol: "OWNER_HUB_BADGE_POLL_MS hub surface write", status: "keep" },
  { id: "R3", symbol: "App Icon 45s poll (Bell network source)", status: "keep" },
  {
    id: "R4",
    symbol: "tier1-admin-notice-bell-supplement (parallel re-add)",
    status: "deleted",
  },
] as const;
