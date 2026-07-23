/**
 * Phase H — Surface projection contracts (1 writer per surface).
 * Hub + Domain list + Bell/AppIcon slice-1: apply* return ok when wired.
 * DO NOT: restore 7/14 Domain Authority trash · Native Call.
 * docs/community-messenger/2026-07-23-four-domain-phase-h.md
 */

export type SurfaceProjectionStatus = "not_wired" | "ok" | "error";

export type SurfaceProjectionApplyResult = {
  status: SurfaceProjectionStatus;
  /** When not_wired — product must keep legacy store until cutover. */
  error?: string;
};

export const SURFACE_PROJECTION_NOT_WIRED = "phase_h_surface_projection_not_wired" as const;

/** Shared thin badge shape (legacy helpers). Bell/AppIcon have typed snapshots in their modules. */
export type BadgeProjectionSnapshot = {
  totalUnread: number;
  /** Optional per-domain breakdown — fail-closed omit when unknown. */
  byDomain?: Partial<
    Record<"general_direct" | "group" | "trade" | "store_order", number>
  >;
  versionMs: number;
};

/** Hub apply source — matches owner-hub-badge-store apply kinds. */
export type HubBadgeProjectionSourceKind =
  | "network_fresh"
  | "network_plain"
  | "broadcast"
  | "client_cache"
  | "optimistic";
