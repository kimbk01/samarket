/**
 * 배달·매장(스토어 커머스) 클라이언트 API — 동일 URL 동시 요청 합류(runSingleFlight).
 * 컴포넌트에 `fetch("/api/stores/...")` 를 흩뿌리지 않고 한곳에서 유지한다.
 */
import { getSingleFlightPromise, runSingleFlight } from "@/lib/http/run-single-flight";

const STORE_PUBLIC_CACHE_TTL_MS = 15_000;
const storePublicCache = new Map<string, { expiresAt: number; value: StoreApiJsonResponse }>();
const STORE_PRODUCT_PUBLIC_CACHE_TTL_MS = 15_000;
const storeProductPublicCache = new Map<string, { expiresAt: number; value: StoreApiJsonResponse }>();
const STORE_REVIEWS_PUBLIC_CACHE_TTL_MS = 15_000;
const storeReviewsPublicCache = new Map<string, { expiresAt: number; value: StoreApiJsonResponse }>();
const STORE_SUMMARY_PUBLIC_CACHE_TTL_MS = 15_000;
const storeSummaryPublicCache = new Map<string, { expiresAt: number; value: StoreApiJsonResponse }>();
const STORE_MENUS_PUBLIC_CACHE_TTL_MS = 15_000;
const storeMenusPublicCache = new Map<string, { expiresAt: number; value: StoreApiJsonResponse }>();
const STORE_REVIEWS_SUMMARY_CACHE_TTL_MS = 30_000;
const storeReviewsSummaryCache = new Map<string, { expiresAt: number; value: StoreApiJsonResponse }>();
const STORE_HUB_SUMMARY_CACHE_TTL_MS = 12_000;
const storeHubSummaryCache = new Map<string, { expiresAt: number; value: StoreApiJsonResponse }>();
const STORE_BANNERS_PUBLIC_CACHE_TTL_MS = 12_000;
const storeBannersPublicCache = new Map<string, { expiresAt: number; value: StoreApiJsonResponse }>();
const STORE_NOTICES_PUBLIC_CACHE_TTL_MS = 12_000;
const storeNoticesPublicCache = new Map<string, { expiresAt: number; value: StoreApiJsonResponse }>();
/** 공개 taxonomy(마스터) — 어드민 `/api/admin/...` 와 별도. 재진입·다중 컴포넌트 마운트 왕복 억제 */
const STORE_TAXONOMY_PUBLIC_CACHE_TTL_MS = 120_000;
const STORE_TAXONOMY_PUBLIC_CACHE_KEY = "_taxonomy";
const storeTaxonomyPublicCache = new Map<string, { expiresAt: number; value: StoreApiJsonResponse }>();

function trimSlug(slug: string): string {
  return slug.trim();
}

export type StoreApiJsonResponse = { status: number; json: unknown };

function routesTraceClientLog(fields: {
  pathname: string;
  component: string;
  reason: string;
  triggeredBy: string;
  duplicateKey: string;
  cacheHit: boolean;
  event: string;
}): void {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return;
  try {
    console.info(
      "[ROUTES_TRACE]",
      JSON.stringify({
        pathname: fields.pathname,
        component: fields.component,
        reason: fields.reason,
        origin: null,
        destination: null,
        triggeredBy: fields.triggeredBy,
        duplicateKey: fields.duplicateKey,
        cacheHit: fields.cacheHit,
        devMode: true,
        timestamp: new Date().toISOString(),
        event: fields.event,
        travelMode: null,
      })
    );
  } catch {
    /* noop */
  }
}

type StoreHubSummaryCacheSnapshot = {
  value: StoreApiJsonResponse | null;
  isFresh: boolean;
};

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function withAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

function readStoreHubSummaryCache(cacheKey: string): StoreHubSummaryCacheSnapshot {
  const hit = storeHubSummaryCache.get(cacheKey);
  if (!hit) return { value: null, isFresh: false };
  return { value: hit.value, isFresh: hit.expiresAt > Date.now() };
}

