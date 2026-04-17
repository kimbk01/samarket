import Link from "next/link";
import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { OrderChatRoomClient } from "@/components/order-chat/OrderChatRoomClient";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadOrderChatSnapshotForPage } from "@/lib/order-chat/load-order-chat-snapshot-for-page";
import { ORDER_CHAT_SNAPSHOT_BOOTSTRAP_MESSAGE_LIMIT } from "@/lib/order-chat/types";

export const dynamic = "force-dynamic";

/** 주문 허브 매장 주문 채팅 — RSC 선로딩으로 첫 GET 제거 */
export default function OrdersStoreOrderChatPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <OrdersStoreOrderChatPageBody params={params} />
    </Suspense>
  );
}

async function OrdersStoreOrderChatPageBody({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId: raw } = await params;
  const orderId = typeof raw === "string" ? raw.trim() : "";
  if (!orderId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-sam-app px-4 text-sm text-sam-muted">
        <p>주문 ID가 없습니다.</p>
        <Link href="/orders" className="mt-2 font-medium text-signature underline">
          주문 목록
        </Link>
      </div>
    );
  }

  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-sam-app px-4 text-sm">
        <Link href="/login" className="font-medium text-signature underline">
          로그인
        </Link>
      </div>
    );
  }

  const result = await loadOrderChatSnapshotForPage(userId, orderId, {
    messageLimit: ORDER_CHAT_SNAPSHOT_BOOTSTRAP_MESSAGE_LIMIT,
  });
  if (result == null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-sam-app px-4 text-center text-sm text-sam-muted">
        서버 설정이 필요합니다.
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-sam-app px-4 text-center">
        <p className="text-sm text-sam-fg">주문 채팅을 열 수 없습니다. ({result.error})</p>
        <Link
          href={`/orders/store/${encodeURIComponent(orderId)}`}
          className="text-sm font-medium text-signature underline"
        >
          주문 상세
        </Link>
        <Link href="/orders" className="text-sm text-sam-muted underline">
          주문 목록
        </Link>
      </div>
    );
  }

  return (
    <OrderChatRoomClient
      key={orderId}
      orderId={orderId}
      backHref={`/orders/store/${encodeURIComponent(orderId)}`}
      orderChatsHref="/orders"
      initialSnapshot={result.snapshot}
    />
  );
}
