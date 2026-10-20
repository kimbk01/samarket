/**
 * Admin Community reports — list (대상별 묶음 · 서버 페이지네이션) + 단건(같은 대상 신고 n건 포함).
 * Authority: community_reports (post · comment/reply · user targets). 읽기 전용 (service-role 서버 조회).
 * 신고 인정/기각·조치는 `POST /api/admin/community-reports/:id/decision` 만.
 */

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { collectCommunityPostIdsForTopicSlug } from "@/lib/admin-community/collect-post-ids-for-topic";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
  type AdminMemberIdentity,
} from "@/lib/admin-community/member-identity";
import {
  adminCommunityCommentModerationHref,
  adminCommunityPostModerationHref,
  resolveCommunityReportDisplayTarget,
  type CommunityReportDisplayTarget,
} from "@/lib/community-feed/community-report-display-target";

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
  /** Target author (post author OR comment/reply author) — not reporter. */
  post_author_id?: string | null;
  reporter_label?: string | null;
  author_label?: string | null;
  reporter_identity?: AdminMemberIdentity | null;
  author_identity?: AdminMemberIdentity | null;
  /** Derived: post | comment | reply (reply = comment + parent_id). */
  display_target?: CommunityReportDisplayTarget;
  parent_id?: string | null;
  /** Parent post id for comment/reply targets; same as target_id for posts. */
  context_post_id?: string | null;
  target_content_preview?: string | null;
  moderation_href?: string | null;
  /** 처리자 · 결정 사유 · 실행한 조치 (M4) */
  processed_by?: string | null;
  processed_by_label?: string | null;
  decision_reason?: string | null;
  resolution_actions?: unknown[] | null;
  /** 대상 현재 상태 (게시글·댓글 active|hidden|deleted) — 영구 삭제되면 null + target_found=false */
  target_status?: string | null;
  target_found?: boolean;
  target_created_at?: string | null;
  /** 카테고리 이름 (게시글·댓글의 글) */
  post_topic_name?: string | null;
  /** 같은 대상(target_type+target_id)의 신고 전부 — 단건 조회에서만 채운다 (최신순) */
  same_target_reports?: CommunityReportAdminRow[];
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
    processed_by: r.processed_by != null ? String(r.processed_by) : null,
    decision_reason: r.decision_reason != null ? String(r.decision_reason) : null,
    resolution_actions: Array.isArray(r.resolution_actions) ? (r.resolution_actions as unknown[]) : null,
  };
}

const REPORT_SELECT =
  "id, target_type, target_id, user_id, reason, status, admin_memo, processed_at, created_at, processed_by, decision_reason, resolution_actions";

export async function getCommunityReportByIdForAdmin(reportId: string): Promise<CommunityReportAdminRow | null> {
  const id = reportId?.trim();
  if (!id) return null;
  try {
    const sb = getSupabaseServer();
    let { data, error } = await sb.from("community_reports").select(REPORT_SELECT).eq("id", id).maybeSingle();
    if (error) {
      // 처리자·결정 컬럼(M4) 미적용 환경
      ({ data, error } = await sb.from("community_reports").select(LEGACY_REPORT_SELECT).eq("id", id).maybeSingle());
    }
    if (error || !data) return null;
    const base = mapBaseRow(data as Record<string, unknown>);
    const enriched = await enrichCommunityReportRows([base]);
    const row = enriched[0] ?? null;
    if (!row) return null;
    // 같은 대상의 신고 n건 (처리 시트 ② 관련 기록)
    if (base.target_type && base.target_id) {
      const sibQuery = (cols: string) =>
        sb
          .from("community_reports")
          .select(cols)
          .eq("target_type", base.target_type)
          .eq("target_id", base.target_id)
          .order("created_at", { ascending: false })
          .limit(100);
      let { data: sib, error: sibErr } = await sibQuery(REPORT_SELECT);
      if (sibErr) ({ data: sib, error: sibErr } = await sibQuery(LEGACY_REPORT_SELECT));
      const sibBase = ((sib ?? []) as unknown as Record<string, unknown>[]).map(mapBaseRow);
      row.same_target_reports = await enrichReporterOnly(sb, sibBase);
    } else {
      row.same_target_reports = [{ ...row }];
    }
    return row;
  } catch {
    return null;
  }
}

type PostMeta = {
  title: string;
  topic_slug: string;
  user_id: string;
  content?: string;
  status?: string;
  region_label?: string;
  created_at?: string;
};

