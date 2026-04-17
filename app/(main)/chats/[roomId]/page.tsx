import { Suspense } from "react";
import dynamic from "next/dynamic";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadTradeChatRoomBootstrap } from "@/lib/chat-domain/use-cases/trade-chat-bootstrap";
import { createTradeChatReadAdapter } from "@/lib/chats/server/trade-chat-read-adapter";
import type { ChatMessage, ChatRoom, ChatRoomSource } from "@/lib/types/chat";
import { parseRoomId } from "@/lib/validate-params";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";

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
      return "/orders?tab=store";
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
