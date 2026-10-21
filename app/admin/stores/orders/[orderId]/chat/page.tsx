import { Suspense } from "react";
import { AdminAccessDeniedPanel } from "@/components/admin/AdminAccessDeniedPanel";
import { requireAdminPageAccess } from "@/lib/admin/access/require-admin-page-access";
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
  // P1-11 · AD-01: 서버 렌더 데이터 조회 전 페이지 자체 권한 가드 (레이아웃 게이트에만 의존하지 않음)
  const access = await requireAdminPageAccess(`/admin/stores/orders/${encodeURIComponent(orderId)}/chat`);
  if (!access.ok) return <AdminAccessDeniedPanel backHref="/admin" />;
  // A failed lookup is not "no room": the viewer then shows the load error state with retry.
  const roomId = await lookupAdminStoreOrderMessengerRoomId(orderId).catch(() => undefined);

  if (roomId === null) return <AdminDeliveryOrderChatLookupEmpty orderId={orderId} />;

  return (
    <Suspense fallback={null}>
      <AdminStoreOrderChatViewer orderId={orderId} />
    </Suspense>
  );
}
