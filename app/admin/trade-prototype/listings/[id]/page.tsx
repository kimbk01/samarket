import { TradePrototypeListingDetailPage } from "@/components/admin/trade-prototype/TradePrototypeListingDetailPage";

export const dynamic = "force-dynamic";

export default async function TradePrototypeListingDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TradePrototypeListingDetailPage listingId={id} />;
}
