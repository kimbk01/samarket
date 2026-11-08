import type { SupabaseClient } from "@supabase/supabase-js";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { loadStoreRecentOrderCount90dCached } from "@/lib/stores/store-recent-order-count-cache";

/** 90일 최근 주문 건수 집계용 — `/api/stores/[slug]` 와 동일 */
export const RECENT_ORDER_STATUSES = [
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
  "completed",
  "refund_requested",
] as const;

/** Legacy `GET /api/stores/:slug` 의 `stores` select */
const STORE_PUBLIC_TAXONOMY_EMBED = ", store_categories ( slug, name )";

export const STORE_SELECT_LEGACY_DETAIL =
  "id, owner_user_id, store_name, slug, business_type, description, phone, region, city, district, address_line1, address_line2, barangay, canonical_lgu_id, lat, lng, business_hours_json, profile_image_url, gallery_images_json, is_open, delivery_available, pickup_available, visit_available, reservation_available, rating_avg, review_count, approval_status, is_visible, store_kind, created_at, updated_at" +
  STORE_PUBLIC_TAXONOMY_EMBED;

/** `GET /api/stores/:slug/summary` — 메뉴 없이 상단·배달 메타용 (2차 업종 포함) */
export const STORE_SELECT_SUMMARY =
  "id, owner_user_id, store_name, slug, business_type, description, phone, region, city, district, address_line1, address_line2, barangay, canonical_lgu_id, lat, lng, business_hours_json, profile_image_url, gallery_images_json, is_open, delivery_available, pickup_available, visit_available, reservation_available, rating_avg, review_count, approval_status, is_visible, store_kind, created_at, updated_at" +
  STORE_PUBLIC_TAXONOMY_EMBED +
  ", store_topics ( slug, name )";

/** `/menus`·`reviews-summary` 등 store id 만 필요할 때 */
export const STORE_SELECT_ID_SLUG_GATE = "id, slug, approval_status, is_visible";

/** `generateMetadata`·OG — 최소 컬럼만 (집계·메뉴 없음) */
export const STORE_SELECT_SEO =
  "store_name, slug, description, region, city, district, profile_image_url, approval_status, is_visible";

/** `GET /api/stores/[slug]/menus` — 공개 store 블록 + 품절 정렬 플래그 */
export const STORE_SELECT_MENUS_STORE =
  "id, slug, store_name, approval_status, is_visible, menu_sold_out_bottom";

/** `GET /api/stores/[slug]/delivery-eta` — 승인·가시 gate + 배달 ETA 에 필요한 컬럼만 */
export const STORE_DELIVERY_ETA_SELECT =
  "id, owner_user_id, slug, place_id, formatted_address, detail_address, address_line1, address_line2, lat, lng, delivery_available, business_hours_json, approval_status, is_visible";

export type ApprovedStoreLookupResult =
  | { ok: true; store: Record<string, unknown> }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "db_error"; message: string };

const APPROVED_STORE_SLUG_CACHE_TTL_MS = 30_000;
const approvedStoreSlugCache = new Map<
  string,
  { expiresAt: number; result: ApprovedStoreLookupResult }
>();

function approvedStoreSlugCacheKey(decodedSlug: string, selectColumns: string): string {
  return `${decodedSlug.trim().toLowerCase()}\0${selectColumns}`;
}

/**
 * 승인·공개 매장만 slug 로 조회. `approval_status` / `is_visible` 은 select 에 포함되어 있어야 함.
 */
export async function getApprovedStoreBySlug(
  sb: SupabaseClient,
  decodedSlug: string,
  selectColumns: string
): Promise<ApprovedStoreLookupResult> {
  const cacheKey = approvedStoreSlugCacheKey(decodedSlug, selectColumns);
  const hit = approvedStoreSlugCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.result;

  return runSingleFlight(`approved-store-slug:${cacheKey}`, async () => {
    const again = approvedStoreSlugCache.get(cacheKey);
    if (again && again.expiresAt > Date.now()) return again.result;

    const { data: store, error: storeErr } = await sb
      .from("stores")
      .select(selectColumns)
      .eq("slug", decodedSlug)
      .maybeSingle();

    let result: ApprovedStoreLookupResult;
    if (storeErr) {
      result = { ok: false, reason: "db_error", message: storeErr.message };
    } else {
      const row = store as Record<string, unknown> | null;
      if (!row || row.approval_status !== "approved" || row.is_visible !== true) {
        result = { ok: false, reason: "not_found" };
      } else {
        result = { ok: true, store: row };
      }
    }

    if (result.ok === true || result.reason === "not_found") {
      approvedStoreSlugCache.set(cacheKey, {
        expiresAt: Date.now() + APPROVED_STORE_SLUG_CACHE_TTL_MS,
        result,
      });
    }
    return result;
  });
}

export type StoreBySlugForViewerResult =
  | { ok: true; store: Record<string, unknown>; ownerHiddenPreview: boolean }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "db_error"; message: string };

/** select 문자열에 최상위 컬럼이 없으면 덧붙인다 (중복 컬럼 방지). */
function withTopLevelColumns(selectColumns: string, cols: readonly string[]): string {
  const top = new Set(
    selectColumns
      .replace(/\([^)]*\)/g, "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
  );
  const missing = cols.filter((c) => !top.has(c));
  return missing.length ? `${selectColumns}, ${missing.join(", ")}` : selectColumns;
}

/** 사장님 본인 숨김 매장 판정 결과 — 보는 사람별 짧은 캐시(같은 매장 화면이 API 5개를 동시에 부를 때 조회 1번) */
const OWNER_HIDDEN_PREVIEW_CACHE_TTL_MS = 15_000;
const ownerHiddenPreviewCache = new Map<
  string,
  { expiresAt: number; result: StoreBySlugForViewerResult }
