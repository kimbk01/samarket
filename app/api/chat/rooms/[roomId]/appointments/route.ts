/**
 * POST /api/chat/rooms/:roomId/appointments — 약속 생성 (세션)
 * Body: { appointmentAt, placeText?, memo?, reminderMinutes? }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }
  const { roomId } = await params;
  let body: {
    appointmentAt?: string;
    placeText?: string;
    memo?: string;
    reminderMinutes?: number;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const appointmentAt = typeof body.appointmentAt === "string" ? body.appointmentAt.trim() : "";
  if (!roomId || !appointmentAt) {
    return NextResponse.json({ ok: false, error: "roomId, appointmentAt 필요" }, { status: 400 });
  }

  const sbAny = sb;
  const { data: room } = await sbAny
    .from("chat_rooms")
    .select("id, item_id")
    .eq("id", roomId)
    .maybeSingle();

  if (!room) {
    return NextResponse.json({ ok: false, error: "채팅방을 찾을 수 없습니다." }, { status: 404 });
  }
  const { data: part } = await sbAny
    .from("chat_room_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .eq("hidden", false)
    .maybeSingle();
  if (!part) {
    return NextResponse.json({ ok: false, error: "참여자만 약속을 만들 수 있습니다." }, { status: 403 });
  }

  const { data: apt, error: insErr } = await sbAny
    .from("trade_appointments")
    .insert({
      room_id: roomId,
      item_id: (room as { item_id: string | null }).item_id,
      proposer_id: userId,
      appointment_at: appointmentAt,
      place_text: typeof body.placeText === "string" ? body.placeText.trim().slice(0, 500) : null,
      memo: typeof body.memo === "string" ? body.memo.trim().slice(0, 1000) : null,
      reminder_minutes: typeof body.reminderMinutes === "number" ? body.reminderMinutes : null,
      status: "proposed",
    })
    .select("id, appointment_at, status")
    .single();

  if (insErr) {
    return NextResponse.json({ ok: false, error: insErr.message ?? "약속 생성 실패" }, { status: 500 });
  }
  try {
    await sbAny.from("chat_event_logs").insert({
      room_id: roomId,
      event_type: "appointment_created",
      actor_user_id: userId,
      metadata: { appointment_id: (apt as { id: string }).id },
    });
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true, appointment: apt });
}
