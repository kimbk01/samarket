import { Suspense } from "react";
import { RestaurantOrderCompleteClient } from "@/components/stores/delivery/RestaurantOrderCompleteClient";

export default async function StoreOrderCompletePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const safe = typeof slug === "string" ? slug : "";
  return (
    <Suspense fallback={<p className="p-6 text-center text-sm text-gray-500">불러오는 중…</p>}>
      <RestaurantOrderCompleteClient storeSlug={safe} />
    </Suspense>
  );
}
