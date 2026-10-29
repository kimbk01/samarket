/**
 * 목록 4단 필터 칩 (배민 미러링) — 서버·클라이언트 공용 순수 모듈.
 * 정렬 시트: 기본순·주문 많은 순·별점 높은 순·가까운 순·찜 많은 순.
 * 필터: 할인·쿠폰(켜기) · 배달방식(배달/픽업) · 별점(4.5/4.0/3.5 이상) · 최소주문금액(₱ 이하) · 기타(예약가능).
 * 설계: docs/audit/delivery-baemin-mirror-design-v6-2026-10-30.html §2
 */
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";

export type StoresBrowseDeliveryMethodFilter = "delivery" | "pickup";

export type StoresBrowseCustomerFilters = {
  coupon: boolean;
  method: StoresBrowseDeliveryMethodFilter | null;
  minRating: number | null;
  maxMinOrderPhp: number | null;
  reservation: boolean;
};

export const STORES_BROWSE_RATING_FILTER_VALUES = [4.5, 4, 3.5] as const;
export const STORES_BROWSE_MIN_ORDER_FILTER_VALUES = [100, 200, 300, 500, 1000] as const;

export const STORES_BROWSE_CUSTOMER_FILTERS_EMPTY: StoresBrowseCustomerFilters = {
  coupon: false,
  method: null,
  minRating: null,
  maxMinOrderPhp: null,
  reservation: false,
};

/** 「찜 많은 순」 — 서버 정렬 목록(`default`) 위에 찜 수로 다시 정렬 */
export const STORES_BROWSE_FAVORITES_SORT = "favorites" as const;

export function parseStoresBrowseCustomerFilters(sp: URLSearchParams): StoresBrowseCustomerFilters {
  const method = (sp.get("method") ?? "").trim().toLowerCase();
  const rating = Number(sp.get("rating"));
  const minOrder = Number(sp.get("min_order"));
  return {
    coupon: sp.get("coupon") === "1",
    method: method === "delivery" || method === "pickup" ? method : null,
    minRating: (STORES_BROWSE_RATING_FILTER_VALUES as readonly number[]).includes(rating) ? rating : null,
    maxMinOrderPhp: (STORES_BROWSE_MIN_ORDER_FILTER_VALUES as readonly number[]).includes(minOrder) ? minOrder : null,
    reservation: sp.get("reserve") === "1",
  };
}

export function isStoresBrowseCustomerFiltersEmpty(f: StoresBrowseCustomerFilters): boolean {
  return !f.coupon && !f.method && f.minRating == null && f.maxMinOrderPhp == null && !f.reservation;
}

/** 목록 요청 쿼리에 필터 싣기 (빈 값은 싣지 않음 — 캐시 키 그대로) */
export function appendStoresBrowseCustomerFilters(q: URLSearchParams, f: StoresBrowseCustomerFilters): void {
  if (f.coupon) q.set("coupon", "1");
  if (f.method) q.set("method", f.method);
  if (f.minRating != null) q.set("rating", String(f.minRating));
  if (f.maxMinOrderPhp != null) q.set("min_order", String(f.maxMinOrderPhp));
  if (f.reservation) q.set("reserve", "1");
}

export function storesBrowseCustomerFiltersKey(f: StoresBrowseCustomerFilters): string {
  if (isStoresBrowseCustomerFiltersEmpty(f)) return "none";
  return [
    f.coupon ? "c" : "",
    f.method ?? "",
    f.minRating ?? "",
    f.maxMinOrderPhp ?? "",
    f.reservation ? "r" : "",
  ].join(":");
}

export function storeMatchesCustomerFilters(
  item: BrowseStoreListItem,
  f: StoresBrowseCustomerFilters,
  couponStoreIds: ReadonlySet<string>
): boolean {
  if (f.coupon && !couponStoreIds.has(item.id)) return false;
  if (f.method === "delivery" && item.deliveryAvailable === false) return false;
  if (f.method === "pickup" && item.pickupAvailable === false) return false;
  if (f.minRating != null && !(Number(item.rating) >= f.minRating)) return false;
  if (f.maxMinOrderPhp != null) {
    const min = item.commerce?.minOrderPhp;
    if (min != null && Number(min) > f.maxMinOrderPhp) return false;
  }
  if (f.reservation && item.reservationAvailable !== true) return false;
  return true;
}

