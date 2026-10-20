import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 판매자 거래완료 처리된 채팅 목록 (구매자 미반영 구분용)
 * POST (관리자 세션). 본문 없음 → 예전 응답(최근 400건).
 * R7 목록 표준: 본문 `{ limit(20/50/100, 그 외 50), offset }` → 서버 페이지 + `total`(count: "exact").
 */
import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { getServiceOrAnonClient } from "@/lib/admin/verify-admin-user-server";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import { POST_TRADE_RELATION_SELECT } from "@/lib/posts/post-query-select";
import { normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { ADMIN_LIST_MAX_OFFSET } from "@/lib/admin/pagination/parse-admin-list-page";

export async function POST(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const supabaseEnv = requireSupabaseEnv({ requireAnonKey: true });
  if (!supabaseEnv.ok) {
    return NextResponse.json({ error: supabaseEnv.error }, { status: 500 });
  }

  const sb = getServiceOrAnonClient(
    supabaseEnv.url,
    supabaseEnv.anonKey,
    supabaseEnv.serviceKey ?? undefined
  );
   
  const sbAny = sb as any;
  const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const paged = body.limit !== undefined && body.limit !== null;
  const limit = paged ? normalizeAdminListPageSize(body.limit, 50) : 400;
  const offRaw = Math.floor(Number(body.offset));
  const offset = paged && Number.isFinite(offRaw) && offRaw > 0 ? Math.min(offRaw, ADMIN_LIST_MAX_OFFSET) : 0;

  const { data: rows, error, count } = await sbAny
    .from("product_chats")
    .select(
      "id, post_id, seller_id, buyer_id, trade_flow_status, chat_mode, seller_completed_at, buyer_confirmed_at, buyer_confirm_source, last_message_at, last_message_preview",
      { count: "exact" }
    )
    .not("seller_completed_at", "is", null)
    .order("seller_completed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = rows ?? [];
  const postIds = [...new Set(list.map((r: { post_id: string }) => r.post_id).filter(Boolean))];
  const postMap = new Map<string, Record<string, unknown>>();
  if (postIds.length) {
    const { data: posts } = await sbAny.from(POSTS_TABLE_READ).select(POST_TRADE_RELATION_SELECT).in("id", postIds);
    (posts ?? []).forEach((p: Record<string, unknown>) => {
      const id = String(p.id ?? "");
      if (id) postMap.set(id, p);
    });
  }

  const items = list.map((r: Record<string, unknown>) => {
    const postId = String(r.post_id ?? "");
    const post = postMap.get(postId);
    const title = chatProductSummaryFromPostRow(post, postId).title;
    const flow = String(r.trade_flow_status ?? "chatting");
    const buyerPending = flow === "seller_marked_done";
    return {
      roomId: r.id as string,
      postId,
      postTitle: title,
      sellerId: r.seller_id as string,
      buyerId: r.buyer_id as string,
      tradeFlowStatus: flow,
      chatMode: (r.chat_mode as string) ?? "open",
      sellerCompletedAt: (r.seller_completed_at as string) ?? null,
      buyerConfirmedAt: (r.buyer_confirmed_at as string) ?? null,
      buyerConfirmSource: (r.buyer_confirm_source as string) ?? null,
      buyerPending,
      lastMessageAt: (r.last_message_at as string) ?? null,
      lastMessagePreview: (r.last_message_preview as string) ?? "",
    };
  });

  if (!paged) return NextResponse.json({ items });
  return NextResponse.json({ ok: true, items, total: typeof count === "number" ? count : items.length, limit, offset });
}
