import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MyBusinessPage } from "@/components/business/MyBusinessPage";
import { loadMyBusinessServer } from "@/lib/business/load-my-business-server";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

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
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title="매장 운영"
        subtitle="주문, 상품, 운영 상태, 정산 관리"
        backHref="/mypage"
        hideCtaStrip
      />
      <div className={`${APP_MAIN_TAB_SCROLL_BODY_CLASS} pt-2 pb-8`}>
        <MyBusinessPage initialServerState={initialServerState} />
      </div>
    </div>
  );
}
