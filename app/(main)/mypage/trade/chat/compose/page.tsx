import { Suspense } from "react";
import { TradeChatComposeClient } from "./TradeChatComposeClient";
import { redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import type { ChatRoomSource } from "@/lib/types/chat";
import {
  TRADE_CHAT_SURFACE,
  tradeHubChatRoomHref,
} from "@/lib/chats/surfaces/trade-chat-surface";
import { parseId, parseRoomId } from "@/lib/validate-params";

function firstQueryString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default function TradeChatComposePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <TradeChatComposePageBody searchParams={searchParams} />
    </Suspense>
  );
}

async function TradeChatComposePageBody({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const productId = parseId(firstQueryString(sp.productId)?.trim() ?? "") ?? null;
  const roomId = parseRoomId(firstQueryString(sp.roomId)?.trim() ?? "") ?? null;
  const sourceRaw = firstQueryString(sp.source)?.trim();
  const sourceHint =
    sourceRaw === "chat_room" || sourceRaw === "product_chat"
      ? (sourceRaw as ChatRoomSource)
      : null;

  if (roomId) {
    return redirect(tradeHubChatRoomHref(roomId, sourceHint));
  }
  if (!productId) {
    return redirect(TRADE_CHAT_SURFACE.messengerListHref);
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
      <TradeChatComposeClient productId={productId} />
    </section>
  );
}
