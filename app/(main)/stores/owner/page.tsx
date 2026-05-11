import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { MyBusinessPage } from "@/components/business/MyBusinessPage";
import { loadMyBusinessServer } from "@/lib/business/load-my-business-server";

function firstQueryString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `/stores/owner` — 매장 오너 허브(캐노니컬). 레이아웃의 `BusinessAdminShell`(`entry="hub"`)이 헤더·사이드바를 담당한다.
 * `loadMyBusinessServer` 로 본문(대시보드)만 suspense.
 */
export default function StoresOwnerHubRoute({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <StoresOwnerHubDeferredBody searchParams={searchParams} />
    </Suspense>
  );
}

async function StoresOwnerHubDeferredBody({ searchParams }: PageProps) {
  const sp = await searchParams;
  const storeId = firstQueryString(sp.storeId)?.trim() ?? "";
  const initialServerState = await loadMyBusinessServer(storeId);
  return <MyBusinessPage initialServerState={initialServerState} />;
}
