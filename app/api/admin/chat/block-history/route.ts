/**
 * GET /api/admin/chat/block-history — 차단 이력 (관리자)
 * Query: blockerId, blockedUserId, roomId, limit, adminId
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export async function GET(req: NextRequest) {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }
  const adminId = req.nextUrl.searchParams.get("adminId")?.trim();
  if (!adminId) {
    return NextResponse.json({ error: "adminId 필요" }, { status: 400 });
  }

  const sbAny = sb;
  const { data: profile } = await sbAny.from("profiles").select("role").eq("id", adminId).maybeSingle();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== "admin" && role !== "master") {
    return NextResponse.json({ error: "관리자만 조회할 수 있습니다." }, { status: 403 });
  }

  const blockerId = req.nextUrl.searchParams.get("blockerId")?.trim();
  const blockedUserId = req.nextUrl.searchParams.get("blockedUserId")?.trim();
  const roomId = req.nextUrl.searchParams.get("roomId")?.trim();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 100, 500);

  let q = sbAny
    .from("user_blocks")
    .select("id, user_id, blocked_user_id, source_room_id, reason, created_at, released_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (blockerId) q = q.eq("user_id", blockerId);
  if (blockedUserId) q = q.eq("blocked_user_id", blockedUserId);
  if (roomId) q = q.eq("source_room_id", roomId);
  const { data: blocks, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ blocks: blocks ?? [] });
}