>();

/**
 * 매장 화면 공개 판정 + 사장님 본인 숨김 매장 열람 (Owner 「본인 열람으로 수정」 2026-11-03) — 함수 하나.
 * - 승인·노출 매장 = `getApprovedStoreBySlug` 결과 그대로 (공용 30s 캐시).
 * - 그 밖: 로그인 사용자가 **그 매장 사장님**이고 승인 매장이면 숨김이어도 연다 (`ownerHiddenPreview: true`).
 *   본인 판정 결과는 slug·컬럼·보는 사람 키로만 15초 보관(다른 사람과 공유 안 함). 다른 사람·미승인은 not_found.
 * - `publicResult` — 뷰어 확인과 병렬로 이미 돌린 공용 조회 결과(있으면 다시 조회하지 않음).
 */
export async function getStoreBySlugForViewer(
  sb: SupabaseClient,
  decodedSlug: string,
  selectColumns: string,
  viewerUserId: string | null,
  opts?: { publicResult?: ApprovedStoreLookupResult }
): Promise<StoreBySlugForViewerResult> {
  const pub = opts?.publicResult ?? (await getApprovedStoreBySlug(sb, decodedSlug, selectColumns));
  if (pub.ok === true) return { ok: true, store: pub.store, ownerHiddenPreview: false };
  const viewer = viewerUserId?.trim() || "";
  if (pub.reason === "db_error" || !viewer) return pub;

  const cacheKey = `${approvedStoreSlugCacheKey(decodedSlug, selectColumns)}\0${viewer}`;
  const hit = ownerHiddenPreviewCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.result;

  const { data, error } = await sb
    .from("stores")
    .select(withTopLevelColumns(selectColumns, ["owner_user_id", "approval_status", "is_visible"]))
    .eq("slug", decodedSlug)
    .maybeSingle();
  if (error) return { ok: false, reason: "db_error", message: error.message };
  const row = data as Record<string, unknown> | null;
  const result: StoreBySlugForViewerResult =
    !row || row.approval_status !== "approved" || String(row.owner_user_id ?? "").trim() !== viewer
      ? { ok: false, reason: "not_found" }
      : { ok: true, store: row, ownerHiddenPreview: row.is_visible !== true };
  ownerHiddenPreviewCache.set(cacheKey, {
    expiresAt: Date.now() + OWNER_HIDDEN_PREVIEW_CACHE_TTL_MS,
    result,
  });
  return result;
}

/** DEF-64 — 인스턴스 공통 세대 변경 시 이 인스턴스의 30s slug lookup memory 전체 제거. */
export function clearApprovedStoreSlugCache(): void {
  approvedStoreSlugCache.clear();
  ownerHiddenPreviewCache.clear();
}

export function resetApprovedStoreSlugCacheForTests(): void {
  approvedStoreSlugCache.clear();
  ownerHiddenPreviewCache.clear();
}

export function invalidateApprovedStoreSlugCacheForSlug(decodedSlug: string): void {
  const slugKey = decodedSlug.trim().toLowerCase();
  if (!slugKey) return;
  for (const key of approvedStoreSlugCache.keys()) {
    if (key.startsWith(`${slugKey}\0`)) {
      approvedStoreSlugCache.delete(key);
    }
  }
  for (const key of ownerHiddenPreviewCache.keys()) {
    if (key.startsWith(`${slugKey}\0`)) {
      ownerHiddenPreviewCache.delete(key);
    }
  }
}

export type StoreCommerceMeta = {
  favoriteCount: number;
  recentOrderCount: number;
  viewerFavorited: boolean;
  canSell: boolean;
};

/**
 * 찜 수·최근 주문 수·뷰어 찜·판매 가능 — 기존 `/api/stores/[slug]` 와 동일 산식.
 */
export async function loadStoreCommerceMeta(
  sb: SupabaseClient,
  storeId: string,
  viewerUserId: string | null
): Promise<StoreCommerceMeta> {
  let favoriteCount = 0;
  let recentOrderCount = 0;
  let viewerFavorited = false;

  const viewerFavP = viewerUserId
    ? sb
        .from("store_favorites")
        .select("id")
        .eq("store_id", storeId)
        .eq("user_id", viewerUserId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  try {
    const [favRes, ordRes, permRes, viewerFavRes] = await Promise.all([
      sb.from("store_favorites").select("id", { count: "exact", head: true }).eq("store_id", storeId),
      /** v4 PERF-10 — 90일 주문 수는 매장 단위 짧은 메모리 캐시 (매 요청 count 제거) */
      loadStoreRecentOrderCount90dCached(sb, storeId),
      sb
        .from("store_sales_permissions")
        .select("allowed_to_sell, sales_status")
        .eq("store_id", storeId)
        .maybeSingle(),
      viewerFavP,
    ]);
    if (favRes.error) console.error("[store-meta] favorite count", favRes.error);
    else if (typeof favRes.count === "number") favoriteCount = favRes.count;
    if (typeof ordRes === "number") recentOrderCount = ordRes;
    if (viewerFavRes.error) console.error("[store-meta] viewer favorited", viewerFavRes.error);
    else viewerFavorited = !!viewerFavRes.data;
    const perm = permRes.data;
    const canSell = !!perm && perm.allowed_to_sell === true && perm.sales_status === "approved";
    return { favoriteCount, recentOrderCount, viewerFavorited, canSell };
  } catch (e) {
    console.error("[store-meta] aggregate counts", e);
  }

  return { favoriteCount, recentOrderCount, viewerFavorited, canSell: false };
}
