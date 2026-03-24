import { AdminOrderChatPageClient } from "@/components/admin/delivery-orders/AdminOrderChatPageClient";

export default async function AdminDeliveryOrderChatPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <AdminOrderChatPageClient orderId={orderId} />;
}
