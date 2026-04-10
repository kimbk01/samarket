import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getTradeServiceClient } from "@/lib/trade/service-supabase";
import { resolveProductChat } from "@/lib/trade/resolve-product-chat";
import { fetchOpsTradePolicy, reviewDeadlineIsoFromNow } from "@/lib/trade/ops-trade-policy";
import { applyTrustScoreDeltaToMany } from "@/lib/trust/trust-score-apply";
import { TRUST_EVENT_DELTAS } from "@/lib/trust/trust-score-core";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";

/** 구매자 거래완료 확인(buyer-confirm) — 평가·후기 작성 가능 상태로 */
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
  if (pc.buyer_id !== userId) {
    return NextResponse.json({ ok: false, error: "구매자만 거래완료 확인을 할 수 있습니다." }, { status: 403 });
  }

  const flow = String(pc.trade_flow_status ?? "chatting");
  const applyTradeTrust = flow === "seller_marked_done";
  if (flow !== "seller_marked_done" && flow !== "buyer_confirmed" && flow !== "review_pending") {
    return NextResponse.json(
      { ok: false, error: "판매자 거래완료 처리 후에 거래완료 확인을 할 수 있습니다." },
      { status: 409 }
    );
  }

  const sbAny = sb;
  const { data: post } = await sbAny
    .from("posts")
    .select("sold_buyer_id, status")
    .eq("id", pc.post_id)
    .maybeSingle();
  const p = post as { sold_buyer_id?: string | null; status?: string } | null;
  if (p?.status === "sold" && p.sold_buyer_id && p.sold_buyer_id !== pc.buyer_id) {
    return NextResponse.json({ ok: false, error: "이 거래의 구매자가 아닙니다." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const policy = await fetchOpsTradePolicy(sb);
  const reviewDeadlineAt = reviewDeadlineIsoFromNow(policy.buyerReviewDeadlineDays);
  await sbAny
    .from("product_chats")
    .update({
      trade_flow_status: "buyer_confirmed",
      buyer_confirmed_at: now,
      buyer_confirm_source: "user",
      review_deadline_at: reviewDeadlineAt,
      chat_mode: "open",
    })
    .eq("id", resolved.productChatId);

  try {
    await sbAny.from("notifications").insert({
      user_id: pc.seller_id,
      notification_type: "status",
      title: "구매자가 거래를 확인했어요",
      body: "서로 후기를 남기실 수 있어요.",
      link_url: tradeChatNotificationHref(resolved.productChatId, "product_chat"),
    });
  } catch {
    /* ignore */
  }

  if (applyTradeTrust) {
    try {
      await applyTrustScoreDeltaToMany(sbAny, [pc.seller_id, pc.buyer_id], {
        baseDelta: TRUST_EVENT_DELTAS.trade_complete,
        sourceType: "trade_complete",
        sourceId: resolved.productChatId,
        recentPositiveBoost: true,
        reason: "buyer_confirmed_trade_complete",
        metadata: { room_id: resolved.productChatId, post_id: pc.post_id },
      });
    } catch {
      /* trust_score 미적용 DB */
    }
  }

  return NextResponse.json({ ok: true, tradeFlowStatus: "buyer_confirmed" });
}
