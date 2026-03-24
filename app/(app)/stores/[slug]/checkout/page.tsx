import { RestaurantCheckoutPageClient } from "@/components/stores/delivery/RestaurantCheckoutPageClient";

export default async function StoreCheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const safe = typeof slug === "string" ? slug : "";
  return (
    <div className="px-0 py-0">
      <RestaurantCheckoutPageClient storeSlug={safe} />
    </div>
  );
}
