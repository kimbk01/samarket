/**
 * GET /api/admin/chat/block-history — 차단 이력 (관리자)
 * Query: blockerId, blockedUserId, roomId, limit
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

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
