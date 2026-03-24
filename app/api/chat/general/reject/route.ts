/**
 * POST /api/chat/general/reject — 일반 채팅 요청 거절 (세션=수신자)
 * Body: { roomId: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정이 필요합니다." }, { status: 500 });
  }

  let body: { roomId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "roomId 필요" }, { status: 400 });
  }
  const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "roomId 필요" }, { status: 400 });
  }

  const sbAny = sb;
  const { data: room } = await sbAny
    .from("chat_rooms")
    .select("id, room_type, request_status, peer_id")
    .eq("id", roomId)
    .eq("room_type", "general_chat")
    .maybeSingle();

  if (!room || (room as { request_status: string }).request_status !== "pending") {
    return NextResponse.json({ ok: false, error: "처리할 수 있는 요청이 없습니다." }, { status: 400 });
  }
  const r = room as { peer_id: string };
  if (r.peer_id !== userId) {
    return NextResponse.json({ ok: false, error: "요청 수신자만 거절할 수 있습니다." }, { status: 403 });
  }

  const now = new Date().toISOString();
  await sbAny
    .from("chat_rooms")
    .update({ request_status: "rejected", updated_at: now })
    .eq("id", roomId);
  await sbAny
    .from("chat_requests")
    .update({ status: "rejected", responded_at: now })
    .eq("room_id", roomId)
    .eq("receiver_id", userId);

  return NextResponse.json({ ok: true, roomId });
}
