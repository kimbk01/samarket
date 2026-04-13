import { AdminDeliveryOrderChatDbClient } from "@/components/admin/delivery-orders/AdminDeliveryOrderChatDbClient";

export default async function AdminDeliveryOrderChatPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <AdminDeliveryOrderChatDbClient orderId={orderId} />;
}
