/**
 * WP7·WP8 (배민형 3차수 2026-10-30) — 메뉴 상세·장바구니 표시 규칙 순수 함수.
 * 명세: `docs/audit/delivery-baemin-master-plan-2026-10-29.md` WP7·WP8
 * 화면: `StoreProductPublic` · `StoreProductDetailPageChrome` · `StoreCommerceCartPageClient` · `cart/baemin/*`
 */
import type { AutoBusinessHoursConfig } from "@/lib/stores/store-auto-hours";
import type { StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";
import {
  getZonedDayInfo,
  hhmmToMinutesStrict,
  shiftStoreYmd,
  storeIntervalsForBusinessDay,
} from "@/lib/stores/store-weekly-hours";

/* ───────────────────────── 장바구니 — 마감임박 ───────────────────────── */

/** 영업 종료 몇 분 전부터 「마감임박」을 보일지 */
export const STORE_CART_CLOSING_SOON_WINDOW_MIN = 60;

export type StoreClosingSoon = { closeHHmm: string; minutesLeft: number };

/**
 * 지금 영업 구간이 `windowMin` 분 안에 끝나면 종료 시각(HH:mm)과 남은 분.
 * 자동 영업시간 설정이 없거나(수동 운영) 영업 구간 밖이면 null.
 * 자정 넘김 구간(open > close)과 전날 구간의 꼬리도 처리한다 (`evaluateStoreSchedule` 와 같은 규칙).
 */
export function resolveStoreClosingSoon(
  cfg: AutoBusinessHoursConfig | null,
  now: Date,
  windowMin = STORE_CART_CLOSING_SOON_WINDOW_MIN
): StoreClosingSoon | null {
  if (!cfg) return null;
  const info = getZonedDayInfo(now, cfg.timezone);
  if (!info) return null;
  const model = {
    open: cfg.open,
    close: cfg.close,
    weekly: cfg.weekly ?? null,
    closedDates: cfg.closedDates ?? [],
  };
  const nowM = info.minutes;
  let hit: StoreClosingSoon | null = null;

  for (const iv of storeIntervalsForBusinessDay(model, info.ymd, info.weekday)) {
    const o = hhmmToMinutesStrict(iv.open);
    const c = hhmmToMinutesStrict(iv.close);
    if (o == null || c == null) continue;
    if (o < c && nowM >= o && nowM < c) {
      hit = { closeHHmm: iv.close, minutesLeft: c - nowM };
      break;
    }
    if (o >= c && nowM >= o) {
      hit = { closeHHmm: iv.close, minutesLeft: 24 * 60 - nowM + c };
      break;
    }
  }
  if (!hit) {
    const yesterday = storeIntervalsForBusinessDay(
      model,
      shiftStoreYmd(info.ymd, -1),
      info.weekday + 6
    );
    for (const iv of yesterday) {
      const o = hhmmToMinutesStrict(iv.open);
      const c = hhmmToMinutesStrict(iv.close);
      if (o == null || c == null) continue;
      if (o > c && nowM < c) {
        hit = { closeHHmm: iv.close, minutesLeft: c - nowM };
        break;
      }
    }
  }
  if (!hit) return null;
  if (hit.minutesLeft <= 0 || hit.minutesLeft > Math.max(0, windowMin)) return null;
  return hit;
}

/* ───────────────────────── 장바구니 — 옵션 줄 ───────────────────────── */

/**
 * 옵션 요약(`validateModifierSelection` snapshot.summary: 「그룹: 값 (+₱10), 값 · 그룹2: 값」)
 * → 그룹마다 한 줄 「그룹 : 값 (+₱10), 값」. 빈 요약이면 [].
 */
export function formatCartLineOptionLines(summary: string | null | undefined): string[] {
  const raw = (summary ?? "").trim();
  if (!raw) return [];
  return raw
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(": ");
      if (idx <= 0) return part;
      const label = part.slice(0, idx).trim();
      const values = part.slice(idx + 2).trim();
      return values ? `${label} : ${values}` : label;
    });
}

/* ───────────────────────── 장바구니 — 함께 먹으면 좋아요 ───────────────────────── */

/** 처음에 보이는 개수 — 나머지는 「더보기」 */
export const STORE_CART_UPSELL_INITIAL_COUNT = 3;

/**
 * 인기 순(`popularProductIds`) → 추천 순(`recommendedProductIds`) 으로 카드 나열.
 * 이미 담은 메뉴·판매 중이 아닌 메뉴는 뺀다. 순서 정보가 없으면 [] (임의 순서로 만들지 않음).
 */
