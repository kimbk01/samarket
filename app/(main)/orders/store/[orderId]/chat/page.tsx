import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { ensureStoreOrderMessengerRoom } from "@/lib/community-messenger/store-order-chat-service";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { translate } from "@/lib/i18n/messages";

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
  const lang = resolveServerInitialLanguage({});
  if (!orderId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-sam-app px-4 text-sm text-sam-muted">
        <p>{translate(lang, "store_order_id_required")}</p>
        <Link href="/orders" className="mt-2 font-medium text-signature underline">
          {translate(lang, "store_orders_list_link")}
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

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-sam-app px-4 text-center text-sm text-sam-muted">
        서버 설정이 필요합니다.
      </div>
    );
  }
  const result = await ensureStoreOrderMessengerRoom(sb as any, { orderId, userId });
  if (!result.ok) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-sam-app px-4 text-center">
        <p className="text-sm text-sam-fg">
          {translate(lang, "store_order_chat_open_failed_error", { error: result.error })}
        </p>
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
  const roomUrl = new URL(
    `/community-messenger/rooms/${encodeURIComponent(result.roomId)}`,
    "https://samarket.local"
  );
  roomUrl.searchParams.set("from", "delivery");
  roomUrl.searchParams.set("cm_list", "delivery");
  redirect(`${roomUrl.pathname}${roomUrl.search}`);
}
