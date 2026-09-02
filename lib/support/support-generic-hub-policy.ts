/**
 * Generic customer-center / care-card entry surfaces.
 * These must NEVER invent category=OTHER without explicit 기타 selection.
 */

export const SUPPORT_GENERIC_HUB_SOURCE_SURFACES = [
  "mypage_customer_center",
  "owner_customer_center",
  "owner_care_card",
] as const;

export type SupportGenericHubSourceSurface =
  (typeof SUPPORT_GENERIC_HUB_SOURCE_SURFACES)[number];

const GENERIC_SET = new Set<string>(SUPPORT_GENERIC_HUB_SOURCE_SURFACES);

export function isSupportGenericHubSourceSurface(sourceSurface: string): boolean {
  return GENERIC_SET.has(sourceSurface.trim());
}

/**
 * Fail-closed: generic hub + OTHER requires explicitOtherSelection=true.
 * Contextual FAB callers (order, gift, …) are unaffected.
 */
export function assertSupportGenericHubCategoryPolicy(input: {
  sourceSurface: string;
  canonicalCategory: string;
  explicitOtherSelection?: boolean;
}): { ok: true } | { ok: false; error: "generic_other_forbidden" } {
  if (!isSupportGenericHubSourceSurface(input.sourceSurface)) {
    return { ok: true };
  }
  if (input.canonicalCategory !== "OTHER") {
    return { ok: true };
  }
  if (input.explicitOtherSelection === true) {
    return { ok: true };
  }
  return { ok: false, error: "generic_other_forbidden" };
}
