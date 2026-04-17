import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

/**
 * 판매자: 특정 글에 열린 구매자 채팅방 목록 (거래완료 진입용)
 * GET /api/my/post-buyer-chats?postId=
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import {
  touchProductChatPreviewFromItemTradeRoom,
  type ItemTradeRoomRowForSync,
} from "@/lib/trade/touch-product-chat-from-item-trade-room";
import { isOfflineMockPostId } from "@/lib/posts/offline-mock-post-id";
import { POST_TRADE_RELATION_SELECT } from "@/lib/posts/post-query-select";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const postId = req.nextUrl.searchParams.get("postId")?.trim();
  if (!postId) {
    return NextResponse.json({ error: "postId 필요" }, { status: 400 });
  }

  if (isOfflineMockPostId(postId)) {
    return NextResponse.json({
      items: [],
      postStatus: "active",
      sellerListingState: null,
      reservedBuyerId: null,
    });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const { data: post } = await sbAny.from(POSTS_TABLE_READ).select(POST_TRADE_RELATION_SELECT).eq("id", postId).maybeSingle();
  const prow = post as Record<string, unknown> | null;
  const author = postAuthorUserId(prow ?? undefined);
  if (!author || author !== userId) {
    return NextResponse.json({ error: "판매자만 조회할 수 있습니다." }, { status: 403 });
  }
  const postStatus = (prow?.status as string) ?? "active";
  const sellerListingState = typeof prow?.seller_listing_state === "string" ? prow.seller_listing_state : "";
  const reservedBuyerId =
    typeof prow?.reserved_buyer_id === "string" && prow.reserved_buyer_id.trim()
      ? prow.reserved_buyer_id.trim()
      : null;

  const { data: crRows } = await sbAny
    .from("chat_rooms")
    .select(
      "id, item_id, seller_id, buyer_id, trade_status, last_message_at, last_message_preview, updated_at"
    )
    .eq("room_type", "item_trade")
    .eq("item_id", postId)
    .eq("seller_id", userId)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  for (const cr of crRows ?? []) {
    await touchProductChatPreviewFromItemTradeRoom(sbAny, cr as ItemTradeRoomRowForSync);
  }

  const mapTradeStatusToFlow = (tradeStatus: string | null | undefined): string => {
    const t = String(tradeStatus ?? "inquiry").toLowerCase();
    if (t === "sold" || t === "completed" || t === "done") return "completed";
    return "chatting";
  };

  const buyerIdsFromCr = [...new Set((crRows ?? []).map((r: { buyer_id: string }) => r.buyer_id))];
  const nickById = new Map<string, string>();
  if (buyerIdsFromCr.length) {
    const { data: profiles } = await sbAny
      .from("profiles")
      .select("id, nickname, username")
      .in("id", buyerIdsFromCr);
    (profiles ?? []).forEach((p: Record<string, unknown>) => {
      const id = p.id as string;
      nickById.set(id, ((p.nickname ?? p.username) as string) || id.slice(0, 8));
    });
  }

  let items = (crRows ?? []).map((r: Record<string, unknown>) => ({
    /** `chat_rooms.id` — `resolveProductChat`·거래완료 API 가 수용 */
    chatId: String(r.id ?? ""),
    buyerId: String(r.buyer_id ?? ""),
    buyerNickname: nickById.get(String(r.buyer_id ?? "")) ?? String(r.buyer_id ?? "").slice(0, 8),
    tradeFlowStatus: mapTradeStatusToFlow(r.trade_status as string | undefined),
    chatMode: "open",
    lastMessagePreview: String(r.last_message_preview ?? ""),
  }));

  if (items.length === 0) {
    const { data: rooms, error } = await sbAny
      .from("product_chats")
      .select(
        "id, buyer_id, trade_flow_status, chat_mode, last_message_preview, last_message_at"
      )
      .eq("post_id", postId)
      .eq("seller_id", userId)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const buyers = [...new Set((rooms ?? []).map((r: { buyer_id: string }) => r.buyer_id))];
    const nickPc = new Map<string, string>();
    if (buyers.length) {
      const { data: profiles } = await sbAny
        .from("profiles")
        .select("id, nickname, username")
        .in("id", buyers);
      (profiles ?? []).forEach((p: Record<string, unknown>) => {
        const id = p.id as string;
        nickPc.set(id, ((p.nickname ?? p.username) as string) || id.slice(0, 8));
      });
    }

    items = (rooms ?? []).map((r: Record<string, unknown>) => ({
      chatId: String(r.id ?? ""),
      buyerId: String(r.buyer_id ?? ""),
      buyerNickname: nickPc.get(String(r.buyer_id ?? "")) ?? String(r.buyer_id ?? "").slice(0, 8),
      tradeFlowStatus: (r.trade_flow_status as string) ?? "chatting",
      chatMode: (r.chat_mode as string) ?? "open",
      lastMessagePreview: (r.last_message_preview as string) ?? "",
    }));
  }

  return NextResponse.json({
    items,
    postStatus,
    sellerListingState: sellerListingState || null,
    reservedBuyerId,
  });
}
