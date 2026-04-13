import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

/**
 * 구매내역 상세 — buyer 본인 + 해당 product_chat만
 * GET /api/my/purchases/[chatId] (세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import { fetchFirstThumbnailByPostIds } from "@/lib/mypage/fetch-first-post-thumbnails";
import { applyBuyerAutoConfirmForRoom } from "@/lib/trade/apply-buyer-auto-confirm";
import { POST_TRADE_RELATION_SELECT } from "@/lib/posts/post-query-select";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const { chatId } = await params;
  if (!chatId?.trim()) {
    return NextResponse.json({ error: "chatId 필요" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const { data: r, error } = await sbAny
    .from("product_chats")
    .select(
      "id, post_id, seller_id, buyer_id, created_at, last_message_at, trade_flow_status, chat_mode, seller_completed_at, buyer_confirmed_at, review_deadline_at, buyer_confirm_source"
    )
    .eq("id", chatId.trim())
    .maybeSingle();

  if (error || !r || (r as { buyer_id: string }).buyer_id !== userId) {
    return NextResponse.json({ error: "구매 내역을 찾을 수 없습니다." }, { status: 404 });
  }

  await applyBuyerAutoConfirmForRoom(sbAny, chatId.trim());

  const { data: r2 } = await sbAny
    .from("product_chats")
    .select(
      "id, post_id, seller_id, buyer_id, created_at, last_message_at, trade_flow_status, chat_mode, seller_completed_at, buyer_confirmed_at, review_deadline_at, buyer_confirm_source"
    )
    .eq("id", chatId.trim())
    .maybeSingle();
  const rFresh = r2 ?? r;

  const row = rFresh as Record<string, unknown>;
  const postId = row.post_id as string;
  const sellerId = row.seller_id as string;

  const { data: post } = await sbAny.from(POSTS_TABLE_READ).select(POST_TRADE_RELATION_SELECT).eq("id", postId).maybeSingle();
  const p = post as Record<string, unknown> | null;
  const summary = chatProductSummaryFromPostRow(p ?? undefined, postId);
  const thumbExtras = await fetchFirstThumbnailByPostIds(sbAny, [postId]);
  const thumbnail = summary.thumbnail.trim() || thumbExtras.get(postId) || "";

  const { data: prof } = await sbAny
    .from("profiles")
    .select("id, nickname, username")
    .eq("id", sellerId)
    .maybeSingle();
  const pr = prof as Record<string, unknown> | null;
  let sellerNickname = ((pr?.nickname ?? pr?.username) as string) || "";
  if (!sellerNickname.trim()) {
    const { data: tu } = await sbAny
      .from("test_users")
      .select("display_name, username")
      .eq("id", sellerId)
      .maybeSingle();
    const t = tu as Record<string, unknown> | null;
    sellerNickname = ((t?.display_name ?? t?.username) as string) || sellerId.slice(0, 8);
  }

  const { data: rev } = await sbAny
    .from("transaction_reviews")
    .select("id")
    .eq("room_id", chatId.trim())
    .eq("reviewer_id", userId)
    .eq("role_type", "buyer_to_seller")
    .maybeSingle();

  return NextResponse.json({
    chatId: row.id as string,
    postId,
    sellerId,
    sellerNickname,
    title: summary.title,
    price: summary.price,
    status: summary.status,
    sellerListingState: summary.sellerListingState,
    thumbnail,
    soldBuyerId: (p?.sold_buyer_id as string) ?? null,
    tradeFlowStatus: (row.trade_flow_status as string) ?? "chatting",
    chatMode: (row.chat_mode as string) ?? "open",
    createdAt: (row.created_at as string) ?? null,
    lastMessageAt: (row.last_message_at as string) ?? null,
    sellerCompletedAt: (row.seller_completed_at as string) ?? null,
    buyerConfirmedAt: (row.buyer_confirmed_at as string) ?? null,
    reviewDeadlineAt: (row.review_deadline_at as string) ?? null,
    buyerConfirmSource: (row.buyer_confirm_source as string) ?? null,
    hasBuyerReview: !!rev,
  });
}
