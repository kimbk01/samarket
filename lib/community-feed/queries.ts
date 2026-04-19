import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";
import type {
  CommunityCommentDTO,
  CommunityFeedPostDTO,
  CommunityPostDetailDTO,
  CommunitySectionAdminRow,
  CommunitySectionDTO,
  CommunityTopicDTO,
} from "./types";
import { normalizeSectionSlug, type CommunityFeedSortMode } from "./constants";
import { getPhilifeNeighborhoodSectionSlugServer } from "@/lib/community-feed/philife-neighborhood-section";
import { rankByRecommended } from "./feed-ranking";
import { isMissingDbColumnError } from "./supabase-column-error";
import { normalizeCommunityFeedListSkin } from "./topic-feed-skin";

/** `community_topics` 행 → DTO (RPC·리스트 조회 공통) */
export function mapCommunityTopicRowsToDto(rows: Record<string, unknown>[]): CommunityTopicDTO[] {
  return rows.map((row) => ({
    id: String(row.id),
    section_id: String(row.section_id ?? ""),
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    color: row.color != null ? String(row.color) : null,
    icon: row.icon != null ? String(row.icon) : null,
    sort_order: Number(row.sort_order ?? 0),
    is_visible: !!row.is_visible,
    is_feed_sort: !!row.is_feed_sort,
    allow_question: !!row.allow_question,
    allow_meetup: !!row.allow_meetup,
    feed_list_skin: normalizeCommunityFeedListSkin(row.feed_list_skin),
  }));
}

type Sb = ReturnType<typeof getSupabaseServer>;

export { normalizeSectionSlug } from "./constants";

/** `loadPhilifeDefaultSectionTopics` 진단용 — `listTopicsForSectionSlug` 가 선택적으로 채움 */
export type PhilifeTopicsListQueryTimings = {
  topics_topics_query_ms: number;
  topics_topics_fallback_ms: number;
  communityTopicsQueryRounds: number;
};

export async function listCommunitySections(): Promise<CommunitySectionDTO[]> {
  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from("community_sections")
      .select("id, name, slug, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error || !data?.length) return [];
    return data as CommunitySectionDTO[];
  } catch {
    return [];
  }
}

/** 관리자: 비활성 포함 전체 섹션 */
export async function listAllCommunitySectionsForAdmin(): Promise<CommunitySectionAdminRow[]> {
  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from("community_sections")
      .select("id, name, slug, sort_order, is_active")
      .order("sort_order", { ascending: true });
    if (error || !data?.length) return [];
    return data as CommunitySectionAdminRow[];
  } catch {
    return [];
  }
}

export async function listTopicsForSectionSlug(
  sectionSlug: string,
  opts?: { sectionId?: string | null; timings?: PhilifeTopicsListQueryTimings }
): Promise<CommunityTopicDTO[]> {
  try {
    const sb = getSupabaseServer();
    const tim = opts?.timings;
    let sectionId: string;
    const preId = opts?.sectionId != null ? String(opts.sectionId).trim() : "";
    if (preId) {
      sectionId = preId;
    } else {
      const { data: sec, error: e1 } = await sb
        .from("community_sections")
        .select("id")
        .eq("slug", sectionSlug)
        .eq("is_active", true)
        .maybeSingle();
      if (e1 || !sec) return [];
      sectionId = (sec as { id: string }).id;
    }

    const selWith =
      "id, section_id, name, slug, color, icon, sort_order, is_visible, is_feed_sort, allow_question, allow_meetup, feed_list_skin";
    const selNo =
      "id, section_id, name, slug, color, icon, sort_order, is_visible, is_feed_sort, allow_question, allow_meetup";
    const tq1 = tim ? performance.now() : 0;
    const r1 = await sb
      .from("community_topics")
      .select(selWith)
      .eq("section_id", sectionId)
      .eq("is_active", true)
      .eq("is_visible", true)
      .order("sort_order", { ascending: true });
    if (tim) {
      tim.topics_topics_query_ms += performance.now() - tq1;
      tim.communityTopicsQueryRounds = 1;
    }
    let topicRows: unknown = r1.data;
    let error = r1.error;
    if (error && isMissingDbColumnError(error, "feed_list_skin")) {
      const tq2 = tim ? performance.now() : 0;
      const r2 = await sb
        .from("community_topics")
        .select(selNo)
        .eq("section_id", sectionId)
        .eq("is_active", true)
        .eq("is_visible", true)
        .order("sort_order", { ascending: true });
      if (tim) {
        tim.topics_topics_fallback_ms += performance.now() - tq2;
        tim.communityTopicsQueryRounds = 2;
      }
      topicRows = r2.data;
      error = r2.error;
    }
    if (error || !Array.isArray(topicRows)) return [];
    return mapCommunityTopicRowsToDto(topicRows as Record<string, unknown>[]);
  } catch {
    return [];
  }
}

