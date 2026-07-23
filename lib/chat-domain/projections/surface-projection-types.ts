/**
 * Phase H — Surface projection contracts (1 writer per surface).
 * Product stores remain multi-writer until cutover; these modules are the SSOT apply API.
 * DO NOT: wire hub/bell/app-icon stores yet · delete REMOVE · Native Call.
 * docs/community-messenger/2026-07-23-four-domain-phase-h.md
 */

export type SurfaceProjectionStatus = "not_wired" | "ok" | "error";

export type SurfaceProjectionApplyResult = {
  status: SurfaceProjectionStatus;
  /** When not_wired — product must keep legacy store until cutover. */
  error?: string;
};

export const SURFACE_PROJECTION_NOT_WIRED = "phase_h_surface_projection_not_wired" as const;

export type BadgeProjectionSnapshot = {
  totalUnread: number;
  /** Optional per-domain breakdown — fail-closed omit when unknown. */
  byDomain?: Partial<
    Record<"general_direct" | "group" | "trade" | "store_order", number>
  >;
  versionMs: number;
};