function peekStoreHubSummaryCache(cacheKey: string): StoreApiJsonResponse | null {
  const snapshot = readStoreHubSummaryCache(cacheKey);
  if (!snapshot.value || !snapshot.isFresh) return null;
  return snapshot.value;
}

export function peekMeStoreOrdersHubSummaryCache(): StoreApiJsonResponse | null {
  const cacheKey = "hub_summary=1";
  const cached = peekStoreHubSummaryCache(cacheKey);
  if (!cached) return null;
  return { status: cached.status, json: cached.json };
}

export function readMeStoreOrdersHubSummaryCache(): { value: StoreApiJsonResponse | null; isFresh: boolean } {
  const snapshot = readStoreHubSummaryCache("hub_summary=1");
  if (!snapshot.value) return { value: null, isFresh: false };
  return {
    value: { status: snapshot.value.status, json: snapshot.value.json },
    isFresh: snapshot.isFresh,
  };
}

function primeStoreHubSummaryCache(cacheKey: string, value: StoreApiJsonResponse): void {
  if (value.status !== 200) {
    storeHubSummaryCache.delete(cacheKey);
    return;
  }
  storeHubSummaryCache.set(cacheKey, {
    expiresAt: Date.now() + STORE_HUB_SUMMARY_CACHE_TTL_MS,
    value,
  });
}

/**
 * 서버에서 받은 동일 페이로드를 주입 — 최초 클라 `fetchStorePublicBySlugDeduped` 가 네트워크 없이 캐시 히트.
 * (RSC `fetchStorePublicInitialOnServer` 와 짝)
 */
export function primeStorePublicCache(slug: string, response: StoreApiJsonResponse): void {
  const s = trimSlug(slug);
  if (!s) return;
  const value = { status: response.status, json: response.json };
  if (response.status !== 200) {
    storePublicCache.delete(s);
    return;
  }
  storePublicCache.set(s, { expiresAt: Date.now() + STORE_PUBLIC_CACHE_TTL_MS, value });
}

/** RSC 등에서 `GET /api/stores/:slug/summary` 선조회 — Phase 2 클라 첫 fetch 합류용 */
export function primeStoreSummaryCache(slug: string, response: StoreApiJsonResponse): void {
  const s = trimSlug(slug);
  if (!s) return;
  const value = { status: response.status, json: response.json };
  if (response.status !== 200) {
    storeSummaryPublicCache.delete(s);
    return;
  }
  storeSummaryPublicCache.set(s, { expiresAt: Date.now() + STORE_SUMMARY_PUBLIC_CACHE_TTL_MS, value });
}

function peekSlugPublicCache(
  map: Map<string, { expiresAt: number; value: StoreApiJsonResponse }>,
  slug: string
): StoreApiJsonResponse | null {
  const s = trimSlug(slug);
  if (!s) return null;
  const hit = map.get(s);
  if (!hit || hit.expiresAt <= Date.now()) {
    if (hit) map.delete(s);
    return null;
  }
  return { status: hit.value.status, json: hit.value.json };
}

/** 탭·마운트 직후 동기 적용 — `fetchStorePublicBySlugDeduped` 왕복 전 */
export function peekStorePublicCache(slug: string): StoreApiJsonResponse | null {
  return peekSlugPublicCache(storePublicCache, slug);
}

/** 탭·마운트 직후 동기 적용 — `fetchStoreSummaryDeduped` 왕복 전 */
export function peekStoreSummaryPublicCache(slug: string): StoreApiJsonResponse | null {
  return peekSlugPublicCache(storeSummaryPublicCache, slug);
}

export function peekStoreMenusPublicCache(slug: string): StoreApiJsonResponse | null {
  return peekSlugPublicCache(storeMenusPublicCache, slug);
}

