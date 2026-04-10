import { ChatRoomPageClient } from "./ChatRoomPageClient";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import type { ChatRoomSource } from "@/lib/types/chat";
import { parseRoomId } from "@/lib/validate-params";

function firstQueryString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function resolveChatListHref(from: string | undefined): string {
  switch (from) {
    case "orders-chat":
      return "/my/store-orders";
    case "orders-hub":
      return "/orders?tab=store";
    default:
      return "/mypage/trade/chat";
  }
}

type PageProps = {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `searchParams`·`roomId` 를 서버에서 확정 — 클라 Suspense·「불러오는 중」 한 겹 제거, URL 직접 진입 시 체감 개선.
 */
export default async function ChatRoomPage({ params, searchParams }: PageProps) {
  const { roomId: raw } = await params;
  const sp = await searchParams;
  const initialViewerUserId = await getOptionalAuthenticatedUserId();
  const roomId = parseRoomId(raw);
  const review = firstQueryString(sp.review)?.trim();
  const from = firstQueryString(sp.from)?.trim();
  const openReviewOnMount = review === "1";
  const listHref = resolveChatListHref(from);
  const sourceRaw = firstQueryString(sp.source)?.trim();
  const chatRoomSourceHint: ChatRoomSource | null =
    sourceRaw === "chat_room" || sourceRaw === "product_chat" ? sourceRaw : null;

  return (
    <ChatRoomPageClient
      roomId={roomId}
      openReviewOnMount={openReviewOnMount}
      listHref={listHref}
      initialViewerUserId={initialViewerUserId}
      chatRoomSourceHint={chatRoomSourceHint}
    />
  );
}
