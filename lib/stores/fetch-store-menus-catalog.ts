import type { SupabaseClient } from "@supabase/supabase-js";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import type { DeliveryMenusApiPhaseMarks } from "@/lib/stores/delivery-menus-api-breakdown";
import {
  getApprovedStoreBySlug,
  STORE_SELECT_MENUS_STORE,
} from "@/lib/stores/get-approved-store-by-slug";
import type { StoreMenusCatalogBody } from "@/lib/stores/store-menus-catalog-assemble";
import { tryLoadStoreMenusCatalogFromSnapshot } from "@/lib/stores/store-menus-snapshot";

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

/** Snapshot-only store menus catalog (LFC1-A SM1 — legacy multi-wave removed). */
export async function fetchStoreMenusCatalog(
  sb: SupabaseClient,
  decodedSlug: string,
  startedAt: number
): Promise<FetchStoreMenusCatalogResult> {
  const marks: DeliveryMenusApiPhaseMarks = { authDone: startedAt };

  const viewerId = await getRouteUserId();
  marks.authDone = performance.now();

  const snapResult = await tryLoadStoreMenusCatalogFromSnapshot(sb, decodedSlug, viewerId, startedAt);
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
