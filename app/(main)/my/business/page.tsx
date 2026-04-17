import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function MyBusinessRoute({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={3} />}>
      <MyBusinessRouteBody searchParams={searchParams} />
    </Suspense>
  );
}

async function MyBusinessRouteBody({ searchParams }: PageProps) {
  const sp = await searchParams;
  const storeId = Array.isArray(sp.storeId) ? sp.storeId[0] : sp.storeId;
  return redirect(
    storeId?.trim() ? `/mypage/business?storeId=${encodeURIComponent(storeId.trim())}` : "/mypage/business"
  );
}