type BodyLike = {
  stores: BrowseStoreListItem[];
  meta: {
    browseInsertion?: {
      rows?: unknown[];
      organicIds?: string[];
      couponBadgeByStoreId?: Record<string, { title: string }>;
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };
};

function rowStoreId(row: unknown): string | null {
  const id = (row as { storeId?: unknown } | null)?.storeId;
  return typeof id === "string" && id ? id : null;
}

/** 목록·삽입 행을 같은 매장 집합으로 맞춘다 */
export function retainBrowseStores<T extends BodyLike>(body: T, keep: (item: BrowseStoreListItem) => boolean): T {
  const stores = body.stores.filter(keep);
  if (stores.length === body.stores.length) return body;
  const ids = new Set(stores.map((s) => s.id));
  const ins = body.meta.browseInsertion;
  return {
    ...body,
    stores,
    meta: {
      ...body.meta,
      browseInsertion: ins
        ? {
            ...ins,
            rows: Array.isArray(ins.rows) ? ins.rows.filter((r) => {
              const id = rowStoreId(r);
              return id == null || ids.has(id);
            }) : ins.rows,
            organicIds: Array.isArray(ins.organicIds) ? ins.organicIds.filter((id) => ids.has(id)) : ins.organicIds,
          }
        : ins,
    },
  };
}

export function applyStoresBrowseCustomerFilters<T extends BodyLike>(
  body: T,
  f: StoresBrowseCustomerFilters,
  opts?: { pickupOnly?: boolean }
): T {
  const pickupOnly = opts?.pickupOnly === true;
  if (isStoresBrowseCustomerFiltersEmpty(f) && !pickupOnly) return body;
  const couponStoreIds = new Set(Object.keys(body.meta.browseInsertion?.couponBadgeByStoreId ?? {}));
  return retainBrowseStores(body, (item) => {
    if (pickupOnly && item.pickupAvailable === false) return false;
    return storeMatchesCustomerFilters(item, f, couponStoreIds);
  });
}

/** 정렬이 바뀌면 삽입(광고·쿠폰) 위치는 의미가 없어 → 일반 목록 순서로 */
function withOrganicOrder<T extends BodyLike>(body: T, stores: BrowseStoreListItem[]): T {
  const ins = body.meta.browseInsertion;
  return {
    ...body,
    stores,
    meta: {
      ...body.meta,
      browseInsertion: ins ? { ...ins, rows: undefined, organicIds: stores.map((s) => s.id) } : ins,
    },
  };
}

/** 찜 많은 순 — 같은 찜 수는 기존 순서 유지 */
export function sortStoresBrowseByFavorites<T extends BodyLike>(body: T, favCounts: ReadonlyMap<string, number>): T {
  const indexed = body.stores.map((s, i) => ({ s, i, n: favCounts.get(s.id) ?? 0 }));
  indexed.sort((a, b) => (b.n !== a.n ? b.n - a.n : a.i - b.i));
  return withOrganicOrder(body, indexed.map((x) => x.s));
}

const STATUS_RANK: Record<BrowseStoreListItem["status"], number> = {
  open: 0,
  preparing: 1,
  resting: 2,
  closed: 3,
};

function num(v: number | null | undefined, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * 메뉴 페이지가 여러 업종에 걸칠 때 — 업종별 서버 응답(각자 정렬됨)을 하나로 합쳐 같은 기준으로 다시 정렬.
 * 기준: 영업 상태 → 배달 거리 밖 여부 → 정렬별 키 → 업종별 원래 순서.
 * 기본순: 거리 → 최근 주문 수 → 별점 (서버 기본순과 같은 축).
 */
export function mergeStoresBrowseMenuBodies<T extends BodyLike>(
  bodies: readonly T[],
  sort: string,
  orderCounts: ReadonlyMap<string, number> | null
): T | null {
  if (bodies.length === 0) return null;
  if (bodies.length === 1) return bodies[0]!;
  const seen = new Set<string>();
  const rows: { s: BrowseStoreListItem; pos: number }[] = [];
  for (const b of bodies) {
    b.stores.forEach((s, i) => {
      if (seen.has(s.id)) return;
      seen.add(s.id);
      rows.push({ s, pos: b.stores.length > 1 ? i / (b.stores.length - 1) : 0 });
    });
  }
  const orders = (id: string) => orderCounts?.get(id) ?? 0;
  rows.sort((a, b) => {
    const st = STATUS_RANK[a.s.status] - STATUS_RANK[b.s.status];
    if (st !== 0) return st;
    const oor = Number(a.s.distanceOutOfRange === true) - Number(b.s.distanceOutOfRange === true);
    if (oor !== 0) return oor;
    let d = 0;
    if (sort === "distance") {
      d = num(a.s.distanceKm, Infinity) - num(b.s.distanceKm, Infinity);
    } else if (sort === "rating") {
      d = num(b.s.rating, 0) - num(a.s.rating, 0) || num(b.s.reviewCount, 0) - num(a.s.reviewCount, 0);
    } else if (sort === "reviews") {
      d = num(b.s.reviewCount, 0) - num(a.s.reviewCount, 0);
    } else if (sort === "popular") {
      d = orders(b.s.id) - orders(a.s.id);
    } else if (sort === "fast") {
      d = num(a.s.prepMinutes, Infinity) - num(b.s.prepMinutes, Infinity);
    } else {
      d =
        num(a.s.distanceKm, Infinity) - num(b.s.distanceKm, Infinity) ||
        orders(b.s.id) - orders(a.s.id) ||
        num(b.s.rating, 0) - num(a.s.rating, 0);
    }
    if (d !== 0 && Number.isFinite(d)) return d;
    return a.pos - b.pos;
  });
  const first = bodies[0]!;
  const couponBadgeByStoreId: Record<string, { title: string }> = {};
  for (const b of bodies) Object.assign(couponBadgeByStoreId, b.meta.browseInsertion?.couponBadgeByStoreId ?? {});
  const merged = withOrganicOrder(first, rows.map((r) => r.s));
  const ins = merged.meta.browseInsertion;
  return {
    ...merged,
    meta: {
      ...merged.meta,
      browseInsertion: ins ? { ...ins, couponBadgeByStoreId } : { couponBadgeByStoreId },
      discoveryShelf: null,
    },
  };
}
