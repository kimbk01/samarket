/**
 * Admin Community post reports list — filters + identity enrich (batch).
 * Authority: community_reports (post targets). No sanctions writer.
 */

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { collectCommunityPostIdsForTopicSlug } from "@/lib/admin-community/collect-post-ids-for-topic";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
  type AdminMemberIdentity,
} from "@/lib/admin-community/member-identity";

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
  post_title: string | null;
  post_topic_slug?: string | null;
  post_author_id?: string | null;
  reporter_label?: string | null;
  author_label?: string | null;
  reporter_identity?: AdminMemberIdentity | null;
  author_identity?: AdminMemberIdentity | null;
};

export type ListCommunityReportsForAdminOpts = {
  limit?: number;
  status?: string;
  /** open+reviewing */
  pending?: boolean;
  targetId?: string;
  topicSlug?: string;
  reporterId?: string;
  authorId?: string;
  createdFrom?: string;
  createdTo?: string;
};

function mapBaseRow(r: Record<string, unknown>): Omit<
  CommunityReportAdminRow,
  "post_title" | "post_topic_slug" | "post_author_id" | "reporter_label" | "author_label"
> {
  // Production: user_id + reason (DTO keeps reporter_id / reason_type / reason_text names).
  const reason = r.reason != null ? String(r.reason) : r.reason_text != null ? String(r.reason_text) : null;
  return {
    id: String(r.id),
    target_type: String(r.target_type ?? ""),
    target_id: String(r.target_id ?? ""),
    reporter_id: String(r.user_id ?? r.reporter_id ?? ""),
    reason_type: String(r.reason_type ?? (reason ? reason.split(":")[0]?.trim() : "") ?? ""),
    reason_text: reason,
    status: String(r.status ?? ""),
    admin_memo: r.admin_memo != null ? String(r.admin_memo) : null,
    processed_at: r.processed_at != null ? String(r.processed_at) : null,
    created_at: String(r.created_at ?? ""),
  };
}

export async function getCommunityReportByIdForAdmin(reportId: string): Promise<CommunityReportAdminRow | null> {
  const id = reportId?.trim();
  if (!id) return null;
  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from("community_reports")
      .select(
        "id, target_type, target_id, user_id, reason, status, admin_memo, processed_at, created_at"
      )
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    const enriched = await enrichCommunityReportRows([mapBaseRow(data as Record<string, unknown>)]);
    return enriched[0] ?? null;
  } catch {
    return null;
  }
}

async function enrichCommunityReportRows(
  base: ReturnType<typeof mapBaseRow>[]
): Promise<CommunityReportAdminRow[]> {
  if (!base.length) return [];
  const sb = getSupabaseServer();
  const postIds = [
    ...new Set(base.filter((r) => r.target_type === "post").map((r) => r.target_id).filter(Boolean)),
  ];

  const postMeta = new Map<
    string,
    { title: string; topic_slug: string; user_id: string; content?: string; status?: string; region_label?: string; created_at?: string }
  >();
  if (postIds.length) {
    const { data: posts } = await sb
      .from("community_posts")
      .select("id, title, topic_slug, user_id, content, status, region_label, created_at")
      .in("id", postIds);
    for (const p of posts ?? []) {
      const row = p as {
        id?: string;
        title?: string | null;
        topic_slug?: string | null;
        user_id?: string | null;
        content?: string | null;
        status?: string | null;
        region_label?: string | null;
        created_at?: string | null;
      };
      const pid = String(row.id ?? "");
      if (!pid) continue;
      postMeta.set(pid, {
        title: String(row.title ?? ""),
        topic_slug: String(row.topic_slug ?? "").trim().toLowerCase(),
        user_id: String(row.user_id ?? ""),
        content: row.content != null ? String(row.content) : undefined,
        status: row.status != null ? String(row.status) : undefined,
        region_label: row.region_label != null ? String(row.region_label) : undefined,
        created_at: row.created_at != null ? String(row.created_at) : undefined,
      });
    }
  }

  const authorIds = [...postMeta.values()].map((p) => p.user_id).filter(Boolean);
  const reporterIds = base.map((r) => r.reporter_id).filter(Boolean);
  const identityMap = await loadAdminMemberIdentityMap(sb, [...authorIds, ...reporterIds]);

  return base.map((r) => {
    const meta = r.target_type === "post" ? postMeta.get(r.target_id) : undefined;
    const authorId = meta?.user_id ?? "";
    const reporterIdentity = identityMap.get(r.reporter_id) ?? null;
    const authorIdentity = authorId ? identityMap.get(authorId) ?? null : null;
    return {
      ...r,
      post_title: meta?.title ?? null,
      post_topic_slug: meta?.topic_slug ?? null,
      post_author_id: authorId || null,
      reporter_identity: reporterIdentity,
      author_identity: authorIdentity,
      reporter_label: formatAdminMemberLabel(reporterIdentity),
      author_label: authorId ? formatAdminMemberLabel(authorIdentity) : null,
    };
  });
}

