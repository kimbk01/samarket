import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeliveryMenusApiPhaseMarks } from "@/lib/stores/delivery-menus-api-breakdown";
import {
  getApprovedStoreBySlug,
  STORE_SELECT_MENUS_STORE,
} from "@/lib/stores/get-approved-store-by-slug";
import {
  parseStoreMenusSnapshotPayload,
  parseStoreMenusSnapshotRpcData,
} from "@/lib/stores/store-menus-snapshot-assemble";
import { STORE_MENUS_SNAPSHOT_MENU_VERSION } from "@/lib/stores/store-menus-snapshot-counter";
import type { StoreMenusCatalogBody } from "@/lib/stores/store-menus-catalog-assemble";
import {
  STORE_MENUS_SNAPSHOT_RPC,
  tryLoadStoreMenusCatalogFromSnapshot,
} from "@/lib/stores/store-menus-snapshot";
import { loadStoreCommerceMetaCached } from "@/lib/stores/load-store-commerce-meta-cached";

export type { StoreMenusCatalogBody } from "@/lib/stores/store-menus-catalog-assemble";

const EMPTY_NOT_FOUND: StoreMenusCatalogBody = {
  ok: true,
  store: null,
  products: [],
  recommendedProductIds: [],
  popularProductIds: [],
  recommendedProducts: [],
  popularProducts: [],
  categories: [],
  meta: { source: "supabase", canSell: false, menu_sold_out_bottom: false },
};

export type FetchStoreMenusCatalogResult =
  | {
      ok: true;
      body: StoreMenusCatalogBody;
      marks: DeliveryMenusApiPhaseMarks;
      queryCount: number;
      dbMs: number;
      snapshotVia?: "counter_row" | "unified_rpc";
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
      marks: DeliveryMenusApiPhaseMarks;
      queryCount: number;
      dbMs: number;
    };

/**
 * Snapshot-only store menus catalog (LFC1-A SM1 — legacy multi-wave removed).
 * CRT-01 — slug 단위 route memory 캐시·single-flight 에 담기므로 **보는 사람과 무관한(anon) 스냅샷**만 읽는다.
 * `viewer_favorited` 는 요청마다 `composeStoreMenusCatalogForViewer` 로 합성.
 */
export async function fetchStoreMenusCatalog(
  sb: SupabaseClient,
  decodedSlug: string,
  startedAt: number
): Promise<FetchStoreMenusCatalogResult> {
  const marks: DeliveryMenusApiPhaseMarks = { authDone: startedAt };

  const snapResult = await tryLoadStoreMenusCatalogFromSnapshot(sb, decodedSlug, null, startedAt);
  if (snapResult) {
    marks.storeDone = performance.now();
    marks.productsDone = marks.storeDone;
    marks.popularDone = marks.storeDone;
    marks.metaDone = marks.storeDone;
    marks.payloadDone = performance.now();
    return {
      ok: true,
      body: snapResult.body,
      marks,
      queryCount: snapResult.breakdown.round_trips,
      dbMs: snapResult.breakdown.db_ms,
      snapshotVia: snapResult.breakdown.snapshot_via === "counter_row" ? "counter_row" : "unified_rpc",
    };
  }

  const storeRes = await getApprovedStoreBySlug(sb, decodedSlug, STORE_SELECT_MENUS_STORE);
  marks.storeDone = performance.now();
  marks.payloadDone = performance.now();
  const dbMs = Math.round(marks.payloadDone - startedAt);

  if (storeRes.ok === false) {
    if (storeRes.reason === "db_error") {
      return {
        ok: false,
        status: 500,
        body: { ok: false, error: storeRes.message },
        marks,
        queryCount: 1,
        dbMs,
      };
    }
    return {
      ok: false,
      status: 404,
      body: EMPTY_NOT_FOUND,
      marks,
      queryCount: 1,
      dbMs,
    };
  }

  return {
    ok: false,
    status: 503,
    body: { ok: false, error: "snapshot_unavailable" },
    marks,
    queryCount: 1,
    dbMs,
  };
}

/**
 * 사장님 본인 숨김 매장 메뉴 (Owner 「본인 열람으로 수정」 2026-11-03).
 * 공용 판정이 404 일 때만 호출. 본인 전용이라 route 메모리 캐시·snapshot counter row 에 넣지 않고
 * `get_store_menus_snapshot(p_user_id = 본인)` 1번만 읽는다 — DB 함수가 「승인 + (노출 또는 p_user_id = 사장님)」을
 * 직접 판정하므로 매장 행을 따로 다시 읽지 않는다 (마이그레이션 20271103120000).
 * null = 본인 매장 아님·미승인.
 */
export async function fetchStoreMenusCatalogOwnerHiddenPreview(
  sb: SupabaseClient,
  decodedSlug: string,
  viewerId: string | null
): Promise<StoreMenusCatalogBody | null> {
  const viewer = viewerId?.trim() || "";
  if (!viewer) return null;
  const { data, error } = await sb.rpc(STORE_MENUS_SNAPSHOT_RPC, {
    p_store_slug: decodedSlug.trim(),
    p_user_id: viewer,
    p_menu_version: STORE_MENUS_SNAPSHOT_MENU_VERSION,
  });
  if (error) {
    console.error("[fetchStoreMenusCatalogOwnerHiddenPreview] rpc", error.message);
    return null;
  }
  const payload = parseStoreMenusSnapshotRpcData(data);
  if (!payload?.store) return null;
  const body = parseStoreMenusSnapshotPayload(payload);
  if (!body) return null;
  return {
    ...body,
    meta: { ...body.meta, owner_hidden_preview: true } as StoreMenusCatalogBody["meta"],
  };
}

/**
 * CRT-01 — 공용(anon) 메뉴 본문 + 보는 사람 찜 여부. 게스트는 본문 그대로(viewer_favorited=false).
 * 찜 여부는 viewer 별 30s 메타 캐시(`loadStoreCommerceMetaCached`, store|viewer 키)에서 읽는다.
 */
export async function composeStoreMenusCatalogForViewer(
  sb: SupabaseClient | null,
  body: Record<string, unknown>,
  viewerId: string | null
): Promise<Record<string, unknown>> {
  const vid = viewerId?.trim() || null;
  if (!vid || !sb || body.ok !== true) return body;
  const store = body.store as { id?: unknown } | null | undefined;
  const storeId = typeof store?.id === "string" ? store.id.trim() : "";
  if (!storeId) return body;
  const meta = await loadStoreCommerceMetaCached(sb, storeId, vid);
  return {
    ...body,
    meta: {
      ...((body.meta as Record<string, unknown> | undefined) ?? {}),
      viewer_favorited: meta.viewerFavorited,
    },
  };
}
