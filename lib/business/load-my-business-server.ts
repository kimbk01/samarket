import { cache } from "react";
import { cookies } from "next/headers";
import {
  dbStoreToBusinessProfile,
  type StoreRow,
} from "@/lib/stores/db-store-mapper";
import {
  OWNER_ACTIVE_STORE_COOKIE,
  resolveOwnerActiveStoreRow,
} from "@/lib/delivery/owner/resolve-owner-active-store";
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

function pickStoreRow(
  stores: StoreRow[],
  routeStoreId: string,
  preferredStoreId: string | null
): StoreRow | null {
  return resolveOwnerActiveStoreRow(stores, {
    routeStoreId,
    preferredStoreId,
  });
}

/**
 * `/my/business` RSC 선로딩 — `MyBusinessPage.loadRemote` 와 동일 분기(상품은 승인 매장만).
 * 매장 목록은 `loadOwnerStoresPackCached` 단일 비행(레이아웃·본문 공유).
 * Active store = MODEL A (`resolveOwnerActiveStoreRow`) — cookie preferred + URL route.
 */
export const loadMyBusinessServer = cache(async (routeStoreId: string): Promise<MyBusinessServerInitial> => {
  const packAll = await loadOwnerStoresPackCached();
  if (!packAll.ok) {
    if ("kind" in packAll && packAll.kind === "unauth") return { kind: "unauth" };
    if ("kind" in packAll && packAll.kind === "config") return { kind: "config" };
    return { kind: "error", message: "error" in packAll ? packAll.error : "load_failed" };
  }

  const stores = packAll.stores;
  if (stores.length === 0) return { kind: "empty" };

  const cookieStore = await cookies();
  const preferredFromCookie = cookieStore.get(OWNER_ACTIVE_STORE_COOKIE)?.value?.trim() || null;
  const row = pickStoreRow(stores, routeStoreId, preferredFromCookie);
  if (!row) return { kind: "empty" };
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