function summarize(text: string, max = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export async function listCommunityFeedPosts(options: {
  sectionSlug: string;
  topicSlug?: string | null;
  /** 기본 최신순. 드롭다운·URL `sort`와 연동 */
  feedSort?: CommunityFeedSortMode;
  limit?: number;
  /** 페이지 상단에서 이미 topic slug 유효성 검사를 끝낸 경우 중복 조회 생략 */
  skipTopicValidation?: boolean;
}): Promise<CommunityFeedPostDTO[]> {
  let sb: Sb;
  try {
    sb = getSupabaseServer();
  } catch {
    return [];
  }

  let sectionSlug = normalizeSectionSlug(options.sectionSlug);
  if (!sectionSlug) {
    sectionSlug = await getPhilifeNeighborhoodSectionSlugServer(sb);
  }
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 80);
  const rawTopic = options.topicSlug?.trim().toLowerCase() || null;
  const feedSort: CommunityFeedSortMode = options.feedSort ?? "latest";
  const skipTopicValidation = options.skipTopicValidation === true;

  const sortPopular = feedSort === "popular";
  const sortRecommended = feedSort === "recommended";
  let topicFilter: string | null = null;

  if (rawTopic && skipTopicValidation) {
    topicFilter = rawTopic;
  } else if (rawTopic) {
    const { data: sec } = await sb
      .from("community_sections")
      .select("id")
      .eq("slug", sectionSlug)
      .maybeSingle();
    if (sec) {
      const { data: trow } = await sb
        .from("community_topics")
        .select("slug, is_feed_sort")
        .eq("section_id", (sec as { id: string }).id)
        .eq("slug", rawTopic)
        .eq("is_active", true)
        .maybeSingle();
      const tr = trow as { slug?: string; is_feed_sort?: boolean } | null;
      if (tr && !tr.is_feed_sort) {
        topicFilter = rawTopic;
      }
    }
  }

  const poolCap = sortRecommended ? Math.min(Math.max(limit * 5, limit), 200) : limit;

  const runFeedSelect = (topicCols: string) => {
    let q = sb
      .from("community_posts")
      .select(
        `id, section_slug, topic_slug, title, summary, region_label, is_question, is_meetup, meetup_date, meetup_place, view_count, like_count, comment_count, created_at, user_id, community_topics ( ${topicCols} )`
      )
      .eq("section_slug", sectionSlug)
      .eq("is_hidden", false);
    if (topicFilter) {
      q = q.eq("topic_slug", topicFilter);
    }
    if (sortPopular) {
      q = q
        .order("like_count", { ascending: false })
        .order("comment_count", { ascending: false })
        .order("view_count", { ascending: false })
        .order("created_at", { ascending: false });
    } else {
      q = q.order("created_at", { ascending: false });
    }
    return q.limit(poolCap);
  };

  const fr1 = await runFeedSelect("name, slug, color, feed_list_skin");
  let postsRaw: unknown = fr1.data;
  let error = fr1.error;
  if (error && isMissingDbColumnError(error, "feed_list_skin")) {
    const fr2 = await runFeedSelect("name, slug, color");
    postsRaw = fr2.data;
    error = fr2.error;
  }
  if (error || !Array.isArray(postsRaw) || postsRaw.length === 0) return [];

  let rows = postsRaw as Record<string, unknown>[];
  if (sortRecommended) {
    rows = rankByRecommended(rows, limit);
  } else if (sortPopular && rows.length > limit) {
    rows = rows.slice(0, limit);
  }
  const uids = [...new Set(rows.map((r) => String(r.user_id ?? "")).filter(Boolean))];
  const nickMap = await fetchNicknamesForUserIds(sb as never, uids);

  const thumbIds = rows.map((r) => String(r.id));
  const { data: thumbs } = await sb
    .from("community_post_images")
    .select("post_id, image_url, sort_order")
    .in("post_id", thumbIds)
    .order("sort_order", { ascending: true });

  const thumbByPost = new Map<string, string | null>();
  if (Array.isArray(thumbs)) {
    for (const im of thumbs as { post_id?: string; image_url?: string | null }[]) {
      const pid = String(im.post_id ?? "");
      const u = im.image_url ?? null;
      if (pid && !thumbByPost.has(pid) && u) thumbByPost.set(pid, u);
    }
  }

  return rows.map((r) => {
    const uid = String(r.user_id ?? "");
    const topic = r.community_topics as {
      name?: string;
      slug?: string;
      color?: string | null;
      feed_list_skin?: unknown;
    } | null;
    const summaryRaw = r.summary != null ? String(r.summary) : "";
    return {
      id: String(r.id),
      section_slug: String(r.section_slug ?? sectionSlug),
      topic_slug: String(r.topic_slug ?? ""),
      topic_name: String(topic?.name ?? r.topic_slug ?? ""),
      topic_color: topic?.color ?? null,
      feed_list_skin: normalizeCommunityFeedListSkin(topic?.feed_list_skin),
      title: String(r.title ?? ""),
      content: summaryRaw,
      summary: summaryRaw || "",
      region_label: String(r.region_label ?? ""),
      is_question: !!r.is_question,
      is_meetup: !!r.is_meetup,
      meetup_date: r.meetup_date != null ? String(r.meetup_date) : null,
      meetup_place: r.meetup_place != null ? String(r.meetup_place) : null,
      view_count: Number(r.view_count ?? 0),
      like_count: Number(r.like_count ?? 0),
      comment_count: Number(r.comment_count ?? 0),
      created_at: String(r.created_at ?? ""),
      author_name: nickMap.get(uid) ?? (uid ? uid.slice(0, 8) : "익명"),
      thumbnail_url: thumbByPost.get(String(r.id)) ?? null,
    };
  });
}

