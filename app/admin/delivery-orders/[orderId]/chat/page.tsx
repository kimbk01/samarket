import { permanentRedirect } from "next/navigation";

export default async function AdminDeliveryOrderChatPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  permanentRedirect(`/admin/stores/orders/${encodeURIComponent(orderId)}/chat`);
}
