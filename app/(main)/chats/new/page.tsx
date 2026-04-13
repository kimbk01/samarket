import { redirect } from "next/navigation";
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
export default async function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const productId = firstQueryString(sp.productId)?.trim() || null;
  if (!productId) {
    redirect(TRADE_CHAT_SURFACE.messengerListHref);
  }
  redirect(tradeHubChatComposeHref({ productId }));
}
