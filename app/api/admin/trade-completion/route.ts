/**
 * 판매자 거래완료 처리된 채팅 목록 (구매자 미반영 구분용)
 * POST (본문 없음, 관리자 세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getServiceOrAnonClient } from "@/lib/admin/verify-admin-user-server";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import { POST_TRADE_RELATION_SELECT } from "@/lib/posts/post-query-select";

export async function POST(_req: NextRequest) {
  const admin = await requireAdminApiUser();
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

  const { data: rows, error } = await sbAny
    .from("product_chats")
    .select(
      "id, post_id, seller_id, buyer_id, trade_flow_status, chat_mode, seller_completed_at, buyer_confirmed_at, buyer_confirm_source, last_message_at, last_message_preview"
    )
    .not("seller_completed_at", "is", null)
    .order("seller_completed_at", { ascending: false })
    .limit(400);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = rows ?? [];
  const postIds = [...new Set(list.map((r: { post_id: string }) => r.post_id).filter(Boolean))];
  const postMap = new Map<string, Record<string, unknown>>();
  if (postIds.length) {
    const { data: posts } = await sbAny.from("posts").select(POST_TRADE_RELATION_SELECT).in("id", postIds);
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

  return NextResponse.json({ items });
}
