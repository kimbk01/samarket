import { DeliveryOrderDetailClient } from "@/components/admin/delivery-orders/DeliveryOrderDetailClient";

export default async function AdminDeliveryOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <DeliveryOrderDetailClient orderId={orderId} />;
}
