/**
 * POST /api/chat/business/start — 상점/비즈 문의 1:1 (맥락: related_business_id 필수)
 * body: { operatorUserId, businessId? (uuid) | businessKey? (문자열 → 결정적 uuid) }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { deterministicUuid } from "@/lib/server/deterministic-uuid";
import { isUuidString } from "@/lib/shared/uuid-string";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";

function norm(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const requesterId = auth.userId;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정이 필요합니다." }, { status: 500 });
  }
  const sbAny = sb;
  const access = await assertVerifiedMemberForAction(sbAny as any, requesterId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  let body: { operatorUserId?: string; businessId?: string; businessKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "operatorUserId 필요" }, { status: 400 });
  }
  const operatorUserId = norm(body.operatorUserId);
  const businessIdRaw = norm(body.businessId);
  const businessKey = norm(body.businessKey);

  if (!operatorUserId) {
    return NextResponse.json({ ok: false, error: "operatorUserId 필요" }, { status: 400 });
  }
  if (requesterId === operatorUserId) {
    return NextResponse.json({ ok: false, error: "자기 자신과는 채팅할 수 없습니다." }, { status: 400 });
  }

  let relatedBusinessId: string;
  if (businessIdRaw && isUuidString(businessIdRaw)) {
    relatedBusinessId = businessIdRaw;
  } else if (businessKey) {
    relatedBusinessId = deterministicUuid("samarket_business", businessKey);
  } else {
    return NextResponse.json(
      { ok: false, error: "businessId(uuid) 또는 businessKey 필요" },
      { status: 400 }
    );
  }

  const { data: block1 } = await sbAny
    .from("user_blocks")
    .select("id")
    .eq("user_id", requesterId)
    .eq("blocked_user_id", operatorUserId)
    .maybeSingle();
  const { data: block2 } = await sbAny
    .from("user_blocks")
    .select("id")
    .eq("user_id", operatorUserId)
    .eq("blocked_user_id", requesterId)
    .maybeSingle();
  if (block1 || block2) {
    return NextResponse.json({ ok: false, error: "차단 관계에서는 채팅할 수 없습니다." }, { status: 403 });
  }

  const exQ = (a: string, b: string) =>
    sbAny
      .from("chat_rooms")
      .select("id")
      .eq("room_type", "business")
      .eq("related_business_id", relatedBusinessId)
      .eq("initiator_id", a)
      .eq("peer_id", b)
      .maybeSingle();

  const { data: ex1 } = await exQ(requesterId, operatorUserId);
  const { data: ex2 } = await exQ(operatorUserId, requesterId);
  const existingId =
    (ex1 && typeof (ex1 as { id?: string }).id === "string" ? (ex1 as { id: string }).id : null) ??
    (ex2 && typeof (ex2 as { id?: string }).id === "string" ? (ex2 as { id: string }).id : null);
  if (existingId) {
    return NextResponse.json({ ok: true, roomId: existingId, created: false, relatedBusinessId });
  }

   
  const db = sbAny as any;
  const { data: newRoom, error: roomErr } = await db
    .from("chat_rooms")
    .insert({
      room_type: "business",
      context_type: "business_context",
      related_business_id: relatedBusinessId,
      initiator_id: requesterId,
      peer_id: operatorUserId,
      request_status: "approved",
      participants_count: 2,
    })
    .select("id")
    .single();

  const newId = newRoom && typeof (newRoom as { id?: string }).id === "string" ? (newRoom as { id: string }).id : null;
  if (roomErr || !newId) {
    return NextResponse.json(
      { ok: false, error: roomErr?.message ?? "채팅방 생성에 실패했습니다." },
      { status: 500 }
    );
  }

  await db.from("chat_room_participants").insert([
    { room_id: newId, user_id: requesterId, role_in_room: "requester", is_active: true, hidden: false },
    { room_id: newId, user_id: operatorUserId, role_in_room: "responder", is_active: true, hidden: false },
  ]);

  await db.from("chat_messages").insert({
    room_id: newId,
    sender_id: null,
    message_type: "system",
    body: "상점 문의 채팅이 시작되었습니다.",
  });

  return NextResponse.json({ ok: true, roomId: newId, created: true, relatedBusinessId });
}
