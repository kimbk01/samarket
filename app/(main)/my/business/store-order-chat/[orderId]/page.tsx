import Link from "next/link";
import { RedirectStoreOrderToUnifiedChat } from "@/components/chats/RedirectStoreOrderToUnifiedChat";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadOrderChatSnapshotForPage } from "@/lib/order-chat/load-order-chat-snapshot-for-page";
import { ORDER_CHAT_SNAPSHOT_BOOTSTRAP_MESSAGE_LIMIT } from "@/lib/order-chat/types";

export const dynamic = "force-dynamic";

/** 매장 오너 주문 채팅 — 스냅샷만으로 진입(별도 owner 컨텍스트 조회 제거) */
export default async function OwnerStoreOrderChatPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId: raw } = await params;
  const orderId = typeof raw === "string" ? raw.trim() : "";
  if (!orderId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center text-sm text-sam-fg">
        <p>주문 ID가 없습니다.</p>
        <Link href="/my/business" className="font-medium text-signature underline">
          매장 어드민
        </Link>
      </div>
    );
  }

  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <Link href="/login" className="font-medium text-signature underline">
          로그인
        </Link>
      </div>
    );
  }

  const snap = await loadOrderChatSnapshotForPage(userId, orderId, {
    messageLimit: ORDER_CHAT_SNAPSHOT_BOOTSTRAP_MESSAGE_LIMIT,
  });
  if (snap == null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-sm text-sam-muted">
        서버 설정이 필요합니다.
      </div>
    );
  }
  if (!snap.ok) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="text-sm text-sam-fg">
          채팅을 불러오지 못했습니다.{` (${snap.error})`}
        </p>
        <Link href="/my/business" className="text-sm font-medium text-signature underline">
          매장 어드민
        </Link>
      </div>
    );
  }

  const storeId = snap.snapshot.room.store_id.trim();

  return (
    <RedirectStoreOrderToUnifiedChat
      key={`${storeId}:${orderId}`}
      variant="owner"
      storeId={storeId}
      orderId={orderId}
      initialSnapshot={snap.snapshot}
    />
  );
}
