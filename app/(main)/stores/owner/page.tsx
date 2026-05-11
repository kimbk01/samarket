import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { MyBusinessPage } from "@/components/business/MyBusinessPage";
import { OwnerHubShell } from "@/components/business/owner/OwnerHubShell";
import { loadMyBusinessServer } from "@/lib/business/load-my-business-server";

function firstQueryString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `/stores/owner` — 매장 오너 허브(캐노니컬).
 * `OwnerHubShell` 은 `loadMyBusinessServer` 와 분리해 첫 페인트·헤더·메뉴 뼈대가 먼저 내려가도록 한다.
 */
export default function StoresOwnerHubRoute({ searchParams }: PageProps) {
  return (
    <OwnerHubShell>
      <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
        <StoresOwnerHubDeferredBody searchParams={searchParams} />
      </Suspense>
    </OwnerHubShell>
  );
}

async function StoresOwnerHubDeferredBody({ searchParams }: PageProps) {
  const sp = await searchParams;
  const storeId = firstQueryString(sp.storeId)?.trim() ?? "";
  const initialServerState = await loadMyBusinessServer(storeId);
  return <MyBusinessPage initialServerState={initialServerState} />;
}
