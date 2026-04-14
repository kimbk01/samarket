/**
 * 배달·매장(스토어 커머스) 클라이언트 API — 동일 URL 동시 요청 합류(runSingleFlight).
 * 컴포넌트에 `fetch("/api/stores/...")` 를 흩뿌리지 않고 한곳에서 유지한다.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";

function trimSlug(slug: string): string {
  return slug.trim();
}

export type StoreApiJsonResponse = { status: number; json: unknown };

/** GET /api/stores/:slug — 매장 상세·스티키바·카트 진입 등 동시 마운트 시 합류 */
export async function fetchStorePublicBySlugDeduped(slug: string): Promise<StoreApiJsonResponse> {
  const s = trimSlug(slug);
  if (!s) return { status: 400, json: { ok: false } };
  return runSingleFlight(`stores:api:public:${s}`, async () => {
    const res = await fetch(`/api/stores/${encodeURIComponent(s)}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}

/** GET /api/stores/products/:productId */
export async function fetchStoreProductPublicDeduped(productId: string): Promise<StoreApiJsonResponse> {
  const id = productId.trim();
  if (!id) return { status: 400, json: { ok: false } };
  return runSingleFlight(`stores:api:product:${id}`, async () => {
    const res = await fetch(`/api/stores/products/${encodeURIComponent(id)}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}

/** GET /api/stores/:slug/reviews */
export async function fetchStoreReviewsPublicDeduped(storeSlug: string): Promise<StoreApiJsonResponse> {
  const s = trimSlug(storeSlug);
  if (!s) return { status: 400, json: { ok: false } };
  return runSingleFlight(`stores:api:reviews:${s}`, async () => {
    const res = await fetch(`/api/stores/${encodeURIComponent(s)}/reviews`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}

/** GET /api/stores/taxonomy */
export async function fetchStoresTaxonomyDeduped(): Promise<StoreApiJsonResponse> {
  return runSingleFlight("stores:api:taxonomy", async () => {
    const res = await fetch("/api/stores/taxonomy", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}

/** GET /api/stores/browse?… */
export async function fetchStoresBrowseDeduped(queryString: string): Promise<StoreApiJsonResponse> {
  const qs = queryString.trim().replace(/^\?/, "");
  return runSingleFlight(`stores:api:browse:${qs}`, async () => {
    const res = await fetch(`/api/stores/browse?${qs}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}

/** GET /api/stores/home-feed… (쿼리 포함 전체 path 뒷부분, 예: `?lat=…` 또는 빈 문자열) */
export async function fetchStoresHomeFeedDeduped(pathAndQuery: string): Promise<StoreApiJsonResponse> {
  const suffix = pathAndQuery.startsWith("?") ? pathAndQuery : pathAndQuery ? `?${pathAndQuery}` : "";
  return runSingleFlight(`stores:api:home-feed:${suffix}`, async () => {
    const res = await fetch(`/api/stores/home-feed${suffix}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}

/** POST/DELETE /api/stores/:slug/favorite — 변이(단일 비행 불필요), 호출부 일원화용 */
export async function fetchStoreFavoriteMutation(
  slug: string,
  method: "POST" | "DELETE"
): Promise<StoreApiJsonResponse> {
  const s = trimSlug(slug);
  if (!s) return { status: 400, json: { ok: false } };
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

/** POST /api/me/store-orders (주문 생성) */
export async function postMeStoreOrder(body: Record<string, unknown>): Promise<StoreApiJsonResponse> {
  const res = await fetch("/api/me/store-orders", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
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
export async function fetchMeStoreOrdersHubSummaryDeduped(): Promise<StoreApiJsonResponse> {
  return runSingleFlight("me:store-orders:hub-summary:get", async () => {
    const res = await fetch("/api/me/store-orders?hub_summary=1", {
      credentials: "include",
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}
