import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";

/** 샘플 배달 결제 제거 — 실매장 주문은 장바구니·결제 UI에서만 진행 */
export default function StoreCheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={3} />}>
      <StoreCheckoutPageBody params={params} />
    </Suspense>
  );
}

async function StoreCheckoutPageBody({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const safe = typeof slug === "string" ? slug : "";
  return redirect(`/stores/${encodeURIComponent(safe)}/cart`);
}
