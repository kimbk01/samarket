import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getTradeServiceClient } from "@/lib/trade/service-supabase";
import { resolveProductChat } from "@/lib/trade/resolve-product-chat";
import { applyTrustScoreDelta } from "@/lib/trust/trust-score-apply";
import { TRUST_EVENT_DELTAS } from "@/lib/trust/trust-score-core";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";

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

  for (const uid of [pc.seller_id, pc.buyer_id]) {
    try {
      await sbAny.from("reputation_logs").insert({
        user_id: uid,
        source_type: "dispute_hold",
        source_id: resolved.productChatId,
        delta: 0,
        status: "held",
        reason: "trade_dispute_buyer_report",
        metadata: { room_id: resolved.productChatId, post_id: pc.post_id },
      });
    } catch {
      /* ignore */
    }
  }

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
    await sbAny.from("notifications").insert({
      user_id: pc.seller_id,
      notification_type: "report",
      title: "거래 관련 문의가 접수되었어요",
      body: "운영팀 검토 전까지 온도 반영이 보류될 수 있어요.",
      link_url: tradeChatNotificationHref(resolved.productChatId, "product_chat"),
    });
  } catch {
    /* ignore */
  }

  try {
    await applyTrustScoreDelta(sbAny, {
      userId: pc.seller_id,
      sourceType: "report",
      sourceId: resolved.productChatId,
      baseDelta: TRUST_EVENT_DELTAS.report,
      recentPositiveBoost: false,
      reason: "buyer_issue_trade_dispute",
      metadata: { room_id: resolved.productChatId, reporter_id: userId },
    });
  } catch {
    /* trust_score 미적용 DB */
  }

  return NextResponse.json({ ok: true, tradeFlowStatus: "dispute" });
}
