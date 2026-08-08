import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getTradeServiceClient } from "@/lib/trade/service-supabase";
import { resolveProductChat } from "@/lib/trade/resolve-product-chat";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 구매자 문제있어요 — 분쟁 + 온도 보류 로그 + 신고 접수 */
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
  let body: { detail?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const detail = typeof body.detail === "string" ? body.detail.trim().slice(0, 500) : "";
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
  if (pc.buyer_id !== userId) {
    return NextResponse.json({ ok: false, error: "구매자만 접수할 수 있습니다." }, { status: 403 });
  }

  const sbAny = sb;
  const now = new Date().toISOString();

  await sbAny
    .from("product_chats")
    .update({
      trade_flow_status: "dispute",
      chat_mode: "open",
    })
    .eq("id", resolved.productChatId);

  /* Manner Battery SSOT: dispute/report is moderation process only — no reputation_logs score side-channel. */

  try {
    await sbAny.from("reports").insert({
      reporter_id: userId,
      target_type: "chat_room",
      target_id: resolved.productChatId,
      room_id: resolved.productChatId,
      product_id: pc.post_id,
      reason_code: "trade_dispute",
      reason_text: detail || "구매자 문제있어요",
      status: "pending",
    });
  } catch {
    /* reports 테이블 없으면 무시 */
  }

  try {
    await appendUserNotification(sbAny, {
      user_id: pc.seller_id,
      notification_type: "report",
      title: "거래 관련 문의가 접수되었어요",
      body: "운영팀에서 내용을 검토할 예정이에요.",
      link_url: tradeChatNotificationHref(resolved.productChatId, "product_chat"),
      domain: "trade_chat",
      ref_id: resolved.productChatId,
      sender_id: userId,
      dedupe_key: `trade-dispute:${resolved.productChatId}:${userId}`,
      push_kind: "community",
      meta: {
        kind: "trade_dispute",
        room_id: resolved.productChatId,
        product_id: pc.post_id,
        actor_id: userId,
      },
    });
  } catch {
    /* ignore */
  }

  /* Manner Battery SSOT: REPORT_CREATED is NOT score-eligible — no trust_events / no -5. */

  return NextResponse.json({ ok: true, tradeFlowStatus: "dispute" });
}
