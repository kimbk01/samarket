import { cache } from "react";
import {
  dbStoreToBusinessProfile,
  type StoreRow,
} from "@/lib/stores/db-store-mapper";
import { pickPreferredOwnerStore } from "@/lib/stores/pick-preferred-owner-store";
import type { BusinessProduct, BusinessProfile } from "@/lib/types/business";
import { loadOwnerStoresPackCached } from "@/lib/me/load-owner-stores-pack-cached";
import {
  loadOwnerHubDashboardPackServer,
  type OwnerHubDashboardPack,
} from "@/lib/business/load-owner-hub-dashboard-server";

export type MyBusinessServerInitial =
  | { kind: "unauth" }
  | { kind: "config" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | {
      kind: "remote";
      row: StoreRow;
      profile: BusinessProfile;
      products: BusinessProduct[];
      stores: StoreRow[];
      dashboard: OwnerHubDashboardPack | null;
    };

function pickStoreRow(stores: StoreRow[], preferredStoreId: string): StoreRow {
  const preferred = preferredStoreId.trim();
  const byPreferred = preferred ? stores.find((s) => s.id === preferred) : undefined;
  return byPreferred ?? pickPreferredOwnerStore(stores) ?? stores[0]!;
}

/**
 * `/my/business` RSC 선로딩 — `MyBusinessPage.loadRemote` 와 동일 분기(상품은 승인 매장만).
 * 매장 목록은 `loadOwnerStoresPackCached` 단일 비행(레이아웃·본문 공유).
 */
export const loadMyBusinessServer = cache(async (preferredStoreId: string): Promise<MyBusinessServerInitial> => {
  const packAll = await loadOwnerStoresPackCached();
  if (!packAll.ok) {
    if ("kind" in packAll && packAll.kind === "unauth") return { kind: "unauth" };
    if ("kind" in packAll && packAll.kind === "config") return { kind: "config" };
    return { kind: "error", message: "error" in packAll ? packAll.error : "load_failed" };
  }

  const stores = packAll.stores;
  if (stores.length === 0) return { kind: "empty" };

  const row = pickStoreRow(stores, preferredStoreId);
  // IMPORTANT (perf): do not block first RSC response on owner products list.
  // The client (`MyBusinessPage.loadRemote`) loads products after hydration.
  const products: BusinessProduct[] = [];

  const baseProfile = dbStoreToBusinessProfile(row);
  const profile: BusinessProfile = {
    ...baseProfile,
    productCount: products.length,
  };

  const dashboard = await loadOwnerHubDashboardPackServer(row.id);

  return { kind: "remote", row, profile, products, stores, dashboard };
});
