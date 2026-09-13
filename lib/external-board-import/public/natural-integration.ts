/**
 * Public natural integration (P) — Owner FINAL.
 * Technical origin must not create a separate customer-facing product type.
 * It does NOT mean hide legally/operationally required attribution.
 */

export const EXTERNAL_BOARD_PUBLIC_INTEGRATION = {
  feedPath: "/philife",
  detailPathPattern: "/philife/[postId]",
  originRankingFactor: 0,
  separateFeedLaneAllowed: false,
  separateDetailRendererAllowed: false,
  separateRankingAllowed: false,
  /** Technical labels forbidden on Public */
  forbiddenPublicLabels: [
    "크롤링 글",
    "Imported",
    "External post",
    "외부 수집 게시글",
    "crawler badge",
  ] as const,
  /**
   * Attribution visibility authority = explicit rights/attribution policy metadata.
   * NOT origin_kind === 'imported'.
   */
  attributionAuthority: "explicit_policy_metadata" as const,
  /**
   * Peer CTA authority = real member target capability.
   * NOT origin_kind product branch.
   */
  peerCtaAuthority: "member_capability" as const,
} as const;

export function assertNoCustomerFacingOriginUi(flags: {
  showsTechnicalImportLabel?: boolean;
  usesSeparateFeedLane?: boolean;
  usesSeparateDetailRenderer?: boolean;
  appliesOriginRankingBoost?: boolean;
  gatesAttributionByOriginKind?: boolean;
  gatesPeerCtaByOriginKind?: boolean;
}): { ok: true } | { ok: false; violations: string[] } {
  const violations: string[] = [];
  if (flags.showsTechnicalImportLabel) violations.push("technical_import_label");
  if (flags.usesSeparateFeedLane) violations.push("separate_feed_lane");
  if (flags.usesSeparateDetailRenderer) violations.push("separate_detail_renderer");
  if (flags.appliesOriginRankingBoost) violations.push("origin_ranking_boost");
  if (flags.gatesAttributionByOriginKind) violations.push("attribution_gated_by_origin_kind");
  if (flags.gatesPeerCtaByOriginKind) violations.push("peer_cta_gated_by_origin_kind");
  return violations.length ? { ok: false, violations } : { ok: true };
}
