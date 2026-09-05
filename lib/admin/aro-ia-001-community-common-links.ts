/**
 * ARO-IA-001 — Domain ↔ Common connection routes (Community starting evidence).
 * Navigation / labels only — no SSOT migration.
 */
export const ARO_IA_001_COMMUNITY_PROMOTIONS_PATH = "/admin/community/promotions" as const;
export const ARO_IA_001_COMMUNITY_POINT_POLICIES_PATH = "/admin/community/point-policies" as const;
export const ARO_IA_001_COMMUNITY_REPORTS_PATH = "/admin/community/reports" as const;
export const ARO_IA_001_MEETING_REPORTS_PATH = "/admin/philife/meeting-reports" as const;

/** Common Ads Control Plane hub (not Community promotion writer). */
export const ARO_IA_001_ADS_HUB_PATH = "/admin/delivery-ads" as const;
/** Canonical Finance Point policy console. */
export const ARO_IA_001_FINANCE_POINT_POLICIES_PATH = "/admin/point-policies" as const;
/** Support Case inbox (≠ community_reports). */
export const ARO_IA_001_SUPPORT_PATH = "/admin/support" as const;

/** Canonical writers — must remain unchanged by ARO-IA-001. */
export const ARO_IA_001_OWNERS = {
  promotion: "point_promotion_orders",
  pointPolicy: "board_point_policies",
  report: "community_reports",
  meetingReport: "meeting_reports",
} as const;

export const ARO_IA_001_COMMUNITY_SECTION_KEYS = [
  "community-section-ops",
  "community-section-content",
  "community-section-moderation",
  "community-section-promo-point",
  "community-section-settings",
] as const;
