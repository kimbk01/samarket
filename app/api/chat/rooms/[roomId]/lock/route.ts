/**
 * POST /api/chat/rooms/:roomId/lock — 관리자 잠금
 * Body: { adminId?, reason? } — 관리자 권한 필요
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
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
  // SEC-03: 세션 기반 관리자 인증. body.adminId 는 신뢰하지 않는다.
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const adminId = admin.userId;
  let body: { reason?: string };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "roomId 필요" }, { status: 400 });
  }

  const sbAny = sb;

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
