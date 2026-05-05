import { permanentRedirect } from "next/navigation";

export default async function AdminDeliveryOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  permanentRedirect(`/admin/stores/orders/${encodeURIComponent(orderId)}`);
}
