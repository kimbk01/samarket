import { permanentRedirect } from "next/navigation";

export default async function AdminDeliveryOrdersByBuyerPage({
  params,
}: {
  params: Promise<{ buyerUserId: string }>;
}) {
  const { buyerUserId } = await params;
  permanentRedirect(`/admin/stores/orders/by-buyer/${encodeURIComponent(buyerUserId)}`);
}
