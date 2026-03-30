/**
 * POST /api/chat/general/request — 일반 채팅 요청 (요청자=세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";

const CONTEXT_TYPES = [
  "neighborhood",
  "group",
  "job",
  "real_estate",
  "support",
  "delivery",
  "biz_profile",
  "etc",
];

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

  let body: { contextType?: string; receiverId?: string; requestMessage?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "contextType, receiverId 필요" }, { status: 400 });
  }
  const contextType = typeof body.contextType === "string" ? body.contextType.trim() : "";
  const receiverId = typeof body.receiverId === "string" ? body.receiverId.trim() : "";
  if (!CONTEXT_TYPES.includes(contextType)) {
    return NextResponse.json({ ok: false, error: "올바른 contextType이 필요합니다." }, { status: 400 });
  }
  if (!receiverId || !requesterId) {
    return NextResponse.json({ ok: false, error: "receiverId와 로그인이 필요합니다." }, { status: 401 });
  }
  if (requesterId === receiverId) {
    return NextResponse.json({ ok: false, error: "자기 자신에게는 채팅 요청할 수 없습니다." }, { status: 400 });
  }

  const sbAny = sb;
  const access = await assertVerifiedMemberForAction(sbAny as any, requesterId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  // 차단 확인
  const { data: block1 } = await sbAny
    .from("user_blocks")
    .select("id")
    .eq("user_id", requesterId)
    .eq("blocked_user_id", receiverId)
    .maybeSingle();
  const { data: block2 } = await sbAny
    .from("user_blocks")
    .select("id")
    .eq("user_id", receiverId)
    .eq("blocked_user_id", requesterId)
    .maybeSingle();
  if (block1 || block2) {
    return NextResponse.json({ ok: false, error: "차단 관계에서는 채팅할 수 없습니다." }, { status: 403 });
  }

  // 기존 room (general_chat, 동일 context + user pair) — 재사용 또는 reopen
  const { data: existing1 } = await sbAny
    .from("chat_rooms")
    .select("id, request_status")
    .eq("room_type", "general_chat")
    .eq("context_type", contextType)
    .eq("initiator_id", requesterId)
    .eq("peer_id", receiverId)
    .maybeSingle();
  const { data: existing2 } = await sbAny
    .from("chat_rooms")
    .select("id, request_status")
    .eq("room_type", "general_chat")
    .eq("context_type", contextType)
    .eq("initiator_id", receiverId)
    .eq("peer_id", requesterId)
    .maybeSingle();
  const existing = (existing1 ?? existing2) as { id: string; request_status: string } | undefined;
  if (existing?.id) {
    if (existing.request_status === "approved") {
      return NextResponse.json({ ok: true, roomId: existing.id, requestId: null, alreadyApproved: true });
    }
    if (existing.request_status === "pending") {
      return NextResponse.json({ ok: true, roomId: existing.id, requestId: null, alreadyPending: true });
    }
    // rejected/expired → reopen 시 새 요청으로 처리 가능. 기존 room 업데이트
    const { data: reqRow } = await sbAny
      .from("chat_requests")
      .select("id")
      .eq("room_id", existing.id)
      .eq("requester_id", requesterId)
      .eq("receiver_id", receiverId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const requestMessage = typeof body.requestMessage === "string" ? body.requestMessage.trim().slice(0, 500) : "";
    const { data: newReq } = await sbAny
      .from("chat_requests")
      .insert({
        room_id: existing.id,
        context_type: contextType,
        requester_id: requesterId,
        receiver_id: receiverId,
        request_message: requestMessage,
        status: "pending",
      })
      .select("id")
      .single();
    await sbAny
      .from("chat_rooms")
      .update({ request_status: "pending", updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return NextResponse.json({
      ok: true,
      roomId: existing.id,
      requestId: newReq?.id ?? null,
    });
  }

  // 새 room + request
  const { data: newRoom, error: roomErr } = await sbAny
    .from("chat_rooms")
    .insert({
      room_type: "general_chat",
      context_type: contextType,
      initiator_id: requesterId,
      peer_id: receiverId,
      request_status: "pending",
    })
    .select("id")
    .single();

  if (roomErr || !newRoom?.id) {
    return NextResponse.json(
      { ok: false, error: roomErr?.message ?? "채팅방 생성에 실패했습니다." },
      { status: 500 }
    );
  }
  const roomId = newRoom.id as string;
  const requestMessage = typeof body.requestMessage === "string" ? body.requestMessage.trim().slice(0, 500) : "";
  const { data: newReq, error: reqErr } = await sbAny
    .from("chat_requests")
    .insert({
      room_id: roomId,
      context_type: contextType,
      requester_id: requesterId,
      receiver_id: receiverId,
      request_message: requestMessage,
      status: "pending",
    })
    .select("id")
    .single();

  if (!reqErr) {
    await sbAny.from("chat_room_participants").insert([
      { room_id: roomId, user_id: requesterId, role_in_room: "requester" },
      { room_id: roomId, user_id: receiverId, role_in_room: "responder" },
    ]);
  }

  return NextResponse.json({
    ok: true,
    roomId,
    requestId: newReq?.id ?? null,
  });
}
