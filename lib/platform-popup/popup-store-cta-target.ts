/**
 * ADC-01 — 매장 CTA 는 매장 상세 라우트(`/stores/{slug}`)와 같은 키(slug)로 저장·서빙한다.
 * 매장 상세는 slug 로만 조회(`get-approved-store-by-slug.ts`)하므로 `/stores/{uuid}` 는 404.
 *
 * - 오너 신청 writer: 매장 UUID 로 들어온 CTA 를 그 매장의 slug 로 바꿔 저장.
 * - 서빙(load-popup-candidates): 기존 행(UUID 저장)을 slug 로 해석해 같은 CTA 로 노출.
 *
 * 순수 함수만 둔다(DB 조회는 호출자).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `/stores/{segment}` + 나머지(`#menu` · `?tab=promo` 등) */
const STORE_PATH_RE = /^\/stores\/([^/?#]+)(.*)$/;

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function isPopupStoreUuid(value: string | null | undefined): boolean {
  return UUID_RE.test(String(value ?? "").trim());
}

/**
 * 매장 CTA 가 매장 UUID 를 가리키면 그 UUID(소문자), 아니면 null.
 * `store` 유형은 target 자체, `internal_page` 는 `/stores/{uuid}…` 경로의 첫 세그먼트.
 */
export function popupStoreCtaLegacyStoreId(input: {
  ctaType: string | null | undefined;
  ctaTarget: string | null | undefined;
}): string | null {
  const type = String(input.ctaType ?? "").trim().toLowerCase();
  const target = String(input.ctaTarget ?? "").trim();
  if (!target) return null;
  if (type === "store") {
    return isPopupStoreUuid(target) ? target.toLowerCase() : null;
  }
  if (type === "internal_page") {
    const m = STORE_PATH_RE.exec(target);
    if (!m) return null;
    const segment = safeDecode(m[1]!);
    return isPopupStoreUuid(segment) ? segment.toLowerCase() : null;
  }
  return null;
}

/**
 * UUID 를 가리키는 매장 CTA target 을 slug 기반으로 바꾼다. 해당 없음 → target 그대로.
 * `internal_page` 는 경로 뒤(`#menu` · `?tab=promo`)를 보존한다.
 */
export function rewritePopupStoreCtaTargetToSlug(input: {
  ctaType: string | null | undefined;
  ctaTarget: string | null | undefined;
  storeId: string;
  slug: string;
}): string | null {
  const target = input.ctaTarget ?? null;
  const legacy = popupStoreCtaLegacyStoreId(input);
  const slug = input.slug.trim();
  if (!legacy || !slug || legacy !== input.storeId.trim().toLowerCase()) return target;
  const type = String(input.ctaType ?? "").trim().toLowerCase();
  if (type === "store") return slug;
  const m = STORE_PATH_RE.exec(String(target ?? "").trim());
  if (!m) return target;
  return `/stores/${encodeURIComponent(slug)}${m[2] ?? ""}`;
}
