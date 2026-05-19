import { MyBusinessPage } from "@/components/business/MyBusinessPage";
import { OwnerHubDashboardOrdersCacheSeed } from "@/components/business/owner/OwnerHubDashboardOrdersCacheSeed";
import { OwnerHubMeStoresCacheSeed } from "@/components/business/owner/OwnerHubMeStoresCacheSeed";
import { loadMyBusinessServer } from "@/lib/business/load-my-business-server";

function firstQueryString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `/stores/owner` — 매장 오너 허브(캐노니컬). 매장 목록 시드는 `layout.tsx`(서버) 단일 경로.
 */
export default async function StoresOwnerHubRoute({ searchParams }: PageProps) {
  const sp = await searchParams;
  const storeId = firstQueryString(sp.storeId)?.trim() ?? "";
  const initialServerState = await loadMyBusinessServer(storeId);
  const remoteSeed =
    initialServerState.kind === "remote" ?
      <>
        <OwnerHubMeStoresCacheSeed stores={initialServerState.stores} />
        {initialServerState.dashboard ?
          <OwnerHubDashboardOrdersCacheSeed
            storeId={initialServerState.row.id}
            pack={initialServerState.dashboard}
          />
        : null}
      </>
    : null;
  return (
    <>
      {remoteSeed}
      <MyBusinessPage initialServerState={initialServerState} />
    </>
  );
}
