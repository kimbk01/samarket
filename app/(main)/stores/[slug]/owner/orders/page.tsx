import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";

/** 구 `/stores/[slug]/owner/orders` → 사업자 통합 주문 관리 */
export default function StoreOwnerOrdersPage() {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={3} />}>
      <StoreOwnerOrdersPageBody />
    </Suspense>
  );
}

async function StoreOwnerOrdersPageBody() {
  return redirect("/my/business/store-orders");
}
