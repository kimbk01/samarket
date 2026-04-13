/**
 * GET /api/admin/favorite-audit — 찜 감사 로그 (관리자, service role)
 * 사용자 찜 목록(`/api/favorites/list` → `favorites`)과 별도로, 토글 시 쌓이는 `favorite_audit_log` 조회.
 */
import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export async function GET(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "서버 설정 필요", items: [] }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "200", 10) || 200));

  const { data, error } = await sb
    .from("favorite_audit_log")
    .select("id, user_id, post_id, action, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message, items: [] }, { status: 500 });
  }

  return NextResponse.json({ ok: true, items: Array.isArray(data) ? data : [] });
}
