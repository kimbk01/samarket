import { redirect } from "next/navigation";
import { AdminDeliveryOrderChatLookupEmpty } from "@/components/admin/delivery-orders/AdminDeliveryOrderChatLookupEmpty";
import { lookupAdminStoreOrderMessengerRoomId } from "@/lib/admin-delivery-orders/list-admin-store-order-chats";

/**
 * Lookup-only order chat entry. Never ensures / creates a room.
 * If room exists → CM admin detail; else empty copy.
 */
export default async function AdminStoreOrderChatPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const roomId = await lookupAdminStoreOrderMessengerRoomId(orderId).catch(() => null);

  if (roomId) {
    redirect(`/admin/chats/messenger/${encodeURIComponent(roomId)}`);
  }

  return <AdminDeliveryOrderChatLookupEmpty orderId={orderId} />;
}
