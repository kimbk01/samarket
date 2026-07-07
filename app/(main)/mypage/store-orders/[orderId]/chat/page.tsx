import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { ensureStoreOrderMessengerRoom } from "@/lib/community-messenger/store-order-chat-service";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { translate } from "@/lib/i18n/messages";
import { encodeCommunityMessengerRoomCmCtx } from "@/lib/community-messenger/cm-ctx-url";
import { buildProfileEditHref } from "@/lib/profile/profile-completion-modal-client";
import type { ProfileRequirementField } from "@/lib/profile/profile-requirements";
import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";

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
  const lang = resolveServerInitialLanguage({});
  if (!orderId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-sam-app px-4 text-sm text-sam-muted">
        <p>{translate(lang, "route_order_id_missing")}</p>
        <Link href="/mypage/store-orders" className="mt-2 font-medium text-signature underline">
          {translate(lang, "route_store_orders_back_link")}
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-sam-app px-4 text-center text-sm text-sam-muted">
        서버 설정이 필요합니다.
      </div>
    );
  }

  const chatReturnPath = `/mypage/store-orders/${encodeURIComponent(orderId)}/chat`;
  const profileGate = await requireProfileFieldsForAction(
    sb as import("@supabase/supabase-js").SupabaseClient,
    userId,
    "order_chat"
  );
  if (!profileGate.ok) {
    redirect(
      buildProfileEditHref({
        required: profileGate.missingFields as ProfileRequirementField[],
        returnTo: chatReturnPath,
      })
    );
  }

  const result = await ensureStoreOrderMessengerRoom(sb as any, { orderId, userId });
  if (!result.ok) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-sam-app px-4 text-center">
        <p className="text-sm text-sam-fg">
          채팅을 열 수 없습니다.
          {result.error ? ` (${result.error})` : ""}
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
  const roomUrl = new URL(
    `/community-messenger/rooms/${encodeURIComponent(result.roomId)}`,
    "https://samarket.local"
  );
  roomUrl.searchParams.set("from", "delivery");
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
  redirect(`${roomUrl.pathname}${roomUrl.search}`);
}
