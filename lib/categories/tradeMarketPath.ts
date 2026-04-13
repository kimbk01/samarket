/**
 * /market/[slug] 링크·활성 상태·Supabase 조회용 공통 처리
 * (퍼센트 인코딩·NFC 정규화 불일치로 일부 메뉴만 동작하는 문제 방지)
 */

import type { CategoryWithSettings } from "./types";

/**
 * URL 단일 세그먼트용 퍼센트 인코딩.
 * 거래(trade) 루트는 slug 중복 시 `/market/{slug}` 가 동일해져 탭·피드가 합쳐지므로 **항상 id** 사용.
 * `type` 이 없으면(레거시 호출) slug 우선 유지.
 */
export function encodedTradeMarketSegment(
  category: Pick<CategoryWithSettings, "slug" | "id"> & {
    type?: CategoryWithSettings["type"];
  }
): string {
  if (category.type === "trade") {
    return encodeURIComponent(category.id);
  }
  const raw = category.slug?.trim() ? category.slug.trim() : category.id;
  return encodeURIComponent(raw);
}

export function tradeMarketPath(
  category: Pick<CategoryWithSettings, "slug" | "id"> & {
    type?: CategoryWithSettings["type"];
  }
): string {
  return `/market/${encodedTradeMarketSegment(category)}`;
}

/**
 * Next 동적 라우트 [slug] 값 정규화 (이중 인코딩·NFC)
 */
export function normalizeMarketSlugParam(
  raw: string | string[] | undefined | null
): string {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== "string") return "";
  let s = first.trim();
  if (!s) return "";
  try {
    const once = decodeURIComponent(s);
    if (once !== s) s = once;
  } catch {
    /* keep s */
  }
  return s.normalize("NFC");
}

/**
 * pathname(쿼리 제외)이 해당 거래 카테고리 마켓 목록인지 — slug 또는 id 세그먼트 일치
 */
export function isTradeMarketRouteActive(
  pathname: string,
  category: Pick<CategoryWithSettings, "slug" | "id">
): boolean {
  const clean = (pathname.split("?")[0] ?? "").trim();
  const m = clean.match(/^\/market\/([^/]+)$/);
  if (!m) return false;
  let seg: string;
  try {
    seg = decodeURIComponent(m[1]!);
  } catch {
    seg = m[1]!;
  }
  seg = seg.normalize("NFC");
  const slug = category.slug?.trim();
  if (slug && seg === slug.normalize("NFC")) return true;
  if (seg === category.id) return true;
  return false;
}