/**
 * 피드 글 id 또는 이관 전 `posts.id`(source_legacy_post_id) → 실제 community_posts.id
 */
export async function resolveCanonicalCommunityPostId(rawId: string | undefined | null): Promise<string | null> {
  const id = rawId?.trim();
  if (!id) return null;
  try {
    const sb = getSupabaseServer();
    const { data: direct } = await sb
      .from("community_posts")
      .select("id")
      .eq("id", id)
      .eq("is_hidden", false)
      .maybeSingle();
    if ((direct as { id?: string } | null)?.id) return String((direct as { id: string }).id);

    const { data: migrated, error } = await sb
      .from("community_posts")
      .select("id")
      .eq("source_legacy_post_id", id)
      .eq("is_hidden", false)
      .maybeSingle();
    if (error) {
      const m = String(error.message ?? "");
      if (m.includes("source_legacy_post_id") || m.includes("column")) return null;
      return null;
    }
    if ((migrated as { id?: string } | null)?.id) return String((migrated as { id: string }).id);
    return null;
  } catch {
    return null;
  }
}

export async function getCommunityPostDetail(postId: string): Promise<CommunityPostDetailDTO | null> {
  let sb: Sb;
  try {
    sb = getSupabaseServer();
  } catch {
    return null;
  }

  const selDetailWith =
    "id, section_slug, topic_slug, title, content, summary, region_label, is_question, is_meetup, meetup_date, meetup_place, view_count, like_count, comment_count, created_at, user_id, community_topics ( name, slug, color, feed_list_skin ), community_post_images ( id, image_url, sort_order )";
  const selDetailNo =
    "id, section_slug, topic_slug, title, content, summary, region_label, is_question, is_meetup, meetup_date, meetup_place, view_count, like_count, comment_count, created_at, user_id, community_topics ( name, slug, color ), community_post_images ( id, image_url, sort_order )";

  const d1 = await sb.from("community_posts").select(selDetailWith).eq("id", postId).eq("is_hidden", false).maybeSingle();
  let detailRaw: unknown = d1.data;
  let error = d1.error;
  if (error && isMissingDbColumnError(error, "feed_list_skin")) {
    const d2 = await sb.from("community_posts").select(selDetailNo).eq("id", postId).eq("is_hidden", false).maybeSingle();
    detailRaw = d2.data;
    error = d2.error;
  }
  if (error || detailRaw == null || typeof detailRaw !== "object") return null;

  const row = detailRaw as Record<string, unknown>;
  const uid = String(row.user_id ?? "");
  const nickMap = await fetchNicknamesForUserIds(sb as never, [uid]);
  const topic = row.community_topics as {
    name?: string;
    slug?: string;
    color?: string | null;
    feed_list_skin?: unknown;
  } | null;
  const content = String(row.content ?? "");
  const imgsRaw = row.community_post_images;
  const images = Array.isArray(imgsRaw)
    ? (imgsRaw as Record<string, unknown>[])
        .filter((x) => x.id)
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
        .map((x) => ({
          id: String(x.id),
          url: x.image_url != null ? String(x.image_url) : null,
          sort_order: Number(x.sort_order ?? 0),
        }))
    : [];

  return {
    id: String(row.id),
    section_slug: String(row.section_slug ?? ""),
    topic_slug: String(row.topic_slug ?? ""),
    topic_name: String(topic?.name ?? row.topic_slug ?? ""),
    topic_color: topic?.color ?? null,
    feed_list_skin: normalizeCommunityFeedListSkin(topic?.feed_list_skin),
    title: String(row.title ?? ""),
    content,
    summary: row.summary != null ? String(row.summary) : summarize(content),
    region_label: String(row.region_label ?? ""),
    is_question: !!row.is_question,
    is_meetup: !!row.is_meetup,
    meetup_date: row.meetup_date != null ? String(row.meetup_date) : null,
    meetup_place: row.meetup_place != null ? String(row.meetup_place) : null,
    view_count: Number(row.view_count ?? 0),
    like_count: Number(row.like_count ?? 0),
    comment_count: Number(row.comment_count ?? 0),
    created_at: String(row.created_at ?? ""),
    author_id: uid,
    author_name: nickMap.get(uid) ?? (uid ? uid.slice(0, 8) : "익명"),
    thumbnail_url: images[0]?.url ?? null,
    images,
  };
}

