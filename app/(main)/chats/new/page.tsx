import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import {
  TRADE_CHAT_SURFACE,
  tradeHubChatComposeHref,
} from "@/lib/chats/surfaces/trade-chat-surface";

function firstQueryString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

/**
 * 상품 상세 "채팅하기" → 서버에서 `productId` 를 먼저 확정해 클라 Suspense 한 겹 제거
 */
export default function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={3} />}>
      <NewChatPageBody searchParams={searchParams} />
    </Suspense>
  );
}

async function NewChatPageBody({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const productId = firstQueryString(sp.productId)?.trim() || null;
  if (!productId) {
    return redirect(TRADE_CHAT_SURFACE.messengerListHref);
  }
  return redirect(tradeHubChatComposeHref({ productId }));
}
