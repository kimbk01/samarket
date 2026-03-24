/**
 * POST /api/chat/group/start — 모임/게시판 맥락 1:1 (related_group_id 필수, 무작위 DM 불가)
 * body: { peerUserId, groupId? (uuid) | groupKey? (문자열 → 결정적 uuid) }
 * — 실제 모임 멤버십 검증은 추후 groups 테이블 연동 시 강화
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { deterministicUuid } from "@/lib/server/deterministic-uuid";
import { isUuidString } from "@/lib/shared/uuid-string";

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

  let body: { peerUserId?: string; groupId?: string; groupKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "peerUserId 필요" }, { status: 400 });
  }
  const peerUserId = norm(body.peerUserId);
  const groupIdRaw = norm(body.groupId);
  const groupKey = norm(body.groupKey);

  if (!peerUserId) {
    return NextResponse.json({ ok: false, error: "peerUserId 필요" }, { status: 400 });
  }
  if (requesterId === peerUserId) {
    return NextResponse.json({ ok: false, error: "자기 자신과는 채팅할 수 없습니다." }, { status: 400 });
  }

  let relatedGroupId: string;
  if (groupIdRaw && isUuidString(groupIdRaw)) {
    relatedGroupId = groupIdRaw;
  } else if (groupKey) {
    relatedGroupId = deterministicUuid("samarket_group", groupKey);
  } else {
    return NextResponse.json(
      { ok: false, error: "groupId(uuid) 또는 groupKey 필요" },
      { status: 400 }
    );
  }

  const { data: block1 } = await sbAny
    .from("user_blocks")
    .select("id")
    .eq("user_id", requesterId)
    .eq("blocked_user_id", peerUserId)
    .maybeSingle();
  const { data: block2 } = await sbAny
    .from("user_blocks")
    .select("id")
    .eq("user_id", peerUserId)
    .eq("blocked_user_id", requesterId)
    .maybeSingle();
  if (block1 || block2) {
    return NextResponse.json({ ok: false, error: "차단 관계에서는 채팅할 수 없습니다." }, { status: 403 });
  }

  const exQ = (a: string, b: string) =>
    sbAny
      .from("chat_rooms")
      .select("id")
      .eq("room_type", "group")
      .eq("related_group_id", relatedGroupId)
      .eq("initiator_id", a)
      .eq("peer_id", b)
      .maybeSingle();

  const { data: ex1 } = await exQ(requesterId, peerUserId);
  const { data: ex2 } = await exQ(peerUserId, requesterId);
  const existingId =
    (ex1 && typeof (ex1 as { id?: string }).id === "string" ? (ex1 as { id: string }).id : null) ??
    (ex2 && typeof (ex2 as { id?: string }).id === "string" ? (ex2 as { id: string }).id : null);
  if (existingId) {
    return NextResponse.json({ ok: true, roomId: existingId, created: false, relatedGroupId });
  }

   
  const db = sbAny as any;
  const { data: newRoom, error: roomErr } = await db
    .from("chat_rooms")
    .insert({
      room_type: "group",
      context_type: "group_context",
      related_group_id: relatedGroupId,
      initiator_id: requesterId,
      peer_id: peerUserId,
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
    { room_id: newId, user_id: peerUserId, role_in_room: "responder", is_active: true, hidden: false },
  ]);

  await db.from("chat_messages").insert({
    room_id: newId,
    sender_id: null,
    message_type: "system",
    body: "모임·게시판 관련 채팅이 시작되었습니다.",
  });

  return NextResponse.json({ ok: true, roomId: newId, created: true, relatedGroupId });
}
