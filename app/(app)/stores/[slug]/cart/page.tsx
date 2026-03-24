import { StoreCartEntrySwitch } from "@/components/stores/StoreCartEntrySwitch";

export default async function StoreCartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const safe = typeof slug === "string" ? slug : "";
  return (
    <div className="px-0 py-0">
      <StoreCartEntrySwitch storeSlug={safe} />
    </div>
  );
}
