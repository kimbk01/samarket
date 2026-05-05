import { DeliveryOrderDetailClient } from "@/components/admin/delivery-orders/DeliveryOrderDetailClient";

export default async function AdminStoreOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <DeliveryOrderDetailClient orderId={orderId} />;
}