export async function listCommunityReportsForAdmin(
  limitOrOpts: number | ListCommunityReportsForAdminOpts = 200
): Promise<CommunityReportAdminRow[]> {
  const opts: ListCommunityReportsForAdminOpts =
    typeof limitOrOpts === "number" ? { limit: limitOrOpts } : limitOrOpts ?? {};
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);

  try {
    const sb = getSupabaseServer();

    let targetIdsFilter: string[] | null = null;
    if (opts.topicSlug?.trim()) {
      const { ids } = await collectCommunityPostIdsForTopicSlug(sb, opts.topicSlug.trim());
      if (!ids.length) return [];
      targetIdsFilter = ids;
    }
    if (opts.authorId?.trim()) {
      const { data: authored } = await sb
        .from("community_posts")
        .select("id")
        .eq("user_id", opts.authorId.trim());
      const authoredIds = (authored ?? [])
        .map((p) => String((p as { id?: string }).id ?? ""))
        .filter(Boolean);
      if (!authoredIds.length) return [];
      targetIdsFilter = targetIdsFilter
        ? targetIdsFilter.filter((id) => authoredIds.includes(id))
        : authoredIds;
      if (!targetIdsFilter.length) return [];
    }

    let q = sb
      .from("community_reports")
      .select("id, target_type, target_id, user_id, reason, status, admin_memo, processed_at, created_at")
      .eq("target_type", "post")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (opts.pending) {
      q = q.in("status", ["open", "reviewing"]);
    } else if (opts.status?.trim()) {
      q = q.eq("status", opts.status.trim());
    }
    if (opts.targetId?.trim()) q = q.eq("target_id", opts.targetId.trim());
    if (opts.reporterId?.trim()) q = q.eq("user_id", opts.reporterId.trim());
    if (opts.createdFrom?.trim()) q = q.gte("created_at", opts.createdFrom.trim());
    if (opts.createdTo?.trim()) q = q.lte("created_at", opts.createdTo.trim());
    if (targetIdsFilter) {
      // PostgREST in() size — chunk if needed
      if (targetIdsFilter.length <= 200) {
        q = q.in("target_id", targetIdsFilter);
      } else {
        // Fetch without target filter then filter in memory for large topics (still one list query + post id collect)
        const { data, error } = await q;
        if (error || !data?.length) return [];
        const allow = new Set(targetIdsFilter);
        const filtered = (data as Record<string, unknown>[])
          .filter((r) => allow.has(String(r.target_id ?? "")))
          .slice(0, limit)
          .map(mapBaseRow);
        return enrichCommunityReportRows(filtered);
      }
    }

    const { data, error } = await q;
    if (error || !data?.length) return [];
    return enrichCommunityReportRows((data as Record<string, unknown>[]).map(mapBaseRow));
  } catch {
    return [];
  }
}
