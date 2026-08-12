import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { OwnerHubDashboardOrdersCacheSeed } from "@/components/business/owner/OwnerHubDashboardOrdersCacheSeed";
import { OwnerHubMeStoresCacheSeed } from "@/components/business/owner/OwnerHubMeStoresCacheSeed";
import { loadOwnerHubDashboardPackServer } from "@/lib/business/load-owner-hub-dashboard-server";
import { loadOwnerStoresPackCached } from "@/lib/me/load-owner-stores-pack-cached";
import {
  OWNER_ACTIVE_STORE_COOKIE,
  readOwnerActiveStoreIdFromCookieHeader,
  resolveOwnerActiveStoreRow,
} from "@/lib/delivery/owner/resolve-owner-active-store";
import { StoresOwnerLayoutClient } from "./StoresOwnerLayoutClient";

/**
 * `/stores/owner/*` — 서버에서 매장 목록을 한 번 읽어 클라 `fetchMeStoresListDeduped` 캐시에 시드한다.
 * 이후 `StoreBusinessGuard`·`BusinessAdminShell` 의 첫 GET 이 캐시 히트로 떨어져 왕복을 없앤다.
 * (`x-sam-owner-path` 는 `proxy.ts` 가 설정)
 *
 * ACTIVE_STORE first paint: cookie (client session mirror) → resolver → never invent stores[0] as preferred.
 */
export default async function StoresOwnerLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const ownerPath = h.get("x-sam-owner-path") ?? "";
  const skipServerStores = ownerPath.startsWith("/stores/owner/apply");

  let seedStores: import("@/lib/stores/db-store-mapper").StoreRow[] | null = null;
  let hubDashboardSeed: ReactNode = null;
  const isOwnerHubPath = ownerPath.replace(/\/+$/, "") === "/stores/owner";

  if (!skipServerStores) {
    const pack = await loadOwnerStoresPackCached();
    if (pack.ok && pack.stores.length > 0) {
      seedStores = pack.stores;
      if (isOwnerHubPath) {
        const cookieStore = await cookies();
        const preferredFromCookie =
          cookieStore.get(OWNER_ACTIVE_STORE_COOKIE)?.value?.trim() ||
          readOwnerActiveStoreIdFromCookieHeader(h.get("cookie")) ||
          null;
        const hubRow =
          resolveOwnerActiveStoreRow(pack.stores, {
            preferredStoreId: preferredFromCookie,
          }) ?? pack.stores[0]!;
        const dashboard = await loadOwnerHubDashboardPackServer(hubRow.id);
        if (dashboard) {
          hubDashboardSeed = (
            <OwnerHubDashboardOrdersCacheSeed storeId={hubRow.id} pack={dashboard} />
          );
        }
      }
    }
  }

  return (
    <>
      {seedStores ? <OwnerHubMeStoresCacheSeed stores={seedStores} /> : null}
      {hubDashboardSeed}
      <StoresOwnerLayoutClient initialStores={seedStores}>{children}</StoresOwnerLayoutClient>
    </>
  );
}
