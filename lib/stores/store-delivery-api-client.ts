/**
 * 배달·매장(스토어 커머스) 클라이언트 API — 동일 URL 동시 요청 합류(runSingleFlight).
 * 컴포넌트에 `fetch("/api/stores/...")` 를 흩뿌리지 않고 한곳에서 유지한다.
 */
import { forgetSingleFlight, getSingleFlightPromise, runSingleFlight } from "@/lib/http/run-single-flight";
import {
  markStoresHomeHubSummaryNetwork,
  resolveStoresHomePrewarmLanguage,
  type StoresHomeClientCallSource,
} from "@/lib/stores/stores-home-network-guards";
import {
  beginMenusColdFillClientSession,
  markMenusColdFillClientCacheHit,
  markMenusColdFillFetchHeaders,
  markMenusColdFillJsonParsed,
  markMenusColdFillResponseDownload,
} from "@/lib/stores/menus-cold-fill-deep-breakdown";
import { logDeliveryFetchTrace } from "@/lib/dibay/delivery-waterfall-trace";

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
const STORE_TAXONOMY_PUBLIC_CACHE_TTL_MS = 5 * 60 * 1000;
const storeTaxonomyPublicCache = new Map<string, { expiresAt: number; value: StoreApiJsonResponse }>();

function storesTaxonomyPublicCacheKey(language?: string): string {
  return `taxonomy:${resolveStoresHomePrewarmLanguage(language)}`;
}

function storesTaxonomySingleFlightKey(language?: string): string {
  return `stores:api:taxonomy:${resolveStoresHomePrewarmLanguage(language)}`;
}

function storesHomeClientCallSourceHeader(
  source?: StoresHomeClientCallSource
): HeadersInit | undefined {
  if (!source) return undefined;
  return { "x-samarket-client-call-source": source };
}

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

