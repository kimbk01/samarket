import { redirect } from "next/navigation";
import type { ChatRoomSource } from "@/lib/types/chat";
import { parseRoomId } from "@/lib/validate-params";
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";

function firstQueryString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

/**
 * 레거시 거래 허브 방 URL — 메신저 방(또는 후기 플로우 시 `/chats`)으로 통일 리다이렉트.
 */
export default async function TradeHubChatRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { roomId: raw } = await params;
  const sp = await searchParams;
  const roomId = parseRoomId(raw);
  const openReviewOnMount = firstQueryString(sp.review)?.trim() === "1";
  const sourceRaw = firstQueryString(sp.source)?.trim();
  const chatRoomSourceHint: ChatRoomSource | null =
    sourceRaw === "chat_room" || sourceRaw === "product_chat" ? sourceRaw : null;

  const dest = openReviewOnMount
    ? tradeHubChatRoomHref(roomId, chatRoomSourceHint, { review: true })
    : tradeHubChatRoomHref(roomId, chatRoomSourceHint);
  redirect(dest);
}
