import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { RestaurantOrderCompleteClient } from "@/components/stores/delivery/RestaurantOrderCompleteClient";

export default function StoreOrderCompletePage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <StoreOrderCompletePageBody params={params} />
    </Suspense>
  );
}

async function StoreOrderCompletePageBody({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const safe = typeof slug === "string" ? slug : "";
  return <RestaurantOrderCompleteClient storeSlug={safe} />;
}
