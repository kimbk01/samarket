import { Suspense } from "react";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadTradeChatRoomBootstrap } from "@/lib/chat-domain/use-cases/trade-chat-bootstrap";
import { createTradeChatReadAdapter } from "@/lib/chats/server/trade-chat-read-adapter";
import type { ChatMessage, ChatRoom, ChatRoomSource } from "@/lib/types/chat";
import { parseRoomId } from "@/lib/validate-params";
import { TRADE_CHAT_SURFACE, tradeItemChatMessengerHrefIfLinked } from "@/lib/chats/surfaces/trade-chat-surface";
import { orderMessengerRoomHref } from "@/lib/chats/surfaces/order-chat-surface";

const ChatRoomPageClient = dynamic(
  () => import("./ChatRoomPageClient").then((m) => m.ChatRoomPageClient),
  { loading: () => <MainFeedRouteLoading rows={5} /> }
);

function firstQueryString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function resolveChatListHref(from: string | undefined): string {
  switch (from) {
    case "orders-chat":
      return "/my/store-orders";
    case "orders-hub":
      return "/orders";
    default:
      return TRADE_CHAT_SURFACE.messengerListHref;
  }
}

type PageProps = {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function ChatRoomPageBody({
  paramsPromise,
  searchParamsPromise,
}: {
  paramsPromise: PageProps["params"];
  searchParamsPromise: PageProps["searchParams"];
}) {
  const { roomId: raw } = await paramsPromise;
  const sp = await searchParamsPromise;
  const initialViewerUserId = await getOptionalAuthenticatedUserId();
  const roomId = parseRoomId(raw);
  const review = firstQueryString(sp.review)?.trim();
  const from = firstQueryString(sp.from)?.trim();
  const openReviewOnMount = review === "1";
  const listHref = resolveChatListHref(from);
  const sourceRaw = firstQueryString(sp.source)?.trim();
  const chatRoomSourceHint: ChatRoomSource | null =
    sourceRaw === "chat_room" || sourceRaw === "product_chat" ? sourceRaw : null;

  let serverBootstrap: { room: ChatRoom; messages: ChatMessage[] } | null = null;
  if (initialViewerUserId && roomId) {
    const port = createTradeChatReadAdapter();
    const boot = await loadTradeChatRoomBootstrap(port, initialViewerUserId, roomId, {
      sourceHint: chatRoomSourceHint,
      bootstrapPhase: "lite",
    });
    if (boot.ok) {
      serverBootstrap = { room: boot.room, messages: boot.messages };
      if (boot.room.chatDomain === "store_order" && boot.room.communityMessengerRoomId?.trim()) {
        redirect(orderMessengerRoomHref(boot.room.communityMessengerRoomId));
      }
      const toMessenger = tradeItemChatMessengerHrefIfLinked(boot.room, {
        sourceHint: chatRoomSourceHint,
        openReview: openReviewOnMount,
      });
      if (toMessenger) {
        redirect(toMessenger);
      }
      /** 거래 방은 CM 연동만 허용 — 미연동 레거시 `/chats` UI 진입 차단 */
      if (boot.room.chatDomain === "trade") {
        redirect(TRADE_CHAT_SURFACE.messengerListHref);
      }
    }
  }

  return (
    <ChatRoomPageClient
      key={roomId ?? "none"}
      roomId={roomId}
      openReviewOnMount={openReviewOnMount}
      listHref={listHref}
      initialViewerUserId={initialViewerUserId}
      chatRoomSourceHint={chatRoomSourceHint}
      serverBootstrap={serverBootstrap}
    />
  );
}

export default function ChatRoomPage({ params, searchParams }: PageProps) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <ChatRoomPageBody paramsPromise={params} searchParamsPromise={searchParams} />
    </Suspense>
  );
}
