/**
 * 판매내역 — 내 판매 글 + 연결된 product_chats (채팅 없는 글은 「문의 없음」 행으로 표시)
 * GET /api/my/sales (세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createClient } from "@supabase/supabase-js";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import { fetchFirstThumbnailByPostIds } from "@/lib/mypage/fetch-first-post-thumbnails";
import { applyBuyerAutoConfirmAllDue } from "@/lib/trade/apply-buyer-auto-confirm";
import {
  loadSalesHistoryRows,
  countSalesHistoryItems,
} from "@/lib/mypage/trade-history-load-server";
import {
  counterpartyUserIdForSellerView,
  pickItemTradeRoomForProductChat,
  type ItemTradeRoomPair,
} from "@/lib/mypage/sales-history-scope";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const countOnly = req.nextUrl.searchParams.get("count_only") === "1";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  await applyBuyerAutoConfirmAllDue(sbAny);

  let rows: Record<string, unknown>[];
  let sellingPostIds: string[];
  let postMap: Map<string, Record<string, unknown>>;
  try {
    const loaded = await loadSalesHistoryRows(sbAny, userId);
    rows = loaded.rows;
    sellingPostIds = loaded.sellingPostIds;
    postMap = loaded.postMap;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "load failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (sellingPostIds.length === 0) {
    return NextResponse.json(countOnly ? { ok: true, count: 0 } : { items: [] });
  }

  if (countOnly) {
    return NextResponse.json({
      ok: true,
      count: countSalesHistoryItems(rows, sellingPostIds),
    });
  }

  const postIdsForRooms = [...new Set(rows.map((r) => String(r.post_id)).filter(Boolean))];
  if (postIdsForRooms.length < sellingPostIds.length) {
    for (const id of sellingPostIds) {
      if (!postIdsForRooms.includes(id)) postIdsForRooms.push(id);
    }
  }

  const roomIds = rows.map((r) => String(r.id)).filter(Boolean);
  const [tradeRoomRows, firstImageFromPostImages, buyerReviewRows] = await Promise.all([
    sbAny
      .from("chat_rooms")
      .select("item_id, seller_id, buyer_id")
      .eq("room_type", "item_trade")
      .in("item_id", postIdsForRooms.length ? postIdsForRooms : sellingPostIds)
      .then(
        ({ data }: { data: Record<string, unknown>[] | null }) => data ?? []
      ),
    fetchFirstThumbnailByPostIds(sbAny, sellingPostIds),
    roomIds.length > 0
      ? sbAny
          .from("transaction_reviews")
          .select("room_id")
          .eq("role_type", "buyer_to_seller")
          .in("room_id", roomIds)
          .then(
            ({ data }: { data: { room_id: string }[] | null }) => data ?? []
          )
      : Promise.resolve([] as { room_id: string }[]),
  ]);

  const tradeRooms = tradeRoomRows.map((r: Record<string, unknown>) => ({
    item_id: String(r.item_id ?? ""),
    seller_id: String(r.seller_id ?? ""),
    buyer_id: String(r.buyer_id ?? ""),
  })) as ItemTradeRoomPair[];

  const buyerReviewRooms = new Set(
    buyerReviewRows.map((x) => x.room_id).filter(Boolean)
  );

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
