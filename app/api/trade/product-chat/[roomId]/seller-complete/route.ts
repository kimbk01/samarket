import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getTradeServiceClient } from "@/lib/trade/service-supabase";
import { resolveProductChat } from "@/lib/trade/resolve-product-chat";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";

/**
 * 판매자 거래완료 — posts sold + sold_buyer_id, 동일 글 다른 채팅방 archived/readonly
 * 인증: 세션(또는 로컬 전용 테스트 쿠키)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const sb = getTradeServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }

  const { roomId } = await params;
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  if (!roomId?.trim()) {
    return NextResponse.json({ ok: false, error: "roomId 필요" }, { status: 400 });
  }
  const access = await assertVerifiedMemberForAction(sb as any, userId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  const resolved = await resolveProductChat(sb, roomId.trim());
  if (!resolved) {
    return NextResponse.json({ ok: false, error: "채팅방을 찾을 수 없습니다." }, { status: 404 });
  }

  const pc = resolved.productChat;
  if (pc.seller_id !== userId) {
    return NextResponse.json({ ok: false, error: "판매자만 거래완료할 수 있습니다." }, { status: 403 });
  }

  const sbAny = sb;
  const { data: post, error: postErr } = await sbAny
    .from(POSTS_TABLE_READ)
    .select("id, status, sold_buyer_id, user_id")
    .eq("id", pc.post_id)
    .maybeSingle();

  if (postErr || !post) {
    return NextResponse.json({ ok: false, error: "상품을 찾을 수 없습니다." }, { status: 404 });
  }

  const row = post as { status?: string; sold_buyer_id?: string | null };
  if (row.status === "sold" && row.sold_buyer_id && row.sold_buyer_id !== pc.buyer_id) {
    return NextResponse.json(
      { ok: false, error: "이미 다른 구매자와 거래가 완료된 상품입니다." },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();

  const postPatch: Record<string, unknown> = {
    status: "sold",
    sold_buyer_id: pc.buyer_id,
    seller_listing_state: "completed",
    reserved_buyer_id: null,
    updated_at: now,
  };
  let { error: updPostErr } = await sbAny.from(POSTS_TABLE_WRITE).update(postPatch).eq("id", pc.post_id);
  if (
    updPostErr &&
    /reserved_buyer_id|column/i.test(String(updPostErr.message)) &&
    /does not exist|unknown/i.test(String(updPostErr.message))
  ) {
    const rest = { ...postPatch };
    delete rest.reserved_buyer_id;
    const r2 = await sbAny.from(POSTS_TABLE_WRITE).update(rest).eq("id", pc.post_id);
    updPostErr = r2.error;
  }

  if (updPostErr) {
    return NextResponse.json(
      { ok: false, error: updPostErr.message ?? "상품 상태 저장 실패" },
      { status: 500 }
    );
  }

  await sbAny
    .from("product_chats")
    .update({
      trade_flow_status: "seller_marked_done",
      seller_completed_at: now,
      review_deadline_at: null,
      buyer_confirm_source: null,
      chat_mode: "open",
    })
    .eq("id", resolved.productChatId);

  await sbAny
    .from("product_chats")
    .update({
      trade_flow_status: "archived",
      chat_mode: "readonly",
    })
    .eq("post_id", pc.post_id)
    .neq("id", resolved.productChatId);

  try {
    await sbAny
      .from("chat_rooms")
      .update({ trade_status: "completed", updated_at: now })
      .eq("room_type", "item_trade")
      .eq("item_id", pc.post_id)
      .eq("seller_id", pc.seller_id)
      .eq("buyer_id", pc.buyer_id);
  } catch {
    /* chat_rooms 없으면 무시 */
  }

  try {
    await sbAny.from("notifications").insert({
      user_id: pc.buyer_id,
      notification_type: "status",
      title: "거래가 완료 처리되었어요",
      body: "정상 거래였다면 거래완료 확인 후 평가·후기를 남겨 주세요.",
      link_url: tradeChatNotificationHref(resolved.productChatId, "product_chat"),
    });
  } catch {
    /* 알림 실패 무시 */
  }

  return NextResponse.json({
    ok: true,
    tradeFlowStatus: "seller_marked_done",
    productChatId: resolved.productChatId,
  });
}
