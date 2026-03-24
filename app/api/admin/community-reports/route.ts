import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { listCommunityReportsForAdmin } from "@/lib/community-feed/admin-community-reports";
import { mapCommunityReportsToReports } from "@/lib/admin-reports/map-community-reports";

export const dynamic = "force-dynamic";

/** 관리자: 동네생활 피드 신고 목록(JSON) — 통합 신고함 병합용 */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const rows = await listCommunityReportsForAdmin(300);
    const ids = [...new Set(rows.map((r) => r.reporter_id).filter(Boolean))];
    const nicknameById: Record<string, string> = {};
    if (ids.length > 0) {
      const sb = getSupabaseServer();
      const { data: users } = await sb.from("test_users").select("id, display_name, username").in("id", ids);
      if (Array.isArray(users)) {
        for (const u of users as { id: string; display_name?: string; username?: string }[]) {
          nicknameById[u.id] = (u.display_name ?? u.username ?? u.id).trim() || u.id;
        }
      }
    }
    const reports = mapCommunityReportsToReports(rows, nicknameById);
    return NextResponse.json({ ok: true, reports });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
