import { getSupabaseServer } from "@/lib/chat/supabase-server";

export type CommunityReportAdminRow = {
  id: string;
  target_type: string;
  target_id: string;
  reporter_id: string;
  reason_type: string;
  reason_text: string | null;
  status: string;
  admin_memo: string | null;
  processed_at: string | null;
  created_at: string;
  /** target_type=post 일 때 community_posts.title */
  post_title: string | null;
};

export async function getCommunityReportByIdForAdmin(reportId: string): Promise<CommunityReportAdminRow | null> {
  const id = reportId?.trim();
  if (!id) return null;
  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from("community_reports")
      .select(
        "id, target_type, target_id, reporter_id, reason_type, reason_text, status, admin_memo, processed_at, created_at"
      )
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    const r = data as Record<string, unknown>;
    const tid = String(r.target_id ?? "");
    const tt = String(r.target_type ?? "");
    let post_title: string | null = null;
    if (tt === "post" && tid) {
      const { data: p } = await sb.from("community_posts").select("title").eq("id", tid).maybeSingle();
      post_title = (p as { title?: string } | null)?.title != null ? String((p as { title: string }).title) : null;
    }
    return {
      id: String(r.id),
      target_type: tt,
      target_id: tid,
      reporter_id: String(r.reporter_id ?? ""),
      reason_type: String(r.reason_type ?? ""),
      reason_text: r.reason_text != null ? String(r.reason_text) : null,
      status: String(r.status ?? ""),
      admin_memo: r.admin_memo != null ? String(r.admin_memo) : null,
      processed_at: r.processed_at != null ? String(r.processed_at) : null,
      created_at: String(r.created_at ?? ""),
      post_title,
    };
  } catch {
    return null;
  }
}

export async function listCommunityReportsForAdmin(limit = 200): Promise<CommunityReportAdminRow[]> {
  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from("community_reports")
      .select(
        "id, target_type, target_id, reporter_id, reason_type, reason_text, status, admin_memo, processed_at, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 500));

    if (error || !data?.length) return [];

    const rows = data as Record<string, unknown>[];
    const postIds = [
      ...new Set(
        rows.filter((r) => String(r.target_type) === "post").map((r) => String(r.target_id ?? ""))
      ),
    ].filter(Boolean);

    let titleMap = new Map<string, string>();
    if (postIds.length > 0) {
      const { data: posts } = await sb.from("community_posts").select("id, title").in("id", postIds);
      if (Array.isArray(posts)) {
        titleMap = new Map(
          (posts as { id?: string; title?: string }[]).map((p) => [String(p.id), String(p.title ?? "")])
        );
      }
    }

    return rows.map((r) => {
      const tid = String(r.target_id ?? "");
      const tt = String(r.target_type ?? "");
      return {
        id: String(r.id),
        target_type: tt,
        target_id: tid,
        reporter_id: String(r.reporter_id ?? ""),
        reason_type: String(r.reason_type ?? ""),
        reason_text: r.reason_text != null ? String(r.reason_text) : null,
        status: String(r.status ?? ""),
        admin_memo: r.admin_memo != null ? String(r.admin_memo) : null,
        processed_at: r.processed_at != null ? String(r.processed_at) : null,
        created_at: String(r.created_at ?? ""),
        post_title: tt === "post" ? titleMap.get(tid) ?? null : null,
      };
    });
  } catch {
    return [];
  }
}
