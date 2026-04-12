import { TradeChatComposeClient } from "./TradeChatComposeClient";
import type { ChatRoomSource } from "@/lib/types/chat";
import { parseId, parseRoomId } from "@/lib/validate-params";

function firstQueryString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function TradeChatComposePage({
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

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-ui-rect border border-ig-border bg-sam-surface shadow-sm">
      <TradeChatComposeClient
        productId={productId}
        initialRoomId={roomId}
        sourceHint={sourceHint}
      />
    </section>
  );
}