export function pickCartUpsellProducts(input: {
  cards: readonly StoreDetailProductCard[];
  popularProductIds: readonly string[] | null | undefined;
  recommendedProductIds: readonly string[] | null | undefined;
  excludeProductIds: readonly string[];
  max?: number;
}): StoreDetailProductCard[] {
  const byId = new Map(input.cards.map((c) => [c.id, c]));
  const exclude = new Set(input.excludeProductIds.map((x) => x.trim()).filter(Boolean));
  const cap = Math.max(0, Math.floor(input.max ?? 10));
  const out: StoreDetailProductCard[] = [];
  const seen = new Set<string>();
  for (const id of [...(input.popularProductIds ?? []), ...(input.recommendedProductIds ?? [])]) {
    if (out.length >= cap) break;
    const key = String(id ?? "").trim();
    if (!key || seen.has(key) || exclude.has(key)) continue;
    seen.add(key);
    const c = byId.get(key);
    if (!c || c.product_status !== "active") continue;
    out.push(c);
  }
  return out;
}

/* ───────────────────────── 메뉴 상세 — 담은 뒤 돌아가기 ───────────────────────── */

function pathOnly(href: string): string {
  const p = (href.split("?")[0] ?? "").split("#")[0] ?? "";
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

function decodeSeg(seg: string): string {
  try {
    return decodeURIComponent(seg).normalize("NFC").trim().toLowerCase();
  } catch {
    return seg.trim().toLowerCase();
  }
}

/** `/stores/{slug}` (쿼리 무관) = 이 매장 메뉴 화면인가 */
export function isStoreMenuRootHref(href: string | null | undefined, storeSlug: string): boolean {
  if (!href) return false;
  const parts = pathOnly(href).split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== "stores") return false;
  return decodeSeg(parts[1] ?? "") === decodeSeg(storeSlug);
}

export type ProductDetailReturnAction = "back" | "replace";

/**
 * 메뉴 상세에서 담은 뒤(또는 헤더 검색) 매장으로 돌아가는 방법.
 * - 바로 앞 기록이 이 매장 메뉴 화면 → `back` (새 기록을 쌓지 않음 → 원래 스크롤 위치)
 * - Navigation API 가 없으면 진입 기록(`historyIncludesStoreParent`)이 있을 때만 `back`
 * - 그 밖(딥링크·목록에서 바로 진입) → `replace(매장)` — 메뉴 상세 기록을 매장으로 바꿈
 * `router.push(매장)` 은 쓰지 않는다 (뒤로가기 시 메뉴 상세가 다시 열리는 결함).
 */
export function resolveProductDetailReturnAction(input: {
  storeSlug: string;
  hasNavigationApi: boolean;
  previousHref: string | null;
  historyIncludesStoreParent: boolean;
}): ProductDetailReturnAction {
  if (input.hasNavigationApi) {
    return isStoreMenuRootHref(input.previousHref, input.storeSlug) ? "back" : "replace";
  }
  return input.historyIncludesStoreParent ? "back" : "replace";
}

/* ───────────────────────── 메뉴 상세 — 매장 목록 캐시로 먼저 그리기 ───────────────────────── */

export type StoreProductMenuSeed = {
  id: string;
  title: string;
  summary: string | null;
  price: number;
  discountPrice: number | null;
  thumbnailUrl: string | null;
};

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** 매장 메뉴 응답(`GET /api/stores/:slug/menus`) 의 `products[]` 에서 이 메뉴의 이름·가격·사진 */
export function pickStoreProductMenuSeed(
  menusJson: unknown,
  productId: string
): StoreProductMenuSeed | null {
  const pid = productId.trim();
  if (!pid || !menusJson || typeof menusJson !== "object") return null;
  const products = (menusJson as { products?: unknown }).products;
  if (!Array.isArray(products)) return null;
  for (const row of products) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (String(r.id ?? "").trim() !== pid) continue;
    const title = typeof r.title === "string" ? r.title.trim() : "";
    const price = num(r.price);
    if (!title || price == null) return null;
    const disc = num(r.discount_price);
    const thumb = typeof r.thumbnail_url === "string" && r.thumbnail_url.trim() ? r.thumbnail_url.trim() : null;
    return {
      id: pid,
      title,
      summary: typeof r.summary === "string" && r.summary.trim() ? r.summary.trim() : null,
      price,
      discountPrice: disc != null && disc >= 0 && disc < price ? disc : null,
      thumbnailUrl: thumb,
    };
  }
  return null;
}
