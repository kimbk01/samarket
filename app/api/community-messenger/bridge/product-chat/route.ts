import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { buildCommunityMessengerRoomUrlWithContext } from "@/lib/community-messenger/cm-ctx-url";
import { parseCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import { resolveProductChat } from "@/lib/trade/resolve-product-chat";
import { ensureCommunityMessengerDirectRoomFromProductChat } from "@/lib/community-messenger/service";
import { persistProductChatMessengerRoomIdIfNull } from "@/lib/trade/persist-trade-messenger-room-link";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/http/api-route";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rl = await enforceRateLimit({
    key: `community-messenger:bridge-product-chat:${getRateLimitKey(req, auth.userId)}`,
    limit: 12,
    windowMs: 60_000,
    message: "요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_bridge_product_chat_rate_limited",
  });
  if (!rl.ok) return rl.response;

  const parsed = await parseJsonBody<{ roomId?: string }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;
  const roomIdInput = String(parsed.value.roomId ?? "").trim();
  if (!roomIdInput) return jsonError("roomId가 필요합니다.", 400, { code: "bad_request" });

  let sb: ReturnType<typeof getSupabaseServer> | null = null;
  try {
    sb = getSupabaseServer();
  } catch {
    sb = null;
  }
  if (!sb) return jsonError("서버 설정이 필요합니다.", 500);

  const ensured = await ensureCommunityMessengerDirectRoomFromProductChat(auth.userId, roomIdInput);
  if (!ensured.ok || !ensured.roomId) {
    const err = ensured.error ?? "bridge_failed";
    const status = err === "not_participant" ? 403 : err === "product_chat_not_found" ? 404 : 400;
    return jsonError(
      err === "product_chat_not_found" ? "거래 채팅을 찾을 수 없습니다." : "메신저 방을 준비하지 못했습니다.",
      { status, code: err }
    );
  }

  // 절대 조건: product_chats.community_messenger_room_id 는 NULL 이면 안 된다(목록/메타 enrich 실패 원인).
  // 브리지는 productChatId 입력이므로, ensure 성공 시 원장 FK 를 한 번 더 고정해 둔다.
  await persistProductChatMessengerRoomIdIfNull(sb as never, roomIdInput, ensured.roomId);

  const resolved = await resolveProductChat(sb as never, roomIdInput);
  if (!resolved) {
    return jsonOk({
      roomId: ensured.roomId,
      href: buildCommunityMessengerRoomUrlWithContext(ensured.roomId, {
        v: 1,
        kind: "trade",
        headline: "제목 없음",
      }),
    });
  }

  /**
   * `ensureCommunityMessengerDirectRoomFromProductChat` 가 이미 `hydrateTradeMessengerRoomSummaryFromProductChat` 로
   * summary JSON(제목·카테고리·postId)을 채운다. 여기서 카테고리 없는 스냅샷으로 덮어쓰면 목록이 "중고거래/거래"로 고착된다.
   */
  const { data: roomRow } = await sb
    .from("community_messenger_rooms")
    .select("summary")
    .eq("id", ensured.roomId)
    .maybeSingle();
  const summaryStr = typeof roomRow?.summary === "string" ? roomRow.summary.trim() : "";
  const meta =
    parseCommunityMessengerRoomContextMeta(summaryStr) ?? {
      v: 1 as const,
      kind: "trade" as const,
      productChatId: resolved.productChatId,
      headline: "제목 없음",
    };

  const href = buildCommunityMessengerRoomUrlWithContext(ensured.roomId, meta);
  return jsonOk({ roomId: ensured.roomId, href });
}
