import {
  newDomainSeparationCorrelationId,
  traceDomainSeparation,
} from "@/lib/chat-domain/domain-separation-trace";
import { resolveLegacyProductChatCreateOrGet } from "./legacy-product-chat-create-or-get";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { runItemTradeChatStartCore } from "@/lib/trade/item-trade-chat-start-core";
import type { TradeEntryPerfTrace } from "@/lib/trade/trade-entry-perf-log";
import type { ChatRoomSource } from "@/lib/types/chat";

type LegacyErrPayload = {
  ok?: boolean;
  error?: string;
};

export type ResolveTradeChatEntryResult =
  | { ok: true; roomId: string; roomSource: ChatRoomSource; messengerRoomId?: string }
  | { ok: false; error: string; status: number };

function pickString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t || undefined;
}

function isProductNotFound(status: number, payload: LegacyErrPayload): boolean {
  const error = pickString(payload.error) ?? "";
  return status === 404 || error.includes("상품을 찾을 수 없습니다");
}

export async function resolveTradeChatEntry(
  userId: string,
  productId: string,
  perf?: TradeEntryPerfTrace | null
): Promise<ResolveTradeChatEntryResult> {
  const correlationId = newDomainSeparationCorrelationId();
  traceDomainSeparation({
    correlationId,
    phase: "trade_entry_resolve_start",
    surface: "trade_chat_entry_resolve",
    viewerId: userId,
    itemId: productId,
    expectedDomain: "trade",
  });
  perf?.mark("resolve_service_sb");
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return { ok: false, error: "서버 설정이 필요합니다.", status: 500 };
  }

  perf?.mark("resolve_item_core_start");
  const core = await runItemTradeChatStartCore({
    buyerId: userId,
    itemId: productId,
    sb: sb as never,
    perf,
  });
  perf?.mark("resolve_item_core_end");

  if (core.ok) {
    const b = core.body;
    perf?.mark("resolve_response_chat_room");
    traceDomainSeparation({
      correlationId,
      phase: "trade_entry_resolve_ok",
      surface: "trade_chat_entry_resolve",
      viewerId: userId,
      itemId: productId,
      expectedDomain: "trade",
      roomId: b.roomId,
      messengerRoomId: b.messengerRoomId ?? null,
      createdOrReused: "item_trade_core",
    });
    return {
      ok: true,
      roomId: b.roomId,
      roomSource: "chat_room",
      ...(b.messengerRoomId ? { messengerRoomId: b.messengerRoomId } : {}),
    };
  }

  const status = core.httpStatus;
  const payload = core.body as LegacyErrPayload;
  if (!isProductNotFound(status, payload)) {
    perf?.mark("resolve_fail_non_404");
    return {
      ok: false,
      error: pickString(payload.error) ?? "채팅방 생성에 실패했습니다.",
      status: status >= 400 ? status : 400,
    };
  }

  perf?.mark("resolve_legacy_start");
  const legacy = await resolveLegacyProductChatCreateOrGet({ userId, productId });
  perf?.mark("resolve_legacy_end");
  if (legacy.ok) {
    const legacyRoomId = pickString(legacy.messengerRoomId) ?? pickString(legacy.roomId);
    if (legacyRoomId) {
      perf?.mark("resolve_response_product_chat");
      return { ok: true, roomId: legacyRoomId, roomSource: "product_chat" };
    }
  }

  return {
    ok: false,
    error: (legacy.ok ? undefined : legacy.error) ?? pickString(payload.error) ?? "채팅방 생성에 실패했습니다.",
    status: legacy.ok ? 500 : legacy.status,
  };
}
