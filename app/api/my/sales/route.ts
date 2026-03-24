/**
 * 판매내역 — 내 판매 글 + 연결된 product_chats (채팅 없는 글은 「문의 없음」 행으로 표시)
 * GET /api/my/sales (세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createClient } from "@supabase/supabase-js";
import { postAuthorUserId, postOwnedByUserId } from "@/lib/chats/resolve-author-nickname";
import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import { fetchFirstThumbnailByPostIds } from "@/lib/mypage/fetch-first-post-thumbnails";
import { applyBuyerAutoConfirmAllDue } from "@/lib/trade/apply-buyer-auto-confirm";
import {
  reconcileProductChatsFromItemTradeRoomsForUser,
  reconcileProductChatsFromItemTradeByPostIds,
} from "@/lib/trade/touch-product-chat-from-item-trade-room";
import {
  counterpartyUserIdForSellerView,
  isSellingPostForSalesHistory,
  pickItemTradeRoomForProductChat,
  type ItemTradeRoomPair,
} from "@/lib/mypage/sales-history-scope";

const PC_SEL =
  "id, post_id, seller_id, buyer_id, created_at, last_message_at, last_message_preview, trade_flow_status, chat_mode, seller_completed_at, buyer_confirmed_at, buyer_confirm_source";

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

  // thumbnail_url 은 마이그레이션(20250318020000_posts_images) 미적용 DB 에 없을 수 있음.
  // select("*") 는 존재 컬럼만 반환하지만, 명시 컬럼 나열 시 없는 컬럼이면 PostgREST 가 전체 요청을 거부한다.
  const { data: candidatePosts, error: postErr } = await sbAny
    .from("posts")
    .select("id, user_id, title, meta, trade_category_id, status, seller_listing_state, sold_buyer_id, price, images, updated_at, created_at")
    .eq("user_id", userId);

  if (postErr) {
    return NextResponse.json({ error: postErr.message }, { status: 500 });
  }

  const sellingMine = (candidatePosts ?? [])
    .map((p) => p as Record<string, unknown>)
    .filter((p) => postOwnedByUserId(p, userId))
    .filter((p) => isSellingPostForSalesHistory(p));

  const sellingPostIds = [...new Set(sellingMine.map((p) => String(p.id)))];

  if (sellingPostIds.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const { data: postsFull } = await sbAny.from("posts").select("*").in("id", sellingPostIds);
  const postMap = new Map(
    (postsFull ?? []).map((p: Record<string, unknown>) => [String(p.id), p])
  );
  for (const mid of sellingPostIds) {
    if (postMap.has(mid)) continue;
    const { data: one } = await sbAny.from("posts").select("*").eq("id", mid).maybeSingle();
    if (one) postMap.set(mid, one as Record<string, unknown>);
  }

  await reconcileProductChatsFromItemTradeByPostIds(sbAny, sellingPostIds);
  await reconcileProductChatsFromItemTradeRoomsForUser(sbAny, userId, "seller");

  const { data: byPost, error: e1 } = await sbAny.from("product_chats").select(PC_SEL).in("post_id", sellingPostIds);
  if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 500 });
  }
  const { data: bySeller, error: e2 } = await sbAny.from("product_chats").select(PC_SEL).eq("seller_id", userId);
  if (e2) {
    return NextResponse.json({ error: e2.message }, { status: 500 });
  }

  const byId = new Map<string, Record<string, unknown>>();
  for (const r of [...(byPost ?? []), ...(bySeller ?? [])]) {
    byId.set(String((r as { id: string }).id), r as Record<string, unknown>);
  }

  const rows = [...byId.values()].filter((r) => {
    const post = postMap.get(String(r.post_id ?? ""));
    return (
      postOwnedByUserId(post, userId) &&
      isSellingPostForSalesHistory(post) &&
      sellingPostIds.includes(String(r.post_id ?? ""))
    );
  });

  rows.sort((a, b) => {
    const ta = new Date(String(a.last_message_at ?? a.created_at ?? 0)).getTime();
    const tb = new Date(String(b.last_message_at ?? b.created_at ?? 0)).getTime();
    return tb - ta;
  });

  const postIdsForRooms = [...new Set(rows.map((r) => String(r.post_id)).filter(Boolean))];
  if (postIdsForRooms.length < sellingPostIds.length) {
    for (const id of sellingPostIds) {
      if (!postIdsForRooms.includes(id)) postIdsForRooms.push(id);
    }
  }

  const { data: tradeRoomRows } = await sbAny
    .from("chat_rooms")
    .select("item_id, seller_id, buyer_id")
    .eq("room_type", "item_trade")
    .in("item_id", postIdsForRooms.length ? postIdsForRooms : sellingPostIds);

  const tradeRooms = (tradeRoomRows ?? []).map((r: Record<string, unknown>) => ({
    item_id: String(r.item_id ?? ""),
    seller_id: String(r.seller_id ?? ""),
    buyer_id: String(r.buyer_id ?? ""),
  })) as ItemTradeRoomPair[];

  const firstImageFromPostImages = await fetchFirstThumbnailByPostIds(sbAny, sellingPostIds);

  const roomIds = rows.map((r) => String(r.id)).filter(Boolean);
  const buyerReviewRooms = new Set<string>();
  if (roomIds.length > 0) {
    const { data: revRows } = await sbAny
      .from("transaction_reviews")
      .select("room_id")
      .eq("role_type", "buyer_to_seller")
      .in("room_id", roomIds);
    (revRows ?? []).forEach((x: { room_id: string }) => {
      if (x.room_id) buyerReviewRooms.add(x.room_id);
    });
  }

  const counterpartyIds = new Set<string>();
  for (const r of rows) {
    const postId = String(r.post_id ?? "");
    const post = postMap.get(postId);
    const ownerId = postAuthorUserId(post) ?? userId;
    const pc = { seller_id: String(r.seller_id ?? ""), buyer_id: String(r.buyer_id ?? "") };
    const room = pickItemTradeRoomForProductChat(postId, ownerId, pc, tradeRooms);
    const cp = counterpartyUserIdForSellerView(ownerId, pc, room);
    if (cp) counterpartyIds.add(cp);
  }

  const nickById = new Map<string, string>();
  const cpList = [...counterpartyIds];
  if (cpList.length > 0) {
    const { data: profiles } = await sbAny
      .from("profiles")
      .select("id, nickname, username")
      .in("id", cpList);
    (profiles ?? []).forEach((p: Record<string, unknown>) => {
      const id = p.id as string;
      nickById.set(id, ((p.nickname ?? p.username) as string) || "");
    });
    const needTest = cpList.filter((id) => !nickById.get(id)?.trim());
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
  }

  const chattedPostIds = new Set(rows.map((r) => String(r.post_id)));

  type ItemOut = Record<string, unknown>;
  const items: ItemOut[] = rows.map((r: Record<string, unknown>) => {
    const postId = String(r.post_id ?? "");
    const post = postMap.get(postId) as Record<string, unknown> | undefined;
    const summary = chatProductSummaryFromPostRow(post, postId);
    const rid = r.id as string;
    const thumb =
      summary.thumbnail.trim() ||
      firstImageFromPostImages.get(postId) ||
      "";
    const ownerId = postAuthorUserId(post) ?? userId;
    const pc = { seller_id: String(r.seller_id ?? ""), buyer_id: String(r.buyer_id ?? "") };
    const room = pickItemTradeRoomForProductChat(postId, ownerId, pc, tradeRooms);
    const counterpartyId = counterpartyUserIdForSellerView(ownerId, pc, room);

    return {
      chatId: rid,
      postId,
      noActiveChat: false,
      sellerId: ownerId,
      buyerId: counterpartyId,
      buyerNickname: nickById.get(counterpartyId)?.trim() || counterpartyId.slice(0, 8),
      title: summary.title,
      price: summary.price,
      status: summary.status,
      sellerListingState: summary.sellerListingState,
      thumbnail: thumb,
      lastMessageAt: (r.last_message_at as string) ?? null,
      lastMessagePreview: (r.last_message_preview as string) ?? "",
      postUpdatedAt: summary.updatedAt ?? null,
      tradeFlowStatus: (r.trade_flow_status as string) ?? "chatting",
      chatMode: (r.chat_mode as string) ?? "open",
      soldBuyerId: (post?.sold_buyer_id as string) ?? null,
      createdAt: (r.created_at as string) ?? null,
      sellerCompletedAt: (r.seller_completed_at as string) ?? null,
      buyerConfirmedAt: (r.buyer_confirmed_at as string) ?? null,
      buyerConfirmSource: (r.buyer_confirm_source as string) ?? null,
      hasBuyerReview: buyerReviewRooms.has(rid),
    };
  });

  for (const pid of sellingPostIds) {
    if (chattedPostIds.has(pid)) continue;
    const post = postMap.get(pid) as Record<string, unknown> | undefined;
    if (!post) continue;
    const summary = chatProductSummaryFromPostRow(post, pid);
    const thumb =
      summary.thumbnail.trim() ||
      firstImageFromPostImages.get(pid) ||
      "";
    items.push({
      chatId: "",
      postId: pid,
      noActiveChat: true,
      sellerId: userId,
      buyerId: "",
      buyerNickname: "—",
      title: summary.title,
      price: summary.price,
      status: summary.status,
      sellerListingState: summary.sellerListingState,
      thumbnail: thumb,
      lastMessageAt: null,
      lastMessagePreview: "",
      postUpdatedAt: summary.updatedAt ?? null,
      tradeFlowStatus: "chatting",
      chatMode: "open",
      soldBuyerId: (post?.sold_buyer_id as string) ?? null,
      createdAt: null,
      sellerCompletedAt: null,
      buyerConfirmedAt: null,
      buyerConfirmSource: null,
      hasBuyerReview: false,
    });
  }

  items.sort((a, b) => {
    const ta = new Date(
      String(a.lastMessageAt ?? a.postUpdatedAt ?? a.createdAt ?? 0)
    ).getTime();
    const tb = new Date(
      String(b.lastMessageAt ?? b.postUpdatedAt ?? b.createdAt ?? 0)
    ).getTime();
    return tb - ta;
  });

  return NextResponse.json({ items });
}