export async function listCommunityPostComments(postId: string): Promise<CommunityCommentDTO[]> {
  try {
    const sb = getSupabaseServer();
    const r1 = await sb
      .from("community_comments")
      .select("id, post_id, user_id, parent_id, content, created_at, is_deleted")
      .eq("post_id", postId)
      .eq("is_hidden", false)
      .order("created_at", { ascending: true });
    let data = r1.data;
    let error = r1.error;
    if (error && isMissingDbColumnError(error, "is_hidden")) {
      const r2 = await sb
        .from("community_comments")
        .select("id, post_id, user_id, parent_id, content, created_at, is_deleted")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });
      data = r2.data;
      error = r2.error;
    }
    if (error || !data?.length) return [];

    const rows = (data as Record<string, unknown>[]).filter((r) => r.is_deleted !== true);
    if (rows.length === 0) return [];
    const uids = [...new Set(rows.map((r) => String(r.user_id ?? "")).filter(Boolean))];
    const nickMap = await fetchNicknamesForUserIds(sb as never, uids);

    return rows.map((r) => {
      const u = String(r.user_id ?? "");
      return {
        id: String(r.id),
        post_id: String(r.post_id ?? ""),
        user_id: u,
        parent_id: r.parent_id != null ? String(r.parent_id) : null,
        content: String(r.content ?? ""),
        created_at: String(r.created_at ?? ""),
        author_name: nickMap.get(u) ?? u.slice(0, 8),
      };
    });
  } catch {
    return [];
  }
}

