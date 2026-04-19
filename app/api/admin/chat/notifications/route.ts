/**
 * GET /api/admin/chat/notifications — 알림 로그 목록 (관리자 세션)
 * Query: roomId, filterUserId(로그의 user_id 필터), status, limit
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { NOTIFICATION_LOGS_ADMIN_SELECT } from "@/lib/chat/chat-sql-selects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }

  const sbAny = sb;

  const roomId = req.nextUrl.searchParams.get("roomId")?.trim();
  const filterUserId =
    req.nextUrl.searchParams.get("filterUserId")?.trim() ||
    req.nextUrl.searchParams.get("userId")?.trim();
  const status = req.nextUrl.searchParams.get("status")?.trim();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 100, 500);

  let q = sbAny
    .from("notification_logs")
    .select(NOTIFICATION_LOGS_ADMIN_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (roomId) q = q.eq("room_id", roomId);
  if (filterUserId) q = q.eq("user_id", filterUserId);
  if (status) q = q.eq("status", status);
  const { data: logs, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifications: logs ?? [] });
}