/** PTR·강제 reload — buyer hub 카드 캐시·single-flight 무효화 */
export function invalidateMeStoreOrdersHubSummaryCache(): void {
  storeHubSummaryCache.delete("hub_summary=1");
  forgetSingleFlight("me:store-orders:hub-summary:get");
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
    logDeliveryFetchTrace({
      api: `/api/stores/${s}/summary`,
      component: "store-delivery-api-client",
      reason: "fetchStoreSummaryDeduped_network",
    });
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
export async function fetchStoreMenusDeduped(
  slug: string,
  opts?: { fetchPath?: string }
): Promise<StoreApiJsonResponse> {
  const s = trimSlug(slug);
  const fetchPath = opts?.fetchPath ?? "fetchStoreMenusDeduped";
  if (!s) return { status: 400, json: { ok: false } };
  const cached = storeMenusPublicCache.get(s);
  if (cached && cached.expiresAt > Date.now()) {
    beginMenusColdFillClientSession(s, fetchPath);
    markMenusColdFillClientCacheHit(s, fetchPath);
    return { status: cached.value.status, json: cached.value.json };
  }
  return runSingleFlight(`stores:api:menus:${s}`, async () => {
    const inFlightCached = storeMenusPublicCache.get(s);
    if (inFlightCached && inFlightCached.expiresAt > Date.now()) {
      beginMenusColdFillClientSession(s, fetchPath);
      markMenusColdFillClientCacheHit(s, fetchPath);
      return { status: inFlightCached.value.status, json: inFlightCached.value.json };
    }
    beginMenusColdFillClientSession(s, fetchPath);
    const res = await fetch(`/api/stores/${encodeURIComponent(s)}/menus`, { cache: "no-store" });
    logDeliveryFetchTrace({
      api: `/api/stores/${s}/menus`,
      component: "store-delivery-api-client",
      reason: "fetchStoreMenusDeduped_network",
    });
    markMenusColdFillFetchHeaders(s);
    const text = await res.text();
    markMenusColdFillResponseDownload(s, text.length);
    let json: unknown = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    markMenusColdFillJsonParsed(s);
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
    logDeliveryFetchTrace({
      api: `/api/stores/${s}/reviews-summary`,
      component: "store-delivery-api-client",
      reason: "fetchStoreReviewsSummaryDeduped_network",
    });
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

export function isStoresTaxonomyClientCacheFresh(language?: string): boolean {
  const hit = storeTaxonomyPublicCache.get(storesTaxonomyPublicCacheKey(language));
  return !!hit && hit.expiresAt > Date.now();
}

/** 동기 peek — 홈 카테고리 마운트 시 TTL API 스냅샷 (seed와 별도) */
export function peekStoresTaxonomyClientCache(language?: string): StoreApiJsonResponse | null {
  const hit = storeTaxonomyPublicCache.get(storesTaxonomyPublicCacheKey(language));
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return { status: hit.value.status, json: hit.value.json };
}

/** PTR·강제 reload — 진행 중 taxonomy single-flight 끊기 */
export function forgetStoresTaxonomyFetchSingleFlight(
  language?: import("@/lib/i18n/config").AppLanguageCode
): void {
  forgetSingleFlight(storesTaxonomySingleFlightKey(language));
}

/** taxonomy Map·single-flight 만 비움 — 스냅샷 무효화는 `clearStoresTaxonomyClientCache` */
export function purgeStoresTaxonomyNetworkCache(
  language?: import("@/lib/i18n/config").AppLanguageCode
): void {
  const langsToForget = new Set<string>();
  for (const key of [...storeTaxonomyPublicCache.keys()]) {
    if (!key.startsWith("taxonomy:")) continue;
    storeTaxonomyPublicCache.delete(key);
    langsToForget.add(key.slice("taxonomy:".length));
  }
  if (language != null) {
    langsToForget.add(resolveStoresHomePrewarmLanguage(language));
  }
  for (const lang of langsToForget) {
    forgetStoresTaxonomyFetchSingleFlight(lang as import("@/lib/i18n/config").AppLanguageCode);
  }
  if (langsToForget.size === 0) {
    forgetStoresTaxonomyFetchSingleFlight(language);
  }
}

/** 어드민이 공개 taxonomy 를 바꾼 직후 등 — 다음 `fetchStoresTaxonomyDeduped` 가 네트워크를 탄다 */
export function clearStoresTaxonomyClientCache(
  language?: import("@/lib/i18n/config").AppLanguageCode
): void {
  purgeStoresTaxonomyNetworkCache(language);
  queueMicrotask(() => {
    void import("@/lib/stores/browse-taxonomy-snapshot").then((m) => m.invalidateBrowseTaxonomySnapshot());
  });
}

export type FetchStoresTaxonomyDedupedOptions = {
  /** TTL·single-flight 파티션 — 미지정 시 UI 런타임 언어 */
  language?: string;
  clientCallSource?: StoresHomeClientCallSource;
};

/** GET /api/stores/taxonomy — 5분 TTL + locale single-flight */
export async function fetchStoresTaxonomyDeduped(
  opts: FetchStoresTaxonomyDedupedOptions = {}
): Promise<StoreApiJsonResponse> {
  const lang = resolveStoresHomePrewarmLanguage(opts.language);
  const k = storesTaxonomyPublicCacheKey(lang);
  const flightKey = storesTaxonomySingleFlightKey(lang);
  const cached = storeTaxonomyPublicCache.get(k);
  if (cached && cached.expiresAt > Date.now()) {
    return { status: cached.value.status, json: cached.value.json };
  }
  return runSingleFlight(flightKey, async () => {
    const inflightCached = storeTaxonomyPublicCache.get(k);
    if (inflightCached && inflightCached.expiresAt > Date.now()) {
      return { status: inflightCached.value.status, json: inflightCached.value.json };
    }
    const { storesApiAcceptLanguageHeader } = await import("@/lib/i18n/language-preference");
    const res = await fetch("/api/stores/taxonomy", {
      cache: "no-store",
      headers: {
        ...storesApiAcceptLanguageHeader(lang),
        ...storesHomeClientCallSourceHeader(opts.clientCallSource),
      },
    });
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

const STORES_BROWSE_CLIENT_CACHE_TTL_MS = 30_000;
const STORES_BROWSE_MIN_REFETCH_GAP_MS = 10_000;
const storesBrowseClientCache = new Map<
  string,
  { expiresAt: number; value: StoreApiJsonResponse }
>();
const storesBrowseLastNetworkAt = new Map<string, number>();

function browseQueryBypassesCache(qs: string): boolean {
  try {
    const sp = new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : qs);
    return sp.get("fresh") === "1" || sp.get("bypassCache") === "1";
  } catch {
    return false;
  }
}

export type StoresBrowseClientCacheSnapshot = {
  rows: import("@/lib/stores/browse-api-types").BrowseStoreListItem[];
  source: "supabase" | "supabase_unconfigured" | null;
};

function parseStoresBrowseClientCacheJson(json: unknown): StoresBrowseClientCacheSnapshot | null {
  const j = json as {
    ok?: boolean;
    stores?: unknown;
    meta?: { source?: string };
  };
  const src = j?.meta?.source;
  const okSources = src === "supabase" || src === "supabase_unconfigured";
  if (!j?.ok || !Array.isArray(j.stores) || !okSources) return null;
  return {
    rows: j.stores as StoresBrowseClientCacheSnapshot["rows"],
    source: src as StoresBrowseClientCacheSnapshot["source"],
  };
}

function storesBrowseFlightKey(
  language: import("@/lib/i18n/config").AppLanguageCode,
  queryString: string
): string {
  const qs = queryString.trim().replace(/^\?/, "");
  return `stores:api:browse:${language}:${qs}`;
}

/** browse 마운트 직전 동기 적용 — prewarm·재진입 단일비행 캐시 */
export function peekStoresBrowseClientCache(
  queryString: string,
  opts?: { language?: import("@/lib/i18n/config").AppLanguageCode }
): StoresBrowseClientCacheSnapshot | null {
  const qs = queryString.trim().replace(/^\?/, "");
  const lang = opts?.language ?? "en";
  const flightKey = storesBrowseFlightKey(lang, qs);
  const hit = storesBrowseClientCache.get(flightKey);
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return parseStoresBrowseClientCacheJson(hit.value.json);
}

/** `/stores` 업종 그리드·browse 진입 — `stores-browse-prewarm-coordinator` 경유 */
export { prewarmStoresBrowseListClient } from "@/lib/stores/stores-browse-prewarm-coordinator";

/** browse 클라이언트 TTL·min-refetch gap — PTR 직전 삭제 */
export function invalidateStoresBrowseClientCache(
  queryString: string,
  language: import("@/lib/i18n/config").AppLanguageCode = "en"
): void {
  const qs = queryString.trim().replace(/^\?/, "");
  const flightKey = storesBrowseFlightKey(language, qs);
  storesBrowseClientCache.delete(flightKey);
  storesBrowseLastNetworkAt.delete(flightKey);
  try {
    const sp = new URLSearchParams(qs);
    if (sp.get("fresh") !== "1") {
      sp.set("fresh", "1");
      const freshKey = storesBrowseFlightKey(language, sp.toString());
      storesBrowseClientCache.delete(freshKey);
      storesBrowseLastNetworkAt.delete(freshKey);
    }
  } catch {
    /* noop */
  }
}

/** PTR·강제 reload — 진행 중 browse single-flight 끊기(기본·fresh=1 키) */
export function forgetStoresBrowseFetchSingleFlight(
  queryString: string,
  language: import("@/lib/i18n/config").AppLanguageCode = "en"
): void {
  const qs = queryString.trim().replace(/^\?/, "");
  forgetSingleFlight(storesBrowseFlightKey(language, qs));
  try {
    const sp = new URLSearchParams(qs);
    sp.delete("fresh");
    sp.delete("bypassCache");
    const base = sp.toString();
    if (base) forgetSingleFlight(storesBrowseFlightKey(language, base));
    const freshSp = new URLSearchParams(base);
    freshSp.set("fresh", "1");
    forgetSingleFlight(storesBrowseFlightKey(language, freshSp.toString()));
  } catch {
    /* noop */
  }
}

/** GET /api/stores/browse?… */
export async function fetchStoresBrowseDeduped(
  queryString: string,
  opts?: { language?: import("@/lib/i18n/config").AppLanguageCode }
): Promise<StoreApiJsonResponse> {
  const qs = queryString.trim().replace(/^\?/, "");
  const lang = opts?.language ?? "en";
  const flightKey = storesBrowseFlightKey(lang, qs);
  const bypass = browseQueryBypassesCache(qs);
  const now = Date.now();
  if (!bypass) {
    const hit = storesBrowseClientCache.get(flightKey);
    if (hit && hit.expiresAt > now) {
      return hit.value;
    }
    const lastNet = storesBrowseLastNetworkAt.get(flightKey) ?? 0;
    if (now - lastNet < STORES_BROWSE_MIN_REFETCH_GAP_MS && hit) {
      return hit.value;
    }
  }
  return runSingleFlight(flightKey, async () => {
    if (!bypass) {
      const again = storesBrowseClientCache.get(flightKey);
      const againNow = Date.now();
      if (again && again.expiresAt > againNow) {
        return again.value;
      }
      const lastNet = storesBrowseLastNetworkAt.get(flightKey) ?? 0;
      if (againNow - lastNet < STORES_BROWSE_MIN_REFETCH_GAP_MS && again) {
        return again.value;
      }
    }
    const { storesApiAcceptLanguageHeader } = await import("@/lib/i18n/language-preference");
    const res = await fetch(`/api/stores/browse?${qs}`, {
      cache: "no-store",
      headers: storesApiAcceptLanguageHeader(lang),
    });
    const json = await res.json().catch(() => ({}));
    const value: StoreApiJsonResponse = { status: res.status, json };
    if (!bypass && (res.ok || res.status === 401 || res.status === 403)) {
      const storedAt = Date.now();
      storesBrowseLastNetworkAt.set(flightKey, storedAt);
      storesBrowseClientCache.set(flightKey, {
        value,
        expiresAt: storedAt + STORES_BROWSE_CLIENT_CACHE_TTL_MS,
      });
    }
    return value;
  });
}

/** GET /api/stores/home-feed… (쿼리 포함 전체 path 뒷부분, 예: `?lat=…` 또는 빈 문자열) */
export async function fetchStoresHomeFeedDeduped(
  pathAndQuery: string,
  opts: {
    signal?: AbortSignal;
    language?: import("@/lib/i18n/config").AppLanguageCode | string;
    clientCallSource?: StoresHomeClientCallSource;
  } = {}
): Promise<StoreApiJsonResponse> {
  const suffix = pathAndQuery.startsWith("?") ? pathAndQuery : pathAndQuery ? `?${pathAndQuery}` : "";
  const lang = resolveStoresHomePrewarmLanguage(opts.language);
  const flight = runSingleFlight(`stores:api:home-feed:${lang}:${suffix}`, async () => {
    const { storesApiAcceptLanguageHeader } = await import("@/lib/i18n/language-preference");
    const res = await fetch(`/api/stores/home-feed${suffix}`, {
      cache: "no-store",
      headers: {
        ...storesApiAcceptLanguageHeader(lang),
        ...storesHomeClientCallSourceHeader(opts.clientCallSource),
      },
      signal: opts.signal,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
  return withAbortSignal(flight, opts.signal);
}

/** PTR·강제 reload — 진행 중 single-flight 끊고 새 home-feed 요청 */
export function forgetStoresHomeFeedFetchSingleFlight(
  pathAndQuery: string,
  language?: import("@/lib/i18n/config").AppLanguageCode | string
): void {
  const suffix = pathAndQuery.startsWith("?") ? pathAndQuery : pathAndQuery ? `?${pathAndQuery}` : "";
  forgetSingleFlight(`stores:api:home-feed:${resolveStoresHomePrewarmLanguage(language)}:${suffix}`);
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
const ME_STORE_ORDER_DETAIL_CACHE_TTL_MS = 45_000;
const meStoreOrderDetailCache = new Map<string, { expiresAt: number; value: StoreApiJsonResponse }>();
const meStoreOrderEventsCache = new Map<string, { expiresAt: number; value: StoreApiJsonResponse }>();

function peekMeStoreOrderResponseCache(
  map: Map<string, { expiresAt: number; value: StoreApiJsonResponse }>,
  orderId: string
): StoreApiJsonResponse | null {
  const id = orderId.trim();
  if (!id) return null;
  const hit = map.get(id);
  if (!hit || hit.expiresAt <= Date.now()) {
    if (hit) map.delete(id);
    return null;
  }
  return hit.value;
}

function primeMeStoreOrderResponseCache(
  map: Map<string, { expiresAt: number; value: StoreApiJsonResponse }>,
  orderId: string,
  value: StoreApiJsonResponse,
  ttlMs: number
): void {
  const id = orderId.trim();
  if (!id || value.status < 200 || value.status >= 300) {
    if (id) map.delete(id);
    return;
  }
  const json = value.json as { ok?: boolean };
  if (json?.ok !== true) {
    map.delete(id);
    return;
  }
  map.set(id, { expiresAt: Date.now() + ttlMs, value });
}

/** 펼침 패널·리뷰 슬라이드 — 상세+이벤트 선로드 */
export function warmMeStoreOrderExpandDetail(orderId: string): void {
  const id = orderId.trim();
  if (!id) return;
  void fetchMeStoreOrderDetailDeduped(id);
  void fetchMeStoreOrderEventsDeduped(id);
}

export function peekMeStoreOrderDetailCache(orderId: string): StoreApiJsonResponse | null {
  return peekMeStoreOrderResponseCache(meStoreOrderDetailCache, orderId);
}

export function peekMeStoreOrderEventsCache(orderId: string): StoreApiJsonResponse | null {
  return peekMeStoreOrderResponseCache(meStoreOrderEventsCache, orderId);
}

/** PATCH/DELETE 후 목록·펼침 캐시 무효화 */
export function invalidateMeStoreOrderClientCaches(orderId: string): void {
  const id = orderId.trim();
  if (!id) return;
  meStoreOrderDetailCache.delete(id);
  meStoreOrderEventsCache.delete(id);
  forgetSingleFlight(`me:store-order:detail:get:${id}`);
  forgetSingleFlight(`me:store-order:events:get:${id}`);
}

export async function fetchMeStoreOrderDetailDeduped(
  orderId: string,
  opts?: { force?: boolean }
): Promise<StoreApiJsonResponse> {
  const id = orderId.trim();
  if (!id) return { status: 400, json: { ok: false } };
  const force = opts?.force === true;
  if (!force) {
    const cached = peekMeStoreOrderResponseCache(meStoreOrderDetailCache, id);
    if (cached) return cached;
  }
  // force=true 시 별도 flight key로 스냅샷 bypass + ?fresh=1 요청
  const flightKey = force
    ? `me:store-order:detail:get:${id}:fresh`
    : `me:store-order:detail:get:${id}`;
  if (!force) {
    const inFlight = getSingleFlightPromise<StoreApiJsonResponse>(flightKey);
    if (inFlight) {
      const value = await inFlight;
      primeMeStoreOrderResponseCache(
        meStoreOrderDetailCache,
        id,
        value,
        ME_STORE_ORDER_DETAIL_CACHE_TTL_MS
      );
      return value;
    }
  }
  return runSingleFlight(flightKey, async () => {
    const url = force
      ? `/api/me/store-orders/${encodeURIComponent(id)}?fresh=1`
      : `/api/me/store-orders/${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    const value = { status: res.status, json };
    // 신선한 응답을 일반 캐시에도 반영 → 이후 non-force 호출에 재사용
    primeMeStoreOrderResponseCache(
      meStoreOrderDetailCache,
      id,
      value,
      ME_STORE_ORDER_DETAIL_CACHE_TTL_MS
    );
    return value;
  });
}

/** GET /api/me/store-orders/:orderId/events — 주문 이벤트 원장(타임라인 보강) */
export async function fetchMeStoreOrderEventsDeduped(
  orderId: string,
  opts?: { force?: boolean }
): Promise<StoreApiJsonResponse> {
  const id = orderId.trim();
  if (!id) return { status: 400, json: { ok: false } };
  const force = opts?.force === true;
  if (!force) {
    const cached = peekMeStoreOrderResponseCache(meStoreOrderEventsCache, id);
    if (cached) return cached;
  }
  const flightKey = force
    ? `me:store-order:events:get:${id}:fresh`
    : `me:store-order:events:get:${id}`;
  if (!force) {
    const inFlight = getSingleFlightPromise<StoreApiJsonResponse>(flightKey);
    if (inFlight) {
      const value = await inFlight;
      primeMeStoreOrderResponseCache(
        meStoreOrderEventsCache,
        id,
        value,
        ME_STORE_ORDER_DETAIL_CACHE_TTL_MS
      );
      return value;
    }
  }
  return runSingleFlight(flightKey, async () => {
    const url = force
      ? `/api/me/store-orders/${encodeURIComponent(id)}/events?fresh=1`
      : `/api/me/store-orders/${encodeURIComponent(id)}/events`;
    const res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    const value = { status: res.status, json };
    primeMeStoreOrderResponseCache(
      meStoreOrderEventsCache,
      id,
      value,
      ME_STORE_ORDER_DETAIL_CACHE_TTL_MS
    );
    return value;
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
  invalidateMeStoreOrderClientCaches(id);
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
  invalidateMeStoreOrderClientCaches(id);
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
  opts: { signal?: AbortSignal; force?: boolean } = {}
): Promise<StoreApiJsonResponse> {
  const cacheKey = "hub_summary=1";
  const cached = peekStoreHubSummaryCache(cacheKey);
  if (cached && !opts.force) {
    return { status: cached.status, json: cached.json };
  }
  const flight = runSingleFlight("me:store-orders:hub-summary:get", async () => {
    const inFlightCached = peekStoreHubSummaryCache(cacheKey);
    if (inFlightCached && !opts.force) {
      return { status: inFlightCached.status, json: inFlightCached.json };
    }
    markStoresHomeHubSummaryNetwork();
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

/**
 * slug 공개 GET 클라이언트 Map + in-flight — 영업시간·is_open 저장 직후 stale 방지.
 * 서버 45s 캐시는 `invalidateStorePublicCachesForSlug` 가 별도 처리.
 */
export function purgeStoreSlugPublicClientCaches(slug: string): void {
  const s = trimSlug(slug);
  if (!s) return;
  storePublicCache.delete(s);
  storeSummaryPublicCache.delete(s);
  storeMenusPublicCache.delete(s);
  storeReviewsSummaryCache.delete(s);
  storeBannersPublicCache.delete(s);
  storeNoticesPublicCache.delete(s);
  forgetSingleFlight(`stores:api:summary:${s}`);
  forgetSingleFlight(`stores:api:menus:${s}`);
  forgetSingleFlight(`stores:api:public:${s}`);
  forgetSingleFlight(`stores:api:reviews-summary:${s}`);
  forgetSingleFlight(`stores:api:banners:${s}`);
  forgetSingleFlight(`stores:api:notices:${s}`);
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
