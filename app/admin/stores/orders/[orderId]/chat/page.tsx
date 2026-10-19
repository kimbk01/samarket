import { Suspense } from "react";
import { AdminDeliveryOrderChatLookupEmpty } from "@/components/admin/delivery-orders/AdminDeliveryOrderChatLookupEmpty";
import { AdminStoreOrderChatViewer } from "@/components/admin/delivery-orders/AdminStoreOrderChatViewer";
import { lookupAdminStoreOrderMessengerRoomId } from "@/lib/admin-delivery-orders/list-admin-store-order-chats";

/**
 * 주문 채팅 — the single admin order-chat path (DEF-60). Lookup-only: never ensures / creates a room.
 * Room linked → read-only order-chat viewer here (not the community messenger admin screen);
 * no room → empty copy.
 */
export default async function AdminStoreOrderChatPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  // A failed lookup is not "no room": the viewer then shows the load error state with retry.
  const roomId = await lookupAdminStoreOrderMessengerRoomId(orderId).catch(() => undefined);

  if (roomId === null) return <AdminDeliveryOrderChatLookupEmpty orderId={orderId} />;

  return (
    <Suspense fallback={null}>
      <AdminStoreOrderChatViewer orderId={orderId} />
    </Suspense>
  );
}
