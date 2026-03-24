/**
 * 구매내역 — 내가 구매자인 거래 (product_chats.buyer_id + chat_rooms에서 내가 buyer인 글)
 * GET /api/my/purchases (세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createClient } from "@supabase/supabase-js";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import { fetchFirstThumbnailByPostIds } from "@/lib/mypage/fetch-first-post-thumbnails";
import { applyBuyerAutoConfirmAllDue } from "@/lib/trade/apply-buyer-auto-confirm";
import {
  reconcileProductChatsFromItemTradeRoomsForUser,
  reconcileProductChatsFromItemTradeByPostIds,
} from "@/lib/trade/touch-product-chat-from-item-trade-room";
import {
  includeProductChatInPurchaseHistory,
  type ItemTradeRoomPair,
} from "@/lib/mypage/sales-history-scope";

export async function GET(_req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  await applyBuyerAutoConfirmAllDue(sbAny);

  const { data: crBuyRows } = await sbAny
    .from("chat_rooms")
    .select("item_id, seller_id, buyer_id")
    .eq("room_type", "item_trade")
    .eq("buyer_id", userId);

  const roomsAsBuyer = (crBuyRows ?? []).map((r: Record<string, unknown>) => ({
    item_id: String(r.item_id ?? ""),
    seller_id: String(r.seller_id ?? ""),
    buyer_id: String(r.buyer_id ?? ""),
  })) as ItemTradeRoomPair[];

  const postIdsFromRooms = [...new Set(roomsAsBuyer.map((r) => r.item_id).filter(Boolean))];

  await reconcileProductChatsFromItemTradeByPostIds(sbAny, postIdsFromRooms);
  await reconcileProductChatsFromItemTradeRoomsForUser(sbAny, userId, "buyer");

  const sel =
    "id, post_id, seller_id, buyer_id, created_at, last_message_at, last_message_preview, trade_flow_status, chat_mode, seller_completed_at, buyer_confirmed_at, review_deadline_at, buyer_confirm_source";

  const { data: byBuyerId, error: e1 } = await sbAny
    .from("product_chats")
    .select(sel)
    .eq("buyer_id", userId);

  if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 500 });
  }

  let byPost: typeof byBuyerId = [];
  if (postIdsFromRooms.length > 0) {
    const { data: bp, error: e2 } = await sbAny.from("product_chats").select(sel).in("post_id", postIdsFromRooms);
    if (e2) {
      return NextResponse.json({ error: e2.message }, { status: 500 });
    }
    byPost = bp ?? [];
  }

  const byId = new Map<string, Record<string, unknown>>();
  for (const r of [...(byBuyerId ?? []), ...byPost]) {
    byId.set(String((r as { id: string }).id), r as Record<string, unknown>);
  }

  const rows = [...byId.values()].filter((r) =>
    includeProductChatInPurchaseHistory(
      userId,
      {
        post_id: String(r.post_id ?? ""),
        seller_id: String(r.seller_id ?? ""),
        buyer_id: String(r.buyer_id ?? ""),
      },
      roomsAsBuyer
    )
  );

  rows.sort((a, b) => {
    const ta = new Date(String(a.last_message_at ?? a.created_at ?? 0)).getTime();
    const tb = new Date(String(b.last_message_at ?? b.created_at ?? 0)).getTime();
    return tb - ta;
  });

  if (rows.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const roomIds = rows.map((r) => String(r.id));
  const { data: revRows } = await sbAny
    .from("transaction_reviews")
    .select("room_id")
    .eq("reviewer_id", userId)
    .eq("role_type", "buyer_to_seller")
    .in("room_id", roomIds);
  const reviewedRooms = new Set(
    (revRows ?? []).map((x: { room_id: string }) => x.room_id).filter(Boolean)
  );

  const postIds = [...new Set(rows.map((r) => String(r.post_id)).filter(Boolean))];
  const { data: posts } = await sbAny.from("posts").select("*").in("id", postIds);

  const postMap = new Map(
    (posts ?? []).map((p: Record<string, unknown>) => [String(p.id), p])
  );
  const missingPostIds = postIds.filter((id) => id && !postMap.has(String(id)));
  for (const mid of missingPostIds.slice(0, 20)) {
    const { data: one } = await sbAny.from("posts").select("*").eq("id", mid).maybeSingle();
    if (one) postMap.set(String(mid), one as Record<string, unknown>);
  }

  const firstImageFromPostImages = await fetchFirstThumbnailByPostIds(sbAny, postIds);

  const listingOwnerIds = new Set<string>();
  for (const r of rows) {
    const post = postMap.get(String(r.post_id)) as Record<string, unknown> | undefined;
    const oid = postAuthorUserId(post);
    if (oid) listingOwnerIds.add(oid);
  }

  const nickById = new Map<string, string>();
  const owners = [...listingOwnerIds];
  if (owners.length) {
    const { data: profiles } = await sbAny
      .from("profiles")
      .select("id, nickname, username")
      .in("id", owners);
    (profiles ?? []).forEach((p: Record<string, unknown>) => {
      const id = p.id as string;
      nickById.set(id, ((p.nickname ?? p.username) as string) || "");
    });
  }
  const needTest = owners.filter((id) => !nickById.get(id)?.trim());
  if (needTest.length) {
    const { data: tus } = await sbAny
      .from("test_users")
      .select("id, display_name, username")
      .in("id", needTest);
    (tus ?? []).forEach((t: Record<string, unknown>) => {
      const id = t.id as string;
      const n = (t.display_name ?? t.username) as string;
      if (id && n) nickById.set(id, n);
    });
  }

  const items = rows.map((r: Record<string, unknown>) => {
    const postId = String(r.post_id ?? "");
    const post = postMap.get(postId) as Record<string, unknown> | undefined;
    const summary = chatProductSummaryFromPostRow(post, postId);
    const rid = r.id as string;
    const thumb =
      summary.thumbnail.trim() || firstImageFromPostImages.get(postId) || "";
    const listingOwnerId = postAuthorUserId(post) ?? String(r.seller_id ?? "");
    return {
      chatId: rid,
      postId,
      sellerId: listingOwnerId,
      sellerNickname:
        nickById.get(listingOwnerId)?.trim() || listingOwnerId.slice(0, 8),
      title: summary.title,
      price: summary.price,
      status: summary.status,
      sellerListingState: summary.sellerListingState,
      thumbnail: thumb,
      createdAt: (r.created_at as string) ?? null,
      lastMessageAt: (r.last_message_at as string) ?? null,
      lastMessagePreview: (r.last_message_preview as string) ?? "",
      postUpdatedAt: summary.updatedAt ?? null,
      tradeFlowStatus: (r.trade_flow_status as string) ?? "chatting",
      chatMode: (r.chat_mode as string) ?? "open",
      soldBuyerId: (post?.sold_buyer_id as string) ?? null,
      sellerCompletedAt: (r.seller_completed_at as string) ?? null,
      buyerConfirmedAt: (r.buyer_confirmed_at as string) ?? null,
      reviewDeadlineAt: (r.review_deadline_at as string) ?? null,
      buyerConfirmSource: (r.buyer_confirm_source as string) ?? null,
      hasBuyerReview: reviewedRooms.has(rid),
    };
  });

  return NextResponse.json({ items });
}
