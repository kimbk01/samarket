import Link from "next/link";
import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { RedirectStoreOrderToUnifiedChat } from "@/components/chats/RedirectStoreOrderToUnifiedChat";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadOrderChatSnapshotForPage } from "@/lib/order-chat/load-order-chat-snapshot-for-page";
import { ORDER_CHAT_SNAPSHOT_BOOTSTRAP_MESSAGE_LIMIT } from "@/lib/order-chat/types";

export const dynamic = "force-dynamic";

/** 마이페이지 매장 주문 채팅 — RSC 선로딩 */
export default function MypageStoreOrderChatPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <MypageStoreOrderChatPageBody params={params} />
    </Suspense>
  );
}

async function MypageStoreOrderChatPageBody({
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
        <Link href="/mypage/store-orders" className="mt-2 font-medium text-signature underline">
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
  if (result == null || !result.ok) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-sam-app px-4 text-center">
        <p className="text-sm text-sam-fg">
          채팅을 열 수 없습니다.
          {result && !result.ok ? ` (${result.error})` : ""}
        </p>
        <Link
          href={`/mypage/store-orders/${encodeURIComponent(orderId)}`}
          className="text-sm font-medium text-signature underline"
        >
          주문 상세
        </Link>
      </div>
    );
  }

  return (
    <RedirectStoreOrderToUnifiedChat
      key={orderId}
      variant="buyer"
      orderId={orderId}
      initialSnapshot={result.snapshot}
    />
  );
}