const POST_META_SELECT = "id, title, topic_slug, user_id, content, status, region_label, created_at";

function toPostMeta(p: unknown): [string, PostMeta] | null {
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
  if (!pid) return null;
  return [
    pid,
    {
      title: String(row.title ?? ""),
      topic_slug: String(row.topic_slug ?? "").trim().toLowerCase(),
      user_id: String(row.user_id ?? ""),
      content: row.content != null ? String(row.content) : undefined,
      status: row.status != null ? String(row.status) : undefined,
      region_label: row.region_label != null ? String(row.region_label) : undefined,
      created_at: row.created_at != null ? String(row.created_at) : undefined,
    },
  ];
}

/** 같은 대상 신고 목록용 — 신고자·처리자 이름만 붙인다 (대상 정보는 대표 행에 있음) */
async function enrichReporterOnly(
  sb: ReturnType<typeof getSupabaseServer>,
  base: ReturnType<typeof mapBaseRow>[]
): Promise<CommunityReportAdminRow[]> {
  if (!base.length) return [];
  const ids = base.flatMap((r) => [r.reporter_id, r.processed_by ?? ""]).filter(Boolean);
  const identityMap = await loadAdminMemberIdentityMap(sb, ids);
  return base.map((r) => {
    const reporterIdentity = identityMap.get(r.reporter_id) ?? null;
    return {
      ...r,
      post_title: null,
      reporter_identity: reporterIdentity,
      reporter_label: formatAdminMemberLabel(reporterIdentity),
      processed_by_label: r.processed_by ? formatAdminMemberLabel(identityMap.get(r.processed_by) ?? null, "관리자") : null,
    };
  });
}

