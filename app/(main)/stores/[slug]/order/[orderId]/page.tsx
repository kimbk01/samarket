import { RestaurantOrderDetailClient } from "@/components/stores/delivery/RestaurantOrderDetailClient";

export default async function StoreOrderDetailPage({
  params,
}: {
  params: Promise<{ slug: string; orderId: string }>;
}) {
  const { slug, orderId } = await params;
  const s = typeof slug === "string" ? slug : "";
  const o = typeof orderId === "string" ? orderId : "";
  return <RestaurantOrderDetailClient storeSlug={s} orderId={o} />;
}
