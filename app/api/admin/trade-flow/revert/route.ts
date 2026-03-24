/**
 * 관리자: 해당 채팅방 거래 완료·후기 구간을 되돌림 → 판매중(chatting) + 동일 글 다른 방 복구 + 후기·온도 로그 정리
 * POST { roomId: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getServiceOrAnonClient } from "@/lib/admin/verify-admin-user-server";

const REVERTABLE = new Set([
  "seller_marked_done",
  "buyer_confirmed",
  "review_pending",
  "review_completed",
  "archived",
  "dispute",
]);

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

  const sb = getServiceOrAnonClient(url, anonKey, serviceKey);
   
  const sbAny = sb as any;

  const { data: pc, error: pcErr } = await sbAny
    .from("product_chats")
    .select("id, post_id, buyer_id, seller_id, trade_flow_status")
    .eq("id", roomId)
    .maybeSingle();

  if (pcErr || !pc) {
    return NextResponse.json({ ok: false, error: "채팅방을 찾을 수 없습니다." }, { status: 404 });
  }

  const row = pc as {
    id: string;
    post_id: string;
    buyer_id: string;
    seller_id: string;
    trade_flow_status: string | null;
  };
  const flow = String(row.trade_flow_status ?? "chatting");
  if (flow === "chatting") {
    return NextResponse.json({ ok: false, error: "이미 판매중(채팅) 단계입니다." }, { status: 409 });
  }
  if (!REVERTABLE.has(flow)) {
    return NextResponse.json({ ok: false, error: "되돌릴 수 없는 거래 단계입니다." }, { status: 409 });
  }

  const postId = row.post_id;
  const buyerId = row.buyer_id;

  const { data: postRow } = await sbAny
    .from("posts")
    .select("id, status, sold_buyer_id")
    .eq("id", postId)
    .maybeSingle();
  const pMeta = postRow as { status?: string; sold_buyer_id?: string | null } | null;
  if (
    pMeta?.status === "sold" &&
    pMeta.sold_buyer_id &&
    buyerId !== pMeta.sold_buyer_id
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "판매가 확정된 구매자와의 채팅방에서만 전체 되돌리기를 할 수 있습니다.",
      },
      { status: 409 }
    );
  }

  const { data: revLogs } = await sbAny
    .from("reputation_logs")
    .select("id, user_id, delta")
    .eq("source_type", "review")
    .eq("source_id", roomId);

  for (const log of revLogs ?? []) {
    const lid = log as { user_id: string; delta: number };
    const uid = lid.user_id;
    const delta = Number(lid.delta);
    if (!uid || Number.isNaN(delta)) continue;
    try {
      const { data: prof } = await sbAny
        .from("profiles")
        .select("manner_temperature")
        .eq("id", uid)
        .maybeSingle();
      const cur = Number((prof as { manner_temperature?: number } | null)?.manner_temperature ?? 36.5);
      const next = Math.min(99, Math.max(0, Math.round((cur - delta) * 10) / 10));
      await sbAny.from("profiles").update({ manner_temperature: next }).eq("id", uid);
    } catch {
      /* profiles 없으면 무시 */
    }
  }

  await sbAny.from("reputation_logs").delete().eq("source_type", "review").eq("source_id", roomId);
  await sbAny.from("transaction_reviews").delete().eq("room_id", roomId);

  if (pMeta?.status === "sold" && pMeta.sold_buyer_id === buyerId) {
    const now = new Date().toISOString();
    await sbAny
      .from("posts")
      .update({
        status: "active",
        sold_buyer_id: null,
        seller_listing_state: "inquiry",
        updated_at: now,
      })
      .eq("id", postId);
  }

  const now = new Date().toISOString();
  await sbAny
    .from("product_chats")
    .update({
      trade_flow_status: "chatting",
      chat_mode: "open",
      seller_completed_at: null,
      buyer_confirmed_at: null,
      buyer_confirm_source: null,
      review_deadline_at: null,
      updated_at: now,
    })
    .eq("post_id", postId);

  try {
    await sbAny
      .from("chat_rooms")
      .update({ trade_status: "inquiry", updated_at: now })
      .eq("room_type", "item_trade")
      .eq("item_id", postId);
  } catch {
    /* 테이블 없으면 무시 */
  }

  return NextResponse.json({ ok: true, postId, roomId });
}