async function enrichCommunityReportRows(
  base: ReturnType<typeof mapBaseRow>[]
): Promise<CommunityReportAdminRow[]> {
  if (!base.length) return [];
  const sb = getSupabaseServer();
  const postIds = [
    ...new Set(base.filter((r) => r.target_type === "post").map((r) => r.target_id).filter(Boolean)),
  ];
  const commentIds = [
    ...new Set(base.filter((r) => r.target_type === "comment").map((r) => r.target_id).filter(Boolean)),
  ];

  const postMeta = new Map<string, PostMeta>();
  if (postIds.length) {
    const { data: posts } = await sb.from("community_posts").select(POST_META_SELECT).in("id", postIds);
    for (const p of posts ?? []) {
      const m = toPostMeta(p);
      if (m) postMeta.set(m[0], m[1]);
    }
  }

  const commentMeta = new Map<
    string,
    { post_id: string; user_id: string; content: string; parent_id: string | null; status: string | null; created_at: string | null }
  >();
  if (commentIds.length) {
    const { data: comments } = await sb
      .from("community_comments")
      .select("id, post_id, user_id, content, parent_id, status, created_at")
      .in("id", commentIds);
    for (const c of comments ?? []) {
      const row = c as {
        id?: string;
        post_id?: string;
        user_id?: string;
        content?: string | null;
        parent_id?: string | null;
        status?: string | null;
        created_at?: string | null;
      };
      const cid = String(row.id ?? "");
      if (!cid) continue;
      commentMeta.set(cid, {
        post_id: String(row.post_id ?? ""),
        user_id: String(row.user_id ?? ""),
        content: String(row.content ?? "").slice(0, 200),
        parent_id: row.parent_id != null && String(row.parent_id).trim() ? String(row.parent_id) : null,
        status: row.status != null ? String(row.status) : null,
        created_at: row.created_at != null ? String(row.created_at) : null,
      });
    }
    const parentPostIds = [...new Set([...commentMeta.values()].map((c) => c.post_id).filter(Boolean))];
    const missingParents = parentPostIds.filter((id) => !postMeta.has(id));
    if (missingParents.length) {
      const { data: parents } = await sb.from("community_posts").select(POST_META_SELECT).in("id", missingParents);
      for (const p of parents ?? []) {
        const m = toPostMeta(p);
        if (m) postMeta.set(m[0], m[1]);
      }
    }
  }

  // 카테고리 이름 (slug 원문 대신)
  const topicSlugs = [...new Set([...postMeta.values()].map((p) => p.topic_slug).filter(Boolean))];
  const topicNames = new Map<string, string>();
  if (topicSlugs.length) {
    const { data: topics } = await sb.from("community_topics").select("slug, name").in("slug", topicSlugs);
    for (const t of (topics ?? []) as Array<{ slug?: string | null; name?: string | null }>) {
      if (t.slug && t.name) topicNames.set(String(t.slug).toLowerCase(), String(t.name));
    }
  }

  const userTargetIds = base.filter((r) => r.target_type === "user").map((r) => r.target_id);
  const authorIds = [
    ...[...postMeta.values()].map((p) => p.user_id),
    ...[...commentMeta.values()].map((c) => c.user_id),
    ...userTargetIds,
  ].filter(Boolean);
  const reporterIds = base.map((r) => r.reporter_id).filter(Boolean);
  const processorIds = base.map((r) => r.processed_by ?? "").filter(Boolean);
  const identityMap = await loadAdminMemberIdentityMap(sb, [...authorIds, ...reporterIds, ...processorIds]);
  const processedLabel = (id: string | null | undefined) =>
    id ? formatAdminMemberLabel(identityMap.get(id) ?? null, "관리자") : null;

  return base.map((r) => {
    const reporterIdentity = identityMap.get(r.reporter_id) ?? null;
    const common = {
      reporter_identity: reporterIdentity,
      reporter_label: formatAdminMemberLabel(reporterIdentity),
      processed_by_label: processedLabel(r.processed_by),
    };
    if (r.target_type === "user") {
      const authorIdentity = identityMap.get(r.target_id) ?? null;
      return {
        ...r,
        ...common,
        post_title: null,
        post_topic_slug: null,
        post_topic_name: null,
        post_author_id: r.target_id || null,
        author_identity: authorIdentity,
        author_label: formatAdminMemberLabel(authorIdentity),
        display_target: "post" as const,
        parent_id: null,
        context_post_id: null,
        target_content_preview: null,
        moderation_href: r.target_id ? `/admin/community/members/${encodeURIComponent(r.target_id)}` : null,
        target_status: null,
        target_found: Boolean(authorIdentity),
        target_created_at: null,
      };
    }
    if (r.target_type === "comment") {
      const cmeta = commentMeta.get(r.target_id);
      const pmeta = cmeta?.post_id ? postMeta.get(cmeta.post_id) : undefined;
      const authorId = cmeta?.user_id ?? "";
      const authorIdentity = authorId ? identityMap.get(authorId) ?? null : null;
      const display_target = resolveCommunityReportDisplayTarget({
        targetType: "comment",
        parentId: cmeta?.parent_id ?? null,
      });
      const contextPostId = cmeta?.post_id || null;
      return {
        ...r,
        ...common,
        post_title: pmeta?.title ?? null,
        post_topic_slug: pmeta?.topic_slug ?? null,
        post_topic_name: pmeta?.topic_slug ? topicNames.get(pmeta.topic_slug) ?? null : null,
        post_author_id: authorId || null,
        author_identity: authorIdentity,
        author_label: authorId ? formatAdminMemberLabel(authorIdentity) : null,
        display_target,
        parent_id: cmeta?.parent_id ?? null,
        context_post_id: contextPostId,
        target_content_preview: cmeta?.content || null,
        moderation_href: adminCommunityCommentModerationHref({
          commentId: r.target_id,
          postId: contextPostId,
        }),
        target_status: cmeta?.status ?? null,
        target_found: Boolean(cmeta),
        target_created_at: cmeta?.created_at ?? null,
      };
    }
    const meta = postMeta.get(r.target_id);
    const authorId = meta?.user_id ?? "";
    const authorIdentity = authorId ? identityMap.get(authorId) ?? null : null;
    return {
      ...r,
      ...common,
      post_title: meta?.title ?? null,
      post_topic_slug: meta?.topic_slug ?? null,
      post_topic_name: meta?.topic_slug ? topicNames.get(meta.topic_slug) ?? null : null,
      post_author_id: authorId || null,
      author_identity: authorIdentity,
      author_label: authorId ? formatAdminMemberLabel(authorIdentity) : null,
      display_target: "post" as const,
      parent_id: null,
      context_post_id: r.target_id,
      target_content_preview: meta?.content != null ? String(meta.content).slice(0, 200) : null,
      moderation_href: adminCommunityPostModerationHref(r.target_id),
      target_status: meta?.status ?? null,
      target_found: Boolean(meta),
      target_created_at: meta?.created_at ?? null,
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
      // TARGET AUTHOR semantics: post author OR comment/reply author (not reporter).
      const author = opts.authorId.trim();
      const [{ data: authoredPosts }, { data: authoredComments }] = await Promise.all([
        sb.from("community_posts").select("id").eq("user_id", author),
        sb.from("community_comments").select("id").eq("user_id", author),
      ]);
      const authoredIds = [
        ...(authoredPosts ?? []).map((p) => String((p as { id?: string }).id ?? "")),
        ...(authoredComments ?? []).map((c) => String((c as { id?: string }).id ?? "")),
      ].filter(Boolean);
      if (!authoredIds.length) return [];
      targetIdsFilter = targetIdsFilter
        ? targetIdsFilter.filter((id) => authoredIds.includes(id))
        : authoredIds;
      if (!targetIdsFilter.length) return [];
    }

    let q = sb
      .from("community_reports")
      .select("id, target_type, target_id, user_id, reason, status, admin_memo, processed_at, created_at")
      .in("target_type", ["post", "comment"])
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

/* ───────── 신고 처리함: 대상별 묶음 + 서버 페이지네이션 (설계 §C-2) ───────── */

/** 처리함 탭 — pending = 처리 대기(접수+검토 중) */
export const COMMUNITY_REPORT_INBOX_TABS = ["pending", "reviewing", "resolved", "dismissed", "all"] as const;
export type CommunityReportInboxTab = (typeof COMMUNITY_REPORT_INBOX_TABS)[number];

export type CommunityReportTargetFilter = "" | "post" | "comment" | "user";

const TAB_STATUSES: Record<CommunityReportInboxTab, readonly string[] | null> = {
  pending: ["open", "reviewing"],
  reviewing: ["reviewing"],
  resolved: ["resolved"],
  dismissed: ["dismissed"],
  all: null,
};

/** 레거시 URL(`status=open|pending`, `pending=1`) 포함 → 탭 */
export function resolveCommunityReportInboxTab(input: {
  status?: string | null;
  pending?: string | null;
}): CommunityReportInboxTab {
  const raw = String(input.status ?? "").trim().toLowerCase();
  if (input.pending === "1" || input.pending === "true") return "pending";
  if (raw === "open" || raw === "pending" || raw === "") return "pending";
  return (COMMUNITY_REPORT_INBOX_TABS as readonly string[]).includes(raw) ? (raw as CommunityReportInboxTab) : "pending";
}

export type CommunityReportGroupRow = {
  /** `${target_type}:${target_id}` */
  key: string;
  /** 처리 시트에서 조치할 대표 신고 — 처리 대기 신고 중 가장 최근 (없으면 가장 최근 신고) */
  primary_report_id: string;
  primary_status: string;
  /** 묶음 상태: 검토 중 > 접수 > 최근 신고 상태 */
  group_status: string;
  report_count: number;
  reporter_count: number;
  open_count: number;
  latest_reason: string | null;
  latest_at: string;
  first_at: string;
  target: CommunityReportAdminRow;
};

export type CommunityReportGroupList = {
  ok: boolean;
  groups: CommunityReportGroupRow[];
  /** 현재 탭·필터의 묶음 수 */
  total: number;
  counts: Record<CommunityReportInboxTab, number>;
  limit: number;
  offset: number;
  /** 조회 상한(5,000건)에 걸려 일부만 묶었는지 */
  truncated: boolean;
  /** ok=false 일 때 오류 코드 (DB 오류 코드 또는 load_failed) — 관리자 화면 오류 상태 표시용 */
  error?: string;
};

export type ListCommunityReportGroupsOpts = {
  tab: CommunityReportInboxTab;
  targetType?: CommunityReportTargetFilter;
  q?: string;
  targetId?: string;
  topicSlug?: string;
  reporterId?: string;
  authorId?: string;
  /** UTC [from, to) — 신고 접수 시각 기준 */
  createdFromIso?: string | null;
  createdToIso?: string | null;
  limit?: number;
  offset?: number;
};

const GROUP_SCAN_CAP = 5000;
const LEGACY_REPORT_SELECT = "id, target_type, target_id, user_id, reason, status, admin_memo, processed_at, created_at";

function emptyCounts(): Record<CommunityReportInboxTab, number> {
  return { pending: 0, reviewing: 0, resolved: 0, dismissed: 0, all: 0 };
}

function ilikeSafe(q: string): string {
  return q.replace(/[%_,()\\]/g, " ").trim().slice(0, 60);
}

type KeyRow = { id: string; target_type: string; target_id: string; user_id: string; reason: string | null; status: string; created_at: string };

/** 검색어(대상 제목·내용·닉네임) → 일치하는 대상 id · 회원 id */
async function resolveReportSearch(
  sb: ReturnType<typeof getSupabaseServer>,
  q: string
): Promise<{ targetIds: Set<string>; userIds: Set<string> }> {
  const safe = ilikeSafe(q);
  const targetIds = new Set<string>();
  const userIds = new Set<string>();
  if (!safe) return { targetIds, userIds };
  const like = `%${safe}%`;
  const [{ data: profs }, { data: posts }, { data: comments }] = await Promise.all([
    sb.from("profiles").select("id").ilike("nickname", like).limit(200),
    sb.from("community_posts").select("id").ilike("title", like).limit(500),
    sb.from("community_comments").select("id").ilike("content", like).limit(500),
  ]);
  for (const p of (profs ?? []) as Array<{ id?: string }>) if (p.id) userIds.add(String(p.id));
  for (const p of (posts ?? []) as Array<{ id?: string }>) if (p.id) targetIds.add(String(p.id));
  for (const c of (comments ?? []) as Array<{ id?: string }>) if (c.id) targetIds.add(String(c.id));
  if (userIds.size) {
    const ids = [...userIds];
    const [{ data: up }, { data: uc }] = await Promise.all([
      sb.from("community_posts").select("id").in("user_id", ids).limit(2000),
      sb.from("community_comments").select("id").in("user_id", ids).limit(2000),
    ]);
    for (const p of (up ?? []) as Array<{ id?: string }>) if (p.id) targetIds.add(String(p.id));
    for (const c of (uc ?? []) as Array<{ id?: string }>) if (c.id) targetIds.add(String(c.id));
    for (const id of ids) targetIds.add(id); // 회원 신고 대상
  }
  return { targetIds, userIds };
}

/**
 * 신고 처리함 목록 — 같은 대상(target_type+target_id)의 신고를 1행으로 묶는다.
 * 키 컬럼만 한 번 조회(상한 5,000) → 탭별 묶음 수 · 현재 탭 묶음 정렬(최근 신고순) · 페이지 자르기 →
 * 현재 페이지 대표 신고만 대상·작성자 정보를 붙인다.
 */
export async function listCommunityReportGroupsForAdmin(
  opts: ListCommunityReportGroupsOpts
): Promise<CommunityReportGroupList> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const empty: CommunityReportGroupList = {
    ok: true,
    groups: [],
    total: 0,
    counts: emptyCounts(),
    limit,
    offset,
    truncated: false,
  };
  try {
    const sb = getSupabaseServer();

    let targetIdsFilter: Set<string> | null = null;
    const narrow = (ids: Iterable<string>) => {
      const next = new Set(ids);
      targetIdsFilter = targetIdsFilter ? new Set([...targetIdsFilter].filter((x) => next.has(x))) : next;
    };
    if (opts.topicSlug?.trim()) {
      const { ids } = await collectCommunityPostIdsForTopicSlug(sb, opts.topicSlug.trim());
      narrow(ids);
    }
    if (opts.authorId?.trim()) {
      // 대상 작성자 기준: 게시글 작성자 OR 댓글 작성자 OR 회원 신고 대상 본인
      const author = opts.authorId.trim();
      const [{ data: authoredPosts }, { data: authoredComments }] = await Promise.all([
        sb.from("community_posts").select("id").eq("user_id", author),
        sb.from("community_comments").select("id").eq("user_id", author),
      ]);
      narrow([
        author,
        ...(authoredPosts ?? []).map((p) => String((p as { id?: string }).id ?? "")),
        ...(authoredComments ?? []).map((c) => String((c as { id?: string }).id ?? "")),
      ].filter(Boolean));
    }
    let search: { targetIds: Set<string>; userIds: Set<string> } | null = null;
    if (opts.q?.trim()) {
      search = await resolveReportSearch(sb, opts.q.trim());
      if (!search.targetIds.size && !search.userIds.size) return empty;
    }
    if (targetIdsFilter && (targetIdsFilter as Set<string>).size === 0) return empty;

    let kq = sb
      .from("community_reports")
      .select("id, target_type, target_id, user_id, reason, status, created_at")
      .order("created_at", { ascending: false })
      .limit(GROUP_SCAN_CAP);
    kq = opts.targetType ? kq.eq("target_type", opts.targetType) : kq.in("target_type", ["post", "comment", "user"]);
    if (opts.targetId?.trim()) kq = kq.eq("target_id", opts.targetId.trim());
    if (opts.reporterId?.trim()) kq = kq.eq("user_id", opts.reporterId.trim());
    if (opts.createdFromIso) kq = kq.gte("created_at", opts.createdFromIso);
    if (opts.createdToIso) kq = kq.lt("created_at", opts.createdToIso);
    const filterSet = targetIdsFilter as Set<string> | null;
    if (filterSet && filterSet.size <= 200) kq = kq.in("target_id", [...filterSet]);

    const { data, error } = await kq;
    if (error) return { ...empty, ok: false, error: error.code ? `db_${error.code}` : "load_failed" };
    let keys = ((data ?? []) as Record<string, unknown>[]).map(
      (r): KeyRow => ({
        id: String(r.id),
        target_type: String(r.target_type ?? ""),
        target_id: String(r.target_id ?? ""),
        user_id: String(r.user_id ?? ""),
        reason: r.reason != null ? String(r.reason) : null,
        status: String(r.status ?? ""),
        created_at: String(r.created_at ?? ""),
      })
    );
    const truncated = keys.length >= GROUP_SCAN_CAP;
    if (filterSet) keys = keys.filter((k) => filterSet.has(k.target_id));
    if (search) {
      const s = search;
      keys = keys.filter((k) => s.targetIds.has(k.target_id) || s.userIds.has(k.user_id));
    }

    // 탭별 묶음
    const byTab = (tab: CommunityReportInboxTab) => {
      const allow = TAB_STATUSES[tab];
      const m = new Map<string, KeyRow[]>();
      for (const k of keys) {
        if (allow && !allow.includes(k.status)) continue;
        const key = `${k.target_type}:${k.target_id}`;
        const list = m.get(key);
        if (list) list.push(k);
        else m.set(key, [k]);
      }
      return m;
    };
    const counts = emptyCounts();
    for (const tab of COMMUNITY_REPORT_INBOX_TABS) counts[tab] = byTab(tab).size;

    const grouped = [...byTab(opts.tab).entries()]; // 각 묶음 안은 최신순 (조회 정렬 유지)
    grouped.sort((a, b) => (a[1][0].created_at < b[1][0].created_at ? 1 : -1));
    const page = grouped.slice(offset, offset + limit);
    if (!page.length) return { ...empty, counts, total: grouped.length, truncated };

    const primaries = page.map(([, list]) => list.find((k) => k.status === "open" || k.status === "reviewing") ?? list[0]);
    const primaryIds = primaries.map((p) => p.id);
    const fullQuery = (cols: string) => sb.from("community_reports").select(cols).in("id", primaryIds);
    let full = await fullQuery(REPORT_SELECT);
    // 처리자·결정 컬럼(M4) 미적용 환경
    if (full.error) full = await fullQuery(LEGACY_REPORT_SELECT);
    if (full.error) return { ...empty, ok: false, error: full.error.code ? `db_${full.error.code}` : "load_failed" };
    const enriched = await enrichCommunityReportRows(
      ((full.data ?? []) as unknown as Record<string, unknown>[]).map(mapBaseRow)
    );
    const byId = new Map(enriched.map((r) => [r.id, r]));

    const groups: CommunityReportGroupRow[] = [];
    page.forEach(([key, list], i) => {
      const primary = byId.get(primaries[i].id);
      if (!primary) return;
      const statuses = new Set(list.map((k) => k.status));
      groups.push({
        key,
        primary_report_id: primary.id,
        primary_status: primary.status,
        group_status: statuses.has("reviewing") ? "reviewing" : statuses.has("open") ? "open" : list[0].status,
        report_count: list.length,
        reporter_count: new Set(list.map((k) => k.user_id).filter(Boolean)).size,
        open_count: list.filter((k) => k.status === "open" || k.status === "reviewing").length,
        latest_reason: list[0].reason,
        latest_at: list[0].created_at,
        first_at: list[list.length - 1].created_at,
        target: primary,
      });
    });
    return { ok: true, groups, total: grouped.length, counts, limit, offset, truncated };
  } catch {
    return { ...empty, ok: false, error: "load_failed" };
  }
}
