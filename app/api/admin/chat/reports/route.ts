/**
 * GET /api/admin/chat/reports — 관리자 신고 목록
 * Query: status, reportType, priority, limit, cursor, adminId
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

  const status = req.nextUrl.searchParams.get("status")?.trim();
  const reportType = req.nextUrl.searchParams.get("reportType")?.trim();
  const priority = req.nextUrl.searchParams.get("priority")?.trim();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 100);

  let q = sbAny
    .from("chat_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) q = q.eq("status", status);
  if (reportType) q = q.eq("report_type", reportType);
  if (priority) q = q.eq("priority", priority);
  const { data: reports, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reports: reports ?? [] });
}
