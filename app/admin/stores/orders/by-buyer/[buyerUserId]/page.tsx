import { DeliveryOrdersByBuyerClient } from "@/components/admin/delivery-orders/DeliveryOrdersByBuyerClient";

export default async function AdminStoreOrdersByBuyerPage({
  params,
}: {
  params: Promise<{ buyerUserId: string }>;
}) {
  const { buyerUserId } = await params;
  return <DeliveryOrdersByBuyerClient buyerUserId={buyerUserId} />;
}

