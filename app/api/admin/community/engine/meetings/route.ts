import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — 모임 관리 목록 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const status = req.nextUrl.searchParams.get("status")?.trim() || "";
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") ?? "40", 10) || 40, 1), 100);

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  let q = sb
    .from("meetings")
    .select(
      "id, post_id, title, host_user_id, status, max_members, meeting_date, chat_room_id, community_messenger_room_id, join_policy, entry_policy, password_hash, created_at, is_sample_data, platform_approval_required, platform_approval_status, region_text, category_text"
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status && ["open", "closed", "ended", "cancelled"].includes(status)) {
    q = q.eq("status", status);
  }
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const baseRows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const postIds = [...new Set(baseRows.map((row) => String(row.post_id ?? "").trim()).filter(Boolean))];
  const meetingIds = [...new Set(baseRows.map((row) => String(row.id ?? "").trim()).filter(Boolean))];

  const postMetaMap = new Map<string, { status: string; is_hidden: boolean; report_count: number }>();
  if (postIds.length > 0) {
    const { data: posts } = await sb
      .from("community_posts")
      .select("id, status, is_hidden, report_count")
      .in("id", postIds);
    if (Array.isArray(posts)) {
      for (const post of posts as Array<{ id?: string; status?: string | null; is_hidden?: boolean | null; report_count?: number | null }>) {
        const postId = String(post.id ?? "").trim();
        if (!postId) continue;
        postMetaMap.set(postId, {
          status: String(post.status ?? "active"),
          is_hidden: post.is_hidden === true,
          report_count: Number(post.report_count ?? 0) || 0,
        });
      }
    }
  }

  const reportCountMap = new Map<string, number>();
  if (meetingIds.length > 0) {
    const { data: reports } = await sb.from("meeting_reports").select("meeting_id").in("meeting_id", meetingIds);
    if (Array.isArray(reports)) {
      for (const report of reports as Array<{ meeting_id?: string | null }>) {
        const meetingId = String(report.meeting_id ?? "").trim();
        if (!meetingId) continue;
        reportCountMap.set(meetingId, (reportCountMap.get(meetingId) ?? 0) + 1);
      }
    }
  }

  const rows = baseRows.map((r) => {
    const row = { ...(r as Record<string, unknown>) };
    const ph = row.password_hash;
    const hasPassword = typeof ph === "string" && ph.length > 0;
    const postMeta = postMetaMap.get(String(row.post_id ?? "").trim());
    delete row.password_hash;
    return {
      ...row,
      has_password: hasPassword,
      post_status: postMeta?.status ?? "active",
      post_hidden: postMeta?.is_hidden ?? false,
      post_report_count: postMeta?.report_count ?? 0,
      meeting_report_count: reportCountMap.get(String(row.id ?? "").trim()) ?? 0,
    };
  });

  return NextResponse.json({ ok: true, meetings: rows });
}
