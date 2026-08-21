import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { ensureStoreOrderMessengerRoom } from "@/lib/community-messenger/store-order-chat-service";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { translate } from "@/lib/i18n/messages";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { encodeCommunityMessengerRoomCmCtx } from "@/lib/community-messenger/cm-ctx-url";
import {
  MESSENGER_ROOM_RETURN_QUERY_KEY,
  sanitizeMessengerRoomReturnHref,
} from "@/lib/community-messenger/messenger-entry-origin";

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
  const lang = resolveServerInitialLanguage({});
  if (!orderId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center text-sm text-sam-fg">
        <p>{translate(lang, "store_order_id_required")}</p>
        <Link href="/stores/owner" className="font-medium text-signature underline">
          {translate(lang, "biz_title_default")}
        </Link>
      </div>
    );
  }

  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) {
    notFound();
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-sm text-sam-muted">
        {translate(lang, "owner_store_server_config_required")}
      </div>
    );
  }
  const result = await ensureStoreOrderMessengerRoom(sb as any, { orderId, userId });
  if (!result.ok) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="text-sm text-sam-fg">
          {translate(lang, "owner_store_order_chat_load_failed")} ({result.error})
        </p>
        <Link href="/stores/owner" className="text-sm font-medium text-signature underline">
          {translate(lang, "owner_store_admin_hub")}
        </Link>
      </div>
    );
  }
  const roomUrl = new URL(
    `/community-messenger/rooms/${encodeURIComponent(result.roomId)}`,
    "https://samarket.local"
  );
  roomUrl.searchParams.set("from", "delivery-owner");
  roomUrl.searchParams.set("cm_list", "delivery");
  // cm_ctx 첨부: 클라이언트가 bootstrap+ensure 2왕복 없이 ensure 1왕복만 하도록 한다.
  const cmCtx = encodeCommunityMessengerRoomCmCtx({
    v: 1,
    kind: "delivery",
    storeOrderId: orderId,
    orderNo: result.orderNo,
    storeId: result.storeId,
    storeDisplayName: result.storeName,
    headline: result.storeName,
  });
  roomUrl.searchParams.set("cm_ctx", cmCtx);
  const ret = sanitizeMessengerRoomReturnHref(OwnerRoutes.orderChats(result.storeId));
  if (ret) roomUrl.searchParams.set(MESSENGER_ROOM_RETURN_QUERY_KEY, ret);
  redirect(`${roomUrl.pathname}${roomUrl.search}`);
}