export function peekStoreBannersPublicCache(slug: string): StoreApiJsonResponse | null {
  return peekSlugPublicCache(storeBannersPublicCache, slug);
}

export function peekStoreNoticesPublicCache(slug: string): StoreApiJsonResponse | null {
  return peekSlugPublicCache(storeNoticesPublicCache, slug);
}

/** GET /api/stores/:slug/summary — 매장 메타만 (메뉴 없음) */
export async function fetchStoreSummaryDeduped(slug: string): Promise<StoreApiJsonResponse> {
  const s = trimSlug(slug);
  if (!s) return { status: 400, json: { ok: false } };
  const cached = storeSummaryPublicCache.get(s);
  if (cached && cached.expiresAt > Date.now()) {
    return { status: cached.value.status, json: cached.value.json };
  }
  return runSingleFlight(`stores:api:summary:${s}`, async () => {
    const inFlightCached = storeSummaryPublicCache.get(s);
    if (inFlightCached && inFlightCached.expiresAt > Date.now()) {
      return { status: inFlightCached.value.status, json: inFlightCached.value.json };
    }
    const res = await fetch(`/api/stores/${encodeURIComponent(s)}/summary`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    const value = { status: res.status, json };
    if (res.ok) {
      storeSummaryPublicCache.set(s, { expiresAt: Date.now() + STORE_SUMMARY_PUBLIC_CACHE_TTL_MS, value });
    } else {
      storeSummaryPublicCache.delete(s);
    }
    return value;
  });
}

/** GET /api/stores/:slug/menus — 메뉴 목록 (options_json 제외) */
export async function fetchStoreMenusDeduped(slug: string): Promise<StoreApiJsonResponse> {
  const s = trimSlug(slug);
  if (!s) return { status: 400, json: { ok: false } };
  const cached = storeMenusPublicCache.get(s);
  if (cached && cached.expiresAt > Date.now()) {
    return { status: cached.value.status, json: cached.value.json };
  }
  return runSingleFlight(`stores:api:menus:${s}`, async () => {
    const inFlightCached = storeMenusPublicCache.get(s);
    if (inFlightCached && inFlightCached.expiresAt > Date.now()) {
      return { status: inFlightCached.value.status, json: inFlightCached.value.json };
    }
    const res = await fetch(`/api/stores/${encodeURIComponent(s)}/menus`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    const value = { status: res.status, json };
    if (res.ok) {
      storeMenusPublicCache.set(s, { expiresAt: Date.now() + STORE_MENUS_PUBLIC_CACHE_TTL_MS, value });
    } else {
      storeMenusPublicCache.delete(s);
    }
    return value;
  });
}

/** GET /api/stores/:slug/reviews-summary — 평균·최근 3건·분포 */
export async function fetchStoreReviewsSummaryDeduped(slug: string): Promise<StoreApiJsonResponse> {
  const s = trimSlug(slug);
  if (!s) return { status: 400, json: { ok: false } };
  const cached = storeReviewsSummaryCache.get(s);
  if (cached && cached.expiresAt > Date.now()) {
    return { status: cached.value.status, json: cached.value.json };
  }
  return runSingleFlight(`stores:api:reviews-summary:${s}`, async () => {
    const inFlightCached = storeReviewsSummaryCache.get(s);
    if (inFlightCached && inFlightCached.expiresAt > Date.now()) {
      return { status: inFlightCached.value.status, json: inFlightCached.value.json };
    }
    const res = await fetch(`/api/stores/${encodeURIComponent(s)}/reviews-summary`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    const value = { status: res.status, json };
    if (res.ok) {
      storeReviewsSummaryCache.set(s, { expiresAt: Date.now() + STORE_REVIEWS_SUMMARY_CACHE_TTL_MS, value });
    } else {
      storeReviewsSummaryCache.delete(s);
    }
    return value;
  });
}

/** GET /api/stores/:slug — 매장 상세·스티키바·카트 진입 등 동시 마운트 시 합류 */
export async function fetchStorePublicBySlugDeduped(slug: string): Promise<StoreApiJsonResponse> {
  const s = trimSlug(slug);
  if (!s) return { status: 400, json: { ok: false } };
  const cached = storePublicCache.get(s);
  if (cached && cached.expiresAt > Date.now()) {
    return { status: cached.value.status, json: cached.value.json };
  }
  return runSingleFlight(`stores:api:public:${s}`, async () => {
    const inFlightCached = storePublicCache.get(s);
    if (inFlightCached && inFlightCached.expiresAt > Date.now()) {
      return { status: inFlightCached.value.status, json: inFlightCached.value.json };
    }
    const res = await fetch(`/api/stores/${encodeURIComponent(s)}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    const value = { status: res.status, json };
    if (res.ok) {
      storePublicCache.set(s, { expiresAt: Date.now() + STORE_PUBLIC_CACHE_TTL_MS, value });
    } else {
      storePublicCache.delete(s);
    }
    return value;
  });
}

/** GET /api/stores/products/:productId */
export async function fetchStoreProductPublicDeduped(productId: string): Promise<StoreApiJsonResponse> {
  const id = productId.trim();
  if (!id) return { status: 400, json: { ok: false } };
  const cached = storeProductPublicCache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    return { status: cached.value.status, json: cached.value.json };
  }
  return runSingleFlight(`stores:api:product:${id}`, async () => {
    const inFlightCached = storeProductPublicCache.get(id);
    if (inFlightCached && inFlightCached.expiresAt > Date.now()) {
      return { status: inFlightCached.value.status, json: inFlightCached.value.json };
    }
    const res = await fetch(`/api/stores/products/${encodeURIComponent(id)}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    const value = { status: res.status, json };
    if (res.ok) {
      storeProductPublicCache.set(id, { expiresAt: Date.now() + STORE_PRODUCT_PUBLIC_CACHE_TTL_MS, value });
    } else {
      storeProductPublicCache.delete(id);
    }
    return value;
  });
}

/** GET /api/stores/:slug/reviews */
export async function fetchStoreReviewsPublicDeduped(storeSlug: string): Promise<StoreApiJsonResponse> {
  const s = trimSlug(storeSlug);
  if (!s) return { status: 400, json: { ok: false } };
  const cached = storeReviewsPublicCache.get(s);
  if (cached && cached.expiresAt > Date.now()) {
    return { status: cached.value.status, json: cached.value.json };
  }
  return runSingleFlight(`stores:api:reviews:${s}`, async () => {
    const inFlightCached = storeReviewsPublicCache.get(s);
    if (inFlightCached && inFlightCached.expiresAt > Date.now()) {
      return { status: inFlightCached.value.status, json: inFlightCached.value.json };
    }
    const res = await fetch(`/api/stores/${encodeURIComponent(s)}/reviews`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    const value = { status: res.status, json };
    if (res.ok) {
      storeReviewsPublicCache.set(s, { expiresAt: Date.now() + STORE_REVIEWS_PUBLIC_CACHE_TTL_MS, value });
    } else {
      storeReviewsPublicCache.delete(s);
    }
    return value;
  });
}

export function isStoresTaxonomyClientCacheFresh(): boolean {
  const hit = storeTaxonomyPublicCache.get(STORE_TAXONOMY_PUBLIC_CACHE_KEY);
  return !!hit && hit.expiresAt > Date.now();
}

/** 어드민이 공개 taxonomy 를 바꾼 직후 등 — 다음 `fetchStoresTaxonomyDeduped` 가 네트워크를 탄다 */
export function clearStoresTaxonomyClientCache(): void {
  storeTaxonomyPublicCache.delete(STORE_TAXONOMY_PUBLIC_CACHE_KEY);
}

/** GET /api/stores/taxonomy — TTL + `runSingleFlight`(다른 스토어 공개 GET 과 동일 패턴) */
export async function fetchStoresTaxonomyDeduped(): Promise<StoreApiJsonResponse> {
  const k = STORE_TAXONOMY_PUBLIC_CACHE_KEY;
  const cached = storeTaxonomyPublicCache.get(k);
  if (cached && cached.expiresAt > Date.now()) {
    return { status: cached.value.status, json: cached.value.json };
  }
  return runSingleFlight("stores:api:taxonomy", async () => {
    const inflightCached = storeTaxonomyPublicCache.get(k);
    if (inflightCached && inflightCached.expiresAt > Date.now()) {
      return { status: inflightCached.value.status, json: inflightCached.value.json };
    }
    const res = await fetch("/api/stores/taxonomy", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    const value = { status: res.status, json };
    if (res.ok && res.status === 200) {
      storeTaxonomyPublicCache.set(k, { expiresAt: Date.now() + STORE_TAXONOMY_PUBLIC_CACHE_TTL_MS, value });
    } else {
      storeTaxonomyPublicCache.delete(k);
    }
    return value;
  });
}

/** GET /api/stores/browse?… */
export async function fetchStoresBrowseDeduped(
  queryString: string,
  opts?: { language?: import("@/lib/i18n/config").AppLanguageCode }
): Promise<StoreApiJsonResponse> {
  const qs = queryString.trim().replace(/^\?/, "");
  const lang = opts?.language ?? "en";
  return runSingleFlight(`stores:api:browse:${lang}:${qs}`, async () => {
    const { storesApiAcceptLanguageHeader } = await import("@/lib/i18n/language-preference");
    const res = await fetch(`/api/stores/browse?${qs}`, {
      cache: "no-store",
      headers: storesApiAcceptLanguageHeader(lang),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}

/** GET /api/stores/home-feed… (쿼리 포함 전체 path 뒷부분, 예: `?lat=…` 또는 빈 문자열) */
export async function fetchStoresHomeFeedDeduped(
  pathAndQuery: string,
  opts: { signal?: AbortSignal; language?: import("@/lib/i18n/config").AppLanguageCode } = {}
): Promise<StoreApiJsonResponse> {
  const suffix = pathAndQuery.startsWith("?") ? pathAndQuery : pathAndQuery ? `?${pathAndQuery}` : "";
  const lang = opts.language ?? "en";
  const flight = runSingleFlight(`stores:api:home-feed:${lang}:${suffix}`, async () => {
    const { storesApiAcceptLanguageHeader } = await import("@/lib/i18n/language-preference");
    const res = await fetch(`/api/stores/home-feed${suffix}`, {
      cache: "no-store",
      headers: storesApiAcceptLanguageHeader(lang),
      signal: opts.signal,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
  return withAbortSignal(flight, opts.signal);
}

/** POST/DELETE /api/stores/:slug/favorite — 변이(단일 비행 불필요), 호출부 일원화용 */
export async function fetchStoreFavoriteMutation(
  slug: string,
  method: "POST" | "DELETE"
): Promise<StoreApiJsonResponse> {
  const s = trimSlug(slug);
  if (!s) return { status: 400, json: { ok: false } };
  storePublicCache.delete(s);
  storeSummaryPublicCache.delete(s);
  storeMenusPublicCache.delete(s);
  const res = await fetch(`/api/stores/${encodeURIComponent(s)}/favorite`, {
    method,
    credentials: "include",
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/** GET /api/me/store-orders/:orderId — 주문 상세·완료 화면·채팅 등 동시 진입 합류 */
export async function fetchMeStoreOrderDetailDeduped(orderId: string): Promise<StoreApiJsonResponse> {
  const id = orderId.trim();
  if (!id) return { status: 400, json: { ok: false } };
  return runSingleFlight(`me:store-order:detail:get:${id}`, async () => {
    const res = await fetch(`/api/me/store-orders/${encodeURIComponent(id)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}

/** GET /api/me/store-orders/:orderId/events — 주문 이벤트 원장(타임라인 보강) */
export async function fetchMeStoreOrderEventsDeduped(orderId: string): Promise<StoreApiJsonResponse> {
  const id = orderId.trim();
  if (!id) return { status: 400, json: { ok: false } };
  return runSingleFlight(`me:store-order:events:get:${id}`, async () => {
    const res = await fetch(`/api/me/store-orders/${encodeURIComponent(id)}/events`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}

/** PATCH /api/me/store-orders/:orderId */
export async function patchMeStoreOrder(
  orderId: string,
  body: Record<string, unknown>
): Promise<StoreApiJsonResponse> {
  const id = orderId.trim();
  if (!id) return { status: 400, json: { ok: false } };
  const res = await fetch(`/api/me/store-orders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/** DELETE /api/me/store-orders/:orderId — 구매자 목록에서 숨김 */
export async function deleteMeStoreOrder(orderId: string): Promise<StoreApiJsonResponse> {
  const id = orderId.trim();
  if (!id) return { status: 400, json: { ok: false } };
  const res = await fetch(`/api/me/store-orders/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/** GET `/api/stores/:slug/delivery-eta` — 장바구니 배달 ETA 프리뷰(명시 호출 권장) */
export async function fetchStoreDeliveryEtaDeduped(
  slug: string,
  deliveryUserAddressId: string,
  opts?: {
    signal?: AbortSignal;
    trace?: { component?: string; reason?: string; triggeredBy?: string; pathname?: string };
  }
): Promise<StoreApiJsonResponse> {
  const s = slug.trim();
  const id = deliveryUserAddressId.trim();
  if (!s || !id) return { status: 400, json: { ok: false } };
  const qs = new URLSearchParams({ delivery_user_address_id: id }).toString();
  const flightKey = `stores:delivery-eta:${s}:${id}`;
  const pathname =
    opts?.trace?.pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "/api/stores/[slug]/delivery-eta");
  const existing = getSingleFlightPromise<StoreApiJsonResponse>(flightKey);
  routesTraceClientLog({
    pathname,
    component: opts?.trace?.component ?? "fetchStoreDeliveryEtaDeduped",
    reason: opts?.trace?.reason ?? "delivery_eta_client_fetch",
    triggeredBy: opts?.trace?.triggeredBy ?? "unknown",
    duplicateKey: flightKey,
    cacheHit: Boolean(existing),
    event: existing ? "client_inflight_hit" : "client_fetch_start",
  });
  const flight = runSingleFlight(flightKey, async () => {
    const res = await fetch(`/api/stores/${encodeURIComponent(s)}/delivery-eta?${qs}`, {
      credentials: "include",
      cache: "no-store",
      signal: opts?.signal,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
  return withAbortSignal(flight, opts?.signal);
}

const storeOrderPostFlights = new Map<string, Promise<StoreApiJsonResponse>>();

/** POST /api/me/store-orders (주문 생성) — 동일 client_order_key 단일 비행 */
export async function postMeStoreOrder(body: Record<string, unknown>): Promise<StoreApiJsonResponse> {
  const keyRaw = body.client_order_key;
  const idemKey = typeof keyRaw === "string" ? keyRaw.trim() : "";

  const runPost = async (): Promise<StoreApiJsonResponse> => {
    const res = await fetch("/api/me/store-orders", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  };

  if (!idemKey) return runPost();

  const flightKey = `order:${idemKey}`;
  const existing = storeOrderPostFlights.get(flightKey);
  if (existing) return existing;

  const flight = runPost();
  storeOrderPostFlights.set(flightKey, flight);
  try {
    return await flight;
  } finally {
    storeOrderPostFlights.delete(flightKey);
  }
}

/** GET /api/me/store-orders?… (목록·프리뷰) — query 전체를 키에 포함 */
export async function fetchMeStoreOrdersListDeduped(queryWithQuestionOrEmpty: string): Promise<StoreApiJsonResponse> {
  const q = queryWithQuestionOrEmpty.trim();
  const path = q.startsWith("?") ? q : q ? `?${q}` : "";
  return runSingleFlight(`me:store-orders:list:get:${path}`, async () => {
    const res = await fetch(`/api/me/store-orders${path}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}

/** GET /api/me/store-orders?hub_summary=1 — stores hub buyer card (lightweight) */
export async function fetchMeStoreOrdersHubSummaryDeduped(
  opts: { signal?: AbortSignal } = {}
): Promise<StoreApiJsonResponse> {
  const cacheKey = "hub_summary=1";
  const cached = peekStoreHubSummaryCache(cacheKey);
  if (cached) {
    return { status: cached.status, json: cached.json };
  }
  const flight = runSingleFlight("me:store-orders:hub-summary:get", async () => {
    const inFlightCached = peekStoreHubSummaryCache(cacheKey);
    if (inFlightCached) {
      return { status: inFlightCached.status, json: inFlightCached.json };
    }
    const res = await fetch("/api/me/store-orders?hub_summary=1", {
      credentials: "include",
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    const value = { status: res.status, json };
    primeStoreHubSummaryCache(cacheKey, value);
    return value;
  });
  return withAbortSignal(flight, opts.signal);
}

export function invalidateStoreBannersPublicCache(slug: string): void {
  storeBannersPublicCache.delete(trimSlug(slug));
}

export function invalidateStoreNoticesPublicCache(slug: string): void {
  storeNoticesPublicCache.delete(trimSlug(slug));
}

/** GET /api/stores/:slug/banners — 매장 배너(공개) */
export async function fetchStoreBannersDeduped(slug: string): Promise<StoreApiJsonResponse> {
  const s = trimSlug(slug);
  if (!s) return { status: 400, json: { ok: false } };
  const cached = storeBannersPublicCache.get(s);
  if (cached && cached.expiresAt > Date.now()) {
    return { status: cached.value.status, json: cached.value.json };
  }
  return runSingleFlight(`stores:api:banners:${s}`, async () => {
    const inFlightCached = storeBannersPublicCache.get(s);
    if (inFlightCached && inFlightCached.expiresAt > Date.now()) {
      return { status: inFlightCached.value.status, json: inFlightCached.value.json };
    }
    const res = await fetch(`/api/stores/${encodeURIComponent(s)}/banners`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    const value = { status: res.status, json };
    if (res.ok) {
      storeBannersPublicCache.set(s, { expiresAt: Date.now() + STORE_BANNERS_PUBLIC_CACHE_TTL_MS, value });
    } else {
      storeBannersPublicCache.delete(s);
    }
    return value;
  });
}

/** GET /api/stores/:slug/notices — 매장 공지(공개, placement 포함 전체) */
export async function fetchStoreNoticesDeduped(slug: string): Promise<StoreApiJsonResponse> {
  const s = trimSlug(slug);
  if (!s) return { status: 400, json: { ok: false } };
  const cached = storeNoticesPublicCache.get(s);
  if (cached && cached.expiresAt > Date.now()) {
    return { status: cached.value.status, json: cached.value.json };
  }
  return runSingleFlight(`stores:api:notices:${s}`, async () => {
    const inFlightCached = storeNoticesPublicCache.get(s);
    if (inFlightCached && inFlightCached.expiresAt > Date.now()) {
      return { status: inFlightCached.value.status, json: inFlightCached.value.json };
    }
    const res = await fetch(`/api/stores/${encodeURIComponent(s)}/notices`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    const value = { status: res.status, json };
    if (res.ok) {
      storeNoticesPublicCache.set(s, { expiresAt: Date.now() + STORE_NOTICES_PUBLIC_CACHE_TTL_MS, value });
    } else {
      storeNoticesPublicCache.delete(s);
    }
    return value;
  });
}
