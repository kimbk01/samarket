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

/** 판매중 실제 글 이 수마다 샘플 1개를 끼운다 */
export const TRADE_SHOWCASE_EVERY_REAL = 4;

/** 공개 API 가 돌려주는 최대 샘플 수(주제 6 × 5건 + 여유) */
export const TRADE_SHOWCASE_MAX_VISIBLE = 60;

/** 실제 글이 없을 때 샘플 그리드를 한 번에 보이는 수(「더보기」로 이어짐) */
export const TRADE_SHOWCASE_PAGE_SIZE = 12;

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

/**
 * Owner 2026-10-28 승인 「샘플 섞기」: 거래 목록(검색 제외)에 샘플을 섞는다.
 * - 판매중 실제 글 `TRADE_SHOWCASE_EVERY_REAL` 개마다 샘플 1개를 끼운다(판매완료 구간에는 끼우지 않는다).
 * - 끼우고 남은 샘플은 실제 글을 끝까지 받은 뒤(`listSettled`) 목록 아래에 이어서 보인다.
 * - 순서는 API 순서(sort_order) — 주제를 번갈아 두도록 sort_order 를 매긴다(중고거래→중고차→…→렌터카→처음).
 */
export function planTradeShowcaseInterleave<P extends { id: string; status?: string | null }, S>(
  posts: readonly P[],
  samples: readonly S[],
  every: number = TRADE_SHOWCASE_EVERY_REAL
): { afterPostId: Map<string, S>; rest: S[] } {
  const afterPostId = new Map<string, S>();
  let active = 0;
  let next = 0;
  for (const p of posts) {
    if (next >= samples.length) break;
    if (String(p.status ?? "").toLowerCase() === "sold") continue;
    active += 1;
    if (active % every === 0) {
      afterPostId.set(p.id, samples[next]!);
      next += 1;
    }
  }
  return { afterPostId, rest: samples.slice(next) };
}
