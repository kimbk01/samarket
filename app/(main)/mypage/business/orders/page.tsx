import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function MypageBusinessOrdersPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={3} />}>
      <MypageBusinessOrdersPageBody searchParams={searchParams} />
    </Suspense>
  );
}

async function MypageBusinessOrdersPageBody({ searchParams }: PageProps) {
  const sp = await searchParams;
  const storeId = Array.isArray(sp.storeId) ? sp.storeId[0] : sp.storeId;
  return redirect(
    storeId?.trim()
      ? `/my/business/store-orders?storeId=${encodeURIComponent(storeId.trim())}`
      : "/my/business/store-orders"
  );
}
