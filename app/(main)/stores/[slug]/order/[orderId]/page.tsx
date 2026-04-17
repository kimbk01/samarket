import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { RestaurantOrderDetailClient } from "@/components/stores/delivery/RestaurantOrderDetailClient";

export default function StoreOrderDetailPage({
  params,
}: {
  params: Promise<{ slug: string; orderId: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <StoreOrderDetailPageBody params={params} />
    </Suspense>
  );
}

async function StoreOrderDetailPageBody({
  params,
}: {
  params: Promise<{ slug: string; orderId: string }>;
}) {
  const { slug, orderId } = await params;
  const s = typeof slug === "string" ? slug : "";
  const o = typeof orderId === "string" ? orderId : "";
  return <RestaurantOrderDetailClient storeSlug={s} orderId={o} />;
}
