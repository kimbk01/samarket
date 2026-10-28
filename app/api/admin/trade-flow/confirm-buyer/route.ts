/**
 * 관리자: 구매자 거래완료 확인 대체 처리 (seller_marked_done → buyer_confirmed, buyer_confirm_source=admin)
 * POST { roomId }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import {
  TRADE_FLOW_ADMIN_REASON_MIN_LENGTH,
  parseTradeFlowAdminReason,
} from "@/lib/admin/trade-flow/trade-flow-admin-action";
import { getServiceOrAnonClient } from "@/lib/admin/verify-admin-user-server";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { fetchOpsTradePolicy, reviewDeadlineIsoFromNow } from "@/lib/trade/ops-trade-policy";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const supabaseEnv = requireSupabaseEnv({ requireAnonKey: true });
  if (!supabaseEnv.ok) {
    return NextResponse.json({ ok: false, error: supabaseEnv.error }, { status: 500 });
  }
  let body: { roomId?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 필요" }, { status: 400 });
  }
  const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "roomId 필요" }, { status: 400 });
  }
  const reason = parseTradeFlowAdminReason(body.reason);
  if (!reason) {
    return NextResponse.json(
      { ok: false, error: "reason_required", reasonMinLength: TRADE_FLOW_ADMIN_REASON_MIN_LENGTH },
      { status: 400 }
    );
  }

  const sb = getServiceOrAnonClient(
    supabaseEnv.url,
    supabaseEnv.anonKey,
    supabaseEnv.serviceKey ?? undefined
  );
   
  const sbAny = sb as any;

  const { data: pc, error: pcErr } = await sbAny
    .from("product_chats")
    .select("id, trade_flow_status, post_id, buyer_id, seller_id, community_messenger_room_id")
    .eq("id", roomId)
    .maybeSingle();

  if (pcErr || !pc) {
    return NextResponse.json({ ok: false, error: "채팅방을 찾을 수 없습니다." }, { status: 404 });
  }

  const flow = String((pc as { trade_flow_status?: string }).trade_flow_status ?? "chatting");
  if (flow !== "seller_marked_done") {
    return NextResponse.json(
      { ok: false, error: "구매자 확인 대기(seller_marked_done) 단계만 처리할 수 있습니다." },
      { status: 409 }
    );
  }

  const policy = await fetchOpsTradePolicy(sb);
  const now = new Date().toISOString();
  const reviewDeadlineAt = reviewDeadlineIsoFromNow(policy.buyerReviewDeadlineDays);

  const { data: updRows, error: updErr } = await sbAny
    .from("product_chats")
    .update({
      trade_flow_status: "buyer_confirmed",
      buyer_confirmed_at: now,
      buyer_confirm_source: "admin",
      review_deadline_at: reviewDeadlineAt,
      chat_mode: "open",
      updated_at: now,
    })
    .eq("id", roomId)
    .eq("trade_flow_status", "seller_marked_done")
    .select("id");

  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message ?? "저장 실패" }, { status: 500 });
  }
  if (!Array.isArray(updRows) || updRows.length === 0) {
    return NextResponse.json({ ok: false, error: "conflict" }, { status: 409 });
  }

  await appendAdminRouteAudit(sbAny, req, {
    actorId: admin.actor.userId,
    targetType: "product_chat",
    targetId: roomId,
    action: "trade_flow.confirm_buyer",
    before: { trade_flow_status: flow },
    after: { trade_flow_status: "buyer_confirmed", buyer_confirm_source: "admin", reason },
  });

  try {
    const sellerId = (pc as { seller_id: string }).seller_id;
    const confirmLang = await loadNotificationUserLanguage(sbAny, sellerId);
    await appendUserNotification(sbAny, {
      user_id: sellerId,
      notification_type: "status",
      // 4절 문구 — 문구 모음 사용(받는 사람 언어)
      title: notifySafeT(confirmLang, "notify_trade_admin_buyer_confirmed_title"),
      body: notifySafeT(confirmLang, "notify_trade_admin_buyer_confirmed_body"),
      // B-08: 메신저 방 id 가 있으면 그 방으로(buyer-issue 와 같은 방식), 없을 때만 거래방 id.
      link_url: tradeChatNotificationHref(
        String(
          (pc as { community_messenger_room_id?: string | null }).community_messenger_room_id ?? ""
        ).trim() || roomId,
        "product_chat"
      ),
      domain: "trade_chat",
      ref_id: roomId,
      dedupe_key: `admin-buyer-confirm:${roomId}`,
      push_kind: "trade",
      meta: {
        kind: "trade_completed",
        room_id: roomId,
        product_id: (pc as { post_id?: string | null }).post_id ?? null,
        admin_action: "buyer_confirmed",
      },
    });
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true, tradeFlowStatus: "buyer_confirmed" });
}
