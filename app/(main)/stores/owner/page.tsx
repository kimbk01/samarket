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
 * 옛 `/mypage/business`, `/my/business` 인덱스는 본 경로로 리다이렉트된다.
 */
export default function StoresOwnerHubRoute({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <StoresOwnerHubBody searchParams={searchParams} />
    </Suspense>
  );
}

async function StoresOwnerHubBody({ searchParams }: PageProps) {
  const sp = await searchParams;
  const storeId = firstQueryString(sp.storeId)?.trim() ?? "";
  const initialServerState = await loadMyBusinessServer(storeId);

  return (
    <OwnerHubShell>
      <MyBusinessPage initialServerState={initialServerState} />
    </OwnerHubShell>
  );
}
