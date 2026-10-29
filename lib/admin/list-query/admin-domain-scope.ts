/**
 * G-06 — 도메인 업무 화면(배달·거래·커뮤니티)에서 공통 광고·프로모션 화면을 「그 도메인만」 걸러 여는 URL 키.
 * 같은 데이터·같은 화면 — 새 테이블 없음. Client-safe 순수 함수만.
 *
 * URL 키 `domain` — `ADMIN_LIST_QUERY_RESERVED_KEYS`(page·size·status·q·from·to·sort) 밖이므로
 * `useAdminListQuery` 의 `extras` 로 쓰면 쪽 이동·크기 변경 때 주소에 그대로 남는다.
 */

export const ADMIN_DOMAIN_SCOPE_QUERY_KEY = "domain" as const;

export const ADMIN_DOMAIN_SCOPES = ["delivery", "trade", "community"] as const;
export type AdminDomainScope = (typeof ADMIN_DOMAIN_SCOPES)[number];

/** 허용 밖 값·빈 값 → "" (전체). */
export function normalizeAdminDomainScope(raw: unknown): AdminDomainScope | "" {
  const v = String(raw ?? "").trim().toLowerCase();
  return (ADMIN_DOMAIN_SCOPES as readonly string[]).includes(v) ? (v as AdminDomainScope) : "";
}

export function adminDomainScopeLabel(scope: AdminDomainScope | "", ko: boolean): string {
  if (scope === "delivery") return ko ? "배달" : "Delivery";
  if (scope === "trade") return ko ? "거래" : "Trade";
  if (scope === "community") return ko ? "커뮤니티" : "Community";
  return ko ? "전체" : "All";
}

/**
 * 팝업·당겨서 새로고침 캠페인 노출 위치(`platform_popup_campaign_surfaces.surface`) 중 그 도메인에 뜨는 값.
 * GLOBAL(전체 노출)은 런타임에서 모든 도메인에 뜨므로(`platformPopupSurfaceMatches`) 포함한다 —
 * 화면에는 「전체 노출 포함」으로 명시한다.
 */
export function platformPopupSurfacesForDomainScope(scope: AdminDomainScope): readonly string[] {
  if (scope === "delivery") return ["DELIVERY", "DELIVERY_OWNER", "GLOBAL"];
  if (scope === "trade") return ["TRADE", "GLOBAL"];
  return ["COMMUNITY", "GLOBAL"];
}

/** 노출 위치 관리(`/admin/advertising/placements`) 섹션 — 도메인 지정 시 그 도메인 섹션 + 팝업 위치는 그 도메인 것만. */
export function placementSectionVisible(
  section: "community" | "trade" | "delivery" | "popup",
  scope: AdminDomainScope | ""
): boolean {
  if (!scope || section === "popup") return true;
  return section === scope;
}

/** 팝업 노출 위치 카드(`PopupSurfaceInventory.surfaceKey`)가 도메인 범위에 드는지. */
export function popupSurfaceInDomainScope(surfaceKey: string, scope: AdminDomainScope | ""): boolean {
  if (!scope) return true;
  return platformPopupSurfacesForDomainScope(scope).includes(surfaceKey);
}

/** `base` 쿼리에 도메인 키를 쓰거나(값 있음) 지운다(전체) — 다른 키는 유지. */
export function writeAdminDomainScope(base: URLSearchParams | string, scope: AdminDomainScope | ""): URLSearchParams {
  const out = new URLSearchParams(typeof base === "string" ? base : base.toString());
  if (scope) out.set(ADMIN_DOMAIN_SCOPE_QUERY_KEY, scope);
  else out.delete(ADMIN_DOMAIN_SCOPE_QUERY_KEY);
  return out;
}

/** 배너 현황(`/admin/advertising/banners`) 도메인 필터 값 — 행 `BannerOverviewRow.domain` 과 같은 값 (`common` = 내정보 배너). */
export const BANNER_OVERVIEW_DOMAIN_FILTERS = ["delivery", "trade", "community", "common"] as const;
export type BannerOverviewDomainFilter = (typeof BANNER_OVERVIEW_DOMAIN_FILTERS)[number];

/** 배너 현황 `?domain=` — 행 domain 과 정확히 같은 값만 (허용 밖·빈 값 = "all"). */
export function parseBannerOverviewDomain(raw: string | null | undefined): BannerOverviewDomainFilter | "all" {
  const v = String(raw ?? "").trim();
  return (BANNER_OVERVIEW_DOMAIN_FILTERS as readonly string[]).includes(v) ? (v as BannerOverviewDomainFilter) : "all";
}
