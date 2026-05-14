import { headers } from "next/headers";
import { OwnerHubMeStoresCacheSeed } from "@/components/business/owner/OwnerHubMeStoresCacheSeed";
import { loadOwnerStoresPackCached } from "@/lib/me/load-owner-stores-pack-cached";
import { StoresOwnerLayoutClient } from "./StoresOwnerLayoutClient";

/**
 * `/stores/owner/*` — 서버에서 매장 목록을 한 번 읽어 클라 `fetchMeStoresListDeduped` 캐시에 시드한다.
 * 이후 `StoreBusinessGuard`·`BusinessAdminShell` 의 첫 GET 이 캐시 히트로 떨어져 왕복을 없앤다.
 * (`x-sam-owner-path` 는 `proxy.ts` 가 설정)
 */
export default async function StoresOwnerLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const ownerPath = h.get("x-sam-owner-path") ?? "";
  const skipServerStores = ownerPath.startsWith("/stores/owner/apply");

  let seedStores: import("@/lib/stores/db-store-mapper").StoreRow[] | null = null;
  if (!skipServerStores) {
    const pack = await loadOwnerStoresPackCached();
    if (pack.ok && pack.stores.length > 0) {
      seedStores = pack.stores;
    }
  }

  return (
    <>
      {seedStores ? <OwnerHubMeStoresCacheSeed stores={seedStores} /> : null}
      <StoresOwnerLayoutClient>{children}</StoresOwnerLayoutClient>
    </>
  );
}
