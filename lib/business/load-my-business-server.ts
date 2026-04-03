import { cache } from "react";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadMeStoresListForUser, loadStoreProductsForOwner } from "@/lib/me/load-me-stores-for-user";
import {
  dbStoreProductToBusinessProduct,
  dbStoreToBusinessProfile,
  type StoreProductRow,
  type StoreRow,
} from "@/lib/stores/db-store-mapper";
import { pickPreferredOwnerStore } from "@/lib/stores/owner-lite-external-store";
import type { BusinessProduct, BusinessProfile } from "@/lib/types/business";

export type MyBusinessServerInitial =
  | { kind: "unauth" }
  | { kind: "config" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "remote"; row: StoreRow; profile: BusinessProfile; products: BusinessProduct[] };

function pickStoreRow(stores: StoreRow[], preferredStoreId: string): StoreRow {
  const preferred = preferredStoreId.trim();
  const byPreferred = preferred ? stores.find((s) => s.id === preferred) : undefined;
  return byPreferred ?? pickPreferredOwnerStore(stores) ?? stores[0]!;
}

/**
 * `/my/business` RSC 선로딩 — `MyBusinessPage.loadRemote` 와 동일 분기(상품은 승인 매장만).
 */
export const loadMyBusinessServer = cache(async (preferredStoreId: string): Promise<MyBusinessServerInitial> => {
  const userId = await getRouteUserId();
  if (!userId) return { kind: "unauth" };

  const supabase = tryGetSupabaseForStores();
  if (!supabase) return { kind: "config" };

  const pack = await loadMeStoresListForUser(supabase, userId);
  if (!pack.ok) {
    return { kind: "error", message: pack.error };
  }

  const stores = pack.stores;
  if (stores.length === 0) return { kind: "empty" };

  const row = pickStoreRow(stores, preferredStoreId);
  let products: BusinessProduct[] = [];
  if (row.approval_status === "approved") {
    const pr = await loadStoreProductsForOwner(supabase, userId, row.id);
    if (pr.ok) {
      products = pr.products.map((p) => dbStoreProductToBusinessProduct(p as StoreProductRow, row.id));
    }
  }

  const baseProfile = dbStoreToBusinessProfile(row);
  const profile: BusinessProfile = {
    ...baseProfile,
    productCount: products.length,
  };

  return { kind: "remote", row, profile, products };
});
