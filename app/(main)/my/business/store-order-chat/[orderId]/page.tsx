import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { ensureStoreOrderMessengerRoom } from "@/lib/community-messenger/store-order-chat-service";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

/** 매장 오너 주문 채팅 — 스냅샷만으로 진입(별도 owner 컨텍스트 조회 제거) */
export default function OwnerStoreOrderChatPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <OwnerStoreOrderChatPageBody params={params} />
    </Suspense>
  );
}

async function OwnerStoreOrderChatPageBody({
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
        <Link href="/stores/owner" className="font-medium text-signature underline">
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

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-sm text-sam-muted">
        서버 설정이 필요합니다.
      </div>
    );
  }
  const result = await ensureStoreOrderMessengerRoom(sb as any, { orderId, userId });
  if (!result.ok) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="text-sm text-sam-fg">
          채팅을 불러오지 못했습니다.{` (${result.error})`}
        </p>
        <Link href="/stores/owner" className="text-sm font-medium text-signature underline">
          매장 어드민
        </Link>
      </div>
    );
  }
  redirect(`/community-messenger/rooms/${encodeURIComponent(result.roomId)}?from=delivery`);
}
