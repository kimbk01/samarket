/**
 * GET /api/admin/chat/reports — 관리자 신고 목록
 * Query: status, reportType, priority, limit, cursor
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { CHAT_REPORTS_ADMIN_SELECT } from "@/lib/chat/chat-sql-selects";

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

  const status = req.nextUrl.searchParams.get("status")?.trim();
  const reportType = req.nextUrl.searchParams.get("reportType")?.trim();
  const priority = req.nextUrl.searchParams.get("priority")?.trim();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 100);

  let q = sbAny
    .from("chat_reports")
    .select(CHAT_REPORTS_ADMIN_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) q = q.eq("status", status);
  if (reportType) q = q.eq("report_type", reportType);
  if (priority) q = q.eq("priority", priority);
  const { data: reports, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reports: reports ?? [] });
}
