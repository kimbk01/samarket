import { ChatRoomScreen } from "@/components/chats/ChatRoomScreen";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadChatRoomBootstrapForUser } from "@/lib/chats/server/load-chat-room-bootstrap";
import type { ChatMessage, ChatRoom, ChatRoomSource } from "@/lib/types/chat";
import { parseRoomId } from "@/lib/validate-params";

const LIST_HREF = "/mypage/trade/chat";

function firstQueryString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

/** 거래 허브 레이아웃(상단 탭) 안에서 채팅 상세 — 별도 `/chats` 전체 화면으로 나가지 않음 */
export default async function TradeHubChatRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { roomId: raw } = await params;
  const sp = await searchParams;
  const initialViewerUserId = await getOptionalAuthenticatedUserId();
  const roomId = parseRoomId(raw);
  const openReviewOnMount = firstQueryString(sp.review)?.trim() === "1";
  const sourceRaw = firstQueryString(sp.source)?.trim();
  const chatRoomSourceHint: ChatRoomSource | null =
    sourceRaw === "chat_room" || sourceRaw === "product_chat" ? sourceRaw : null;

  let serverBootstrap: { room: ChatRoom; messages: ChatMessage[] } | null = null;
  if (initialViewerUserId && roomId) {
    const boot = await loadChatRoomBootstrapForUser({
      roomId,
      userId: initialViewerUserId,
      sourceHint: chatRoomSourceHint,
      detailScope: "entry",
    });
    if (boot.ok) {
      serverBootstrap = { room: boot.room, messages: boot.messages };
    }
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-ui-rect border border-ig-border bg-white shadow-sm">
      <ChatRoomScreen
        roomId={roomId}
        openReviewOnMount={openReviewOnMount}
        listHref={LIST_HREF}
        initialViewerUserId={initialViewerUserId}
        tradeHubColumnLayout
        chatRoomSourceHint={chatRoomSourceHint}
        serverBootstrap={serverBootstrap}
      />
    </section>
  );
}
