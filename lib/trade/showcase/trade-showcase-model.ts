/**
 * P-7 (2026-10-27) 거래 샘플 상품 — 실제 거래 글(posts)과 분리된 예시 카탈로그(`trade_showcase_items`).
 * 채팅·찜·신고·통계 대상이 아니며, 화면에는 항상 「샘플 · 거래 불가」 배지와 함께만 노출한다.
 */

export type TradeShowcaseItem = {
  id: string;
  trade_category_id: string | null;
  title: string;
  price: number | null;
  price_note: string | null;
  region_label: string | null;
  description: string | null;
  image_urls: string[];
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type TradeShowcaseInput = {
  trade_category_id: string | null;
  title: string;
  price: number | null;
  price_note: string | null;
  region_label: string | null;
  description: string | null;
  image_urls: string[];
  sort_order: number;
  is_active: boolean;
};

export const TRADE_SHOWCASE_MAX_IMAGES = 10;

/** 실제 글이 이 수보다 적을 때만 목록 하단 「예시로 둘러보기」를 보인다 */
export const TRADE_SHOWCASE_MIN_REAL_ITEMS = 12;

/** 목록 하단 예시 구역 최대 카드 수 */
export const TRADE_SHOWCASE_MAX_VISIBLE = 12;

export const TRADE_SHOWCASE_SELECT =
  "id, trade_category_id, title, price, price_note, region_label, description, image_urls, sort_order, is_active, created_at, updated_at";

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 어드민 입력 검증 — 실패 시 오류 코드 */
export function parseTradeShowcaseInput(
  raw: unknown
): { ok: true; value: TradeShowcaseInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "invalid_body" };
  const o = raw as Record<string, unknown>;
  const title = str(o.title, 80);
  if (!title) return { ok: false, error: "title_required" };
  let price: number | null = null;
  if (o.price !== null && o.price !== undefined && o.price !== "") {
    const n = typeof o.price === "number" ? o.price : Number(String(o.price).replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: "invalid_price" };
    price = Math.round(n * 100) / 100;
  }
  const catRaw = typeof o.trade_category_id === "string" ? o.trade_category_id.trim() : "";
  if (catRaw && !UUID_RE.test(catRaw)) return { ok: false, error: "invalid_category" };
  const images = Array.isArray(o.image_urls)
    ? o.image_urls
        .filter((u): u is string => typeof u === "string")
        .map((u) => u.trim())
        .filter((u) => /^https:\/\//.test(u))
    : [];
  if (images.length > TRADE_SHOWCASE_MAX_IMAGES) return { ok: false, error: "too_many_images" };
  const sort = Number(o.sort_order ?? 0);
  return {
    ok: true,
    value: {
      trade_category_id: catRaw || null,
      title,
      price,
      price_note: str(o.price_note, 40),
      region_label: str(o.region_label, 60),
      description: str(o.description, 2000),
      image_urls: images,
      sort_order: Number.isFinite(sort) ? Math.trunc(sort) : 0,
      is_active: o.is_active !== false,
    },
  };
}

/** 공개 노출 조건 — 검색 중이 아니고, 실제 글이 기준보다 적을 때만 */
export function shouldShowTradeShowcase(input: { realCount: number; hasSearchQuery: boolean; listSettled: boolean }): boolean {
  if (input.hasSearchQuery || !input.listSettled) return false;
  return input.realCount < TRADE_SHOWCASE_MIN_REAL_ITEMS;
}
