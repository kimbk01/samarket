/**
 * POST /api/chat/rooms/:roomId/lock — 관리자 잠금
 * Body: { adminId?, reason? } — 관리자 권한 필요
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }
  const { roomId } = await params;
  let body: { adminId?: string; reason?: string };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const adminId = typeof body.adminId === "string" ? body.adminId.trim() : "";
  if (!roomId || !adminId) {
    return NextResponse.json({ ok: false, error: "roomId, adminId 필요" }, { status: 400 });
  }

  const sbAny = sb;
  const { data: profile } = await sbAny
    .from("profiles")
    .select("role")
    .eq("id", adminId)
    .maybeSingle();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== "admin" && role !== "master") {
    return NextResponse.json({ ok: false, error: "관리자만 잠금할 수 있습니다." }, { status: 403 });
  }

  const now = new Date().toISOString();
  await sbAny
    .from("chat_rooms")
    .update({ is_locked: true, locked_by: adminId, locked_at: now, updated_at: now })
    .eq("id", roomId);
  try {
    await sbAny.from("chat_event_logs").insert({
      room_id: roomId,
      event_type: "room_locked",
      actor_admin_id: adminId,
      metadata: { reason: body.reason },
    });
    await sbAny.from("moderation_actions").insert({
      target_type: "room",
      target_id: roomId,
      action_type: "lock_room",
      action_reason: body.reason ?? undefined,
      actor_admin_id: adminId,
    });
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true });
}
