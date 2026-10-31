import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 판매자: 특정 글에 열린 구매자 채팅방 목록 (거래완료 진입용)
 * GET /api/my/post-buyer-chats?postId=
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import { reconcileProductChatsFromItemTrade } from "@/lib/trade/touch-product-chat-from-item-trade-room";
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
  // 이 글의 item_trade 방 → product_chats 보정 1회 (방마다 조회·저장 반복하지 않음)
  if ((crRows ?? []).length) {
    await reconcileProductChatsFromItemTrade(sbAny, { postIds: [postId] });
  }

  const mapTradeStatusToFlow = (tradeStatus: string | null | undefined): string => {
    const t = String(tradeStatus ?? "inquiry").toLowerCase();
    if (t === "sold" || t === "completed" || t === "done") return "completed";
    return "chatting";
  };

  /** 구매자별 거래 흐름 원장 — chat_rooms 가 있어도 함께 읽어 구매자 누락·상태 혼동을 막는다 */
  const { data: pcRows, error: pcError } = await sbAny
    .from("product_chats")
    .select("id, buyer_id, trade_flow_status, chat_mode, last_message_preview, last_message_at")
    .eq("post_id", postId)
    .eq("seller_id", userId)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (pcError) {
    return NextResponse.json({ error: pcError.message }, { status: 500 });
  }
  const pcByBuyer = new Map<string, Record<string, unknown>>();
  for (const r of (pcRows ?? []) as Record<string, unknown>[]) {
    const b = String(r.buyer_id ?? "");
    if (b && !pcByBuyer.has(b)) pcByBuyer.set(b, r);
  }

  const buyerIds = [
    ...new Set([
      ...(crRows ?? []).map((r: { buyer_id: string }) => String(r.buyer_id ?? "")),
      ...pcByBuyer.keys(),
    ]),
  ].filter(Boolean);
  const nickById = new Map<string, string>();
  if (buyerIds.length) {
    const { data: profiles } = await sbAny
      .from("profiles")
      .select("id, nickname, username")
      .in("id", buyerIds);
    (profiles ?? []).forEach((p: Record<string, unknown>) => {
      const id = p.id as string;
      nickById.set(id, ((p.nickname ?? p.username) as string) || id.slice(0, 8));
    });
  }

  type BuyerChatItem = {
    chatId: string;
    buyerId: string;
    buyerNickname: string;
    tradeFlowStatus: string;
    chatMode: string;
    lastMessagePreview: string;
    lastMessageAt: string | null;
  };
  const items: BuyerChatItem[] = [];
  const seenBuyers = new Set<string>();
  for (const r of (crRows ?? []) as Record<string, unknown>[]) {
    const buyerId = String(r.buyer_id ?? "");
    if (!buyerId || seenBuyers.has(buyerId)) continue;
    seenBuyers.add(buyerId);
    const pc = pcByBuyer.get(buyerId);
    items.push({
      /** `chat_rooms.id` — `resolveProductChat`·거래완료 API 가 수용 */
      chatId: String(r.id ?? ""),
      buyerId,
      buyerNickname: nickById.get(buyerId) ?? buyerId.slice(0, 8),
      tradeFlowStatus:
        (pc?.trade_flow_status as string | undefined) ??
        mapTradeStatusToFlow(r.trade_status as string | undefined),
      chatMode: (pc?.chat_mode as string | undefined) ?? "open",
      lastMessagePreview: String(r.last_message_preview ?? ""),
      lastMessageAt: (r.last_message_at as string | null) ?? null,
    });
  }
  for (const [buyerId, r] of pcByBuyer) {
    if (seenBuyers.has(buyerId)) continue;
    seenBuyers.add(buyerId);
    items.push({
      chatId: String(r.id ?? ""),
      buyerId,
      buyerNickname: nickById.get(buyerId) ?? buyerId.slice(0, 8),
      tradeFlowStatus: (r.trade_flow_status as string) ?? "chatting",
      chatMode: (r.chat_mode as string) ?? "open",
      lastMessagePreview: (r.last_message_preview as string) ?? "",
      lastMessageAt: (r.last_message_at as string | null) ?? null,
    });
  }
  items.sort((a, b) => String(b.lastMessageAt ?? "").localeCompare(String(a.lastMessageAt ?? "")));

  return NextResponse.json({
    items,
    postStatus,
    sellerListingState: sellerListingState || null,
    reservedBuyerId,
  });
}
