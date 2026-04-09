/**
 * 관리자: 구매자 거래완료 확인 대체 처리 (seller_marked_done → buyer_confirmed, buyer_confirm_source=admin)
 * POST { roomId }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getServiceOrAnonClient } from "@/lib/admin/verify-admin-user-server";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { fetchOpsTradePolicy, reviewDeadlineIsoFromNow } from "@/lib/trade/ops-trade-policy";

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const supabaseEnv = requireSupabaseEnv({ requireAnonKey: true });
  if (!supabaseEnv.ok) {
    return NextResponse.json({ ok: false, error: supabaseEnv.error }, { status: 500 });
  }
  let body: { roomId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 필요" }, { status: 400 });
  }
  const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "roomId 필요" }, { status: 400 });
  }

  const sb = getServiceOrAnonClient(
    supabaseEnv.url,
    supabaseEnv.anonKey,
    supabaseEnv.serviceKey ?? undefined
  );
   
  const sbAny = sb as any;

  const { data: pc, error: pcErr } = await sbAny
    .from("product_chats")
    .select("id, trade_flow_status, post_id, buyer_id, seller_id")
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

  const { error: updErr } = await sbAny
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
    .eq("trade_flow_status", "seller_marked_done");

  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message ?? "저장 실패" }, { status: 500 });
  }

  try {
    const sellerId = (pc as { seller_id: string }).seller_id;
    await sbAny.from("notifications").insert({
      user_id: sellerId,
      notification_type: "status",
      title: "구매자 확인이 처리되었어요",
      body: "운영에서 거래완료 확인이 반영되었습니다.",
      link_url: `/chats/${roomId}`,
    });
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true, tradeFlowStatus: "buyer_confirmed" });
}
