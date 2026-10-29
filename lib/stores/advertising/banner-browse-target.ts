/**
 * B-01 — 업종 상단 배너 업종 대상 (store_banner_ad_campaigns.browse_primary_slug / browse_secondary_slug).
 * NULL = 전체 업종. 상위 노출(store_paid_ad_campaigns)과 같은 의미.
 */

export type BannerBrowseTarget = { primarySlug: string | null; secondarySlug: string | null };

function norm(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim().toLowerCase();
  return s && s !== "all" ? s : null;
}

export function parseBannerBrowseTarget(raw: {
  browse_primary_slug?: unknown;
  browse_secondary_slug?: unknown;
}): BannerBrowseTarget {
  const primarySlug = norm(raw.browse_primary_slug);
  return { primarySlug, secondarySlug: primarySlug ? norm(raw.browse_secondary_slug) : null };
}

/** 이 업종 페이지(primary, sub|null)에 이 배너가 나오는가. sub=null(전체) 페이지에는 2차 지정 배너가 나오지 않는다. */
export function bannerBrowseTargetMatchesPage(
  target: BannerBrowseTarget,
  page: { primarySlug: string; subSlug: string | null }
): boolean {
  if (!target.primarySlug) return true;
  if (target.primarySlug !== norm(page.primarySlug)) return false;
  if (!target.secondarySlug) return true;
  return target.secondarySlug === norm(page.subSlug);
}

/** 두 대상이 같은 업종 페이지에 함께 나올 수 있는가 — 수용량 점유 판정용. */
export function bannerBrowseTargetsOverlap(a: BannerBrowseTarget, b: BannerBrowseTarget): boolean {
  if (!a.primarySlug || !b.primarySlug) return true;
  if (a.primarySlug !== b.primarySlug) return false;
  if (!a.secondarySlug || !b.secondarySlug) return true;
  return a.secondarySlug === b.secondarySlug;
}