export async function listCommunityPostsForUser(
  userId: string,
  limit = 100
): Promise<CommunityFeedPostDTO[]> {
  const uid = userId?.trim();
  if (!uid) return [];
  const rowLimit = Math.min(Math.max(Math.floor(limit) || 100, 1), 100);
  let sb: Sb;
  try {
    sb = getSupabaseServer();
  } catch {
    return [];
  }

  const selUserWith =
    "id, section_slug, topic_slug, title, summary, region_label, is_question, is_meetup, meetup_date, meetup_place, view_count, like_count, comment_count, created_at, user_id, community_topics ( name, slug, color, feed_list_skin )";
  const selUserNo =
    "id, section_slug, topic_slug, title, summary, region_label, is_question, is_meetup, meetup_date, meetup_place, view_count, like_count, comment_count, created_at, user_id, community_topics ( name, slug, color )";

  const u1 = await sb
    .from("community_posts")
    .select(selUserWith)
    .eq("user_id", uid)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(rowLimit);
  let userPostsRaw: unknown = u1.data;
  let error = u1.error;
  if (error && isMissingDbColumnError(error, "feed_list_skin")) {
    const u2 = await sb
      .from("community_posts")
      .select(selUserNo)
      .eq("user_id", uid)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      .limit(rowLimit);
    userPostsRaw = u2.data;
    error = u2.error;
  }

  if (error || !Array.isArray(userPostsRaw) || userPostsRaw.length === 0) return [];

  const rows = userPostsRaw as Record<string, unknown>[];
  const nickMap = await fetchNicknamesForUserIds(sb as never, [uid]);

  const ids = rows.map((r) => String(r.id));
  const { data: thumbs } = await sb
    .from("community_post_images")
    .select("post_id, image_url, sort_order")
    .in("post_id", ids)
    .order("sort_order", { ascending: true });

  const thumbByPost = new Map<string, string | null>();
  if (Array.isArray(thumbs)) {
    for (const im of thumbs as { post_id?: string; image_url?: string | null }[]) {
      const pid = String(im.post_id ?? "");
      const u = im.image_url ?? null;
      if (pid && !thumbByPost.has(pid) && u) thumbByPost.set(pid, u);
    }
  }

  return rows.map((r) => {
    const topic = r.community_topics as {
      name?: string;
      slug?: string;
      color?: string | null;
      feed_list_skin?: unknown;
    } | null;
    const summaryRaw = r.summary != null ? String(r.summary) : "";
    return {
      id: String(r.id),
      section_slug: String(r.section_slug ?? ""),
      topic_slug: String(r.topic_slug ?? ""),
      topic_name: String(topic?.name ?? r.topic_slug ?? ""),
      topic_color: topic?.color ?? null,
      feed_list_skin: normalizeCommunityFeedListSkin(topic?.feed_list_skin),
      title: String(r.title ?? ""),
      content: summaryRaw,
      summary: summaryRaw || "",
      region_label: String(r.region_label ?? ""),
      is_question: !!r.is_question,
      is_meetup: !!r.is_meetup,
      meetup_date: r.meetup_date != null ? String(r.meetup_date) : null,
      meetup_place: r.meetup_place != null ? String(r.meetup_place) : null,
      view_count: Number(r.view_count ?? 0),
      like_count: Number(r.like_count ?? 0),
      comment_count: Number(r.comment_count ?? 0),
      created_at: String(r.created_at ?? ""),
      author_name: nickMap.get(uid) ?? uid.slice(0, 8),
      thumbnail_url: thumbByPost.get(String(r.id)) ?? null,
    };
  });
}

export async function resolveTopicMeta(
  sectionSlug: string,
  topicSlug: string
): Promise<{
  id: string;
  is_feed_sort: boolean;
  allow_meetup: boolean;
  allow_question: boolean;
  feed_list_skin: ReturnType<typeof normalizeCommunityFeedListSkin>;
} | null> {
  try {
    const sb = getSupabaseServer();
    const { data: sec } = await sb
      .from("community_sections")
      .select("id")
      .eq("slug", sectionSlug)
      .maybeSingle();
    if (!sec) return null;
    const m1 = await sb
      .from("community_topics")
      .select("id, is_feed_sort, allow_meetup, allow_question, feed_list_skin")
      .eq("section_id", (sec as { id: string }).id)
      .eq("slug", topicSlug.toLowerCase())
      .eq("is_active", true)
      .maybeSingle();
    let metaRow: unknown = m1.data;
    let te = m1.error;
    if (te && isMissingDbColumnError(te, "feed_list_skin")) {
      const m2 = await sb
        .from("community_topics")
        .select("id, is_feed_sort, allow_meetup, allow_question")
        .eq("section_id", (sec as { id: string }).id)
        .eq("slug", topicSlug.toLowerCase())
        .eq("is_active", true)
        .maybeSingle();
      metaRow = m2.data;
      te = m2.error;
    }
    if (te || metaRow == null || typeof metaRow !== "object") return null;
    const tr = metaRow as {
      id: string;
      is_feed_sort?: boolean;
      allow_meetup?: boolean;
      allow_question?: boolean;
      feed_list_skin?: unknown;
    };
    return {
      id: String(tr.id),
      is_feed_sort: !!tr.is_feed_sort,
      allow_meetup: !!tr.allow_meetup,
      allow_question: !!tr.allow_question,
      feed_list_skin: normalizeCommunityFeedListSkin(tr.feed_list_skin),
    };
  } catch {
    return null;
  }
}
