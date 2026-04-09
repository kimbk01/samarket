import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";
import { isCommunityCommentPubliclyVisible, isCommunityPostPubliclyVisible } from "@/lib/community-engine/visibility";
import type { CommunityTopicDTO } from "@/lib/community-feed/types";
import { isMissingDbColumnError } from "@/lib/community-feed/supabase-column-error";
import { normalizeCommunityFeedListSkin } from "@/lib/community-feed/topic-feed-skin";
import {
  buildPhilifeTopicColorLookup,
  buildPhilifeTopicFeedListSkinLookup,
  buildPhilifeTopicNameLookup,
  labelForNeighborhoodPostCategory,
  loadPhilifeDefaultSectionTopics,
  neighborhoodPostTopicUiSlug,
} from "@/lib/neighborhood/philife-neighborhood-topics";
import { normalizeNeighborhoodCategory } from "@/lib/neighborhood/categories";
import { isMeetingEventType } from "@/lib/neighborhood/meeting-event-format";
import type {
  NeighborhoodCommentNode,
  NeighborhoodFeedPostDTO,
  NeighborhoodMeetingDetailDTO,
  NeighborhoodMeetingEventDTO,
  NeighborhoodMeetingNoticeDTO,
  MeetingFeedPostDTO,
  MeetingAlbumItemDTO,
} from "@/lib/neighborhood/types";
import { fetchBlockedAuthorIdsForViewer, fetchNeighborFollowTargetIds } from "@/lib/neighborhood/social-filter";

function summarize(text: string, max = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export type NeighborhoodFeedPageResult = {
  posts: NeighborhoodFeedPostDTO[];
  hasMore: boolean;
  /**
   * 이번 요청에서 Supabase `range`로 실제 읽은 행 수(필터 전).
   * 필터로 반환 건수가 줄어도 offset은 이 값만큼 진행해야 페이지 경계에서 중복이 나지 않음.
   */
  dbScannedCount: number;
};

export async function listNeighborhoodFeed(options: {
  locationId: string;
  /** 피드 주제 slug — 동네 피드 섹션 `community_topics`와 동기. 미지정이면 전체 */
  category?: string | null;
  authorUserId?: string | null;
  /** 페이지당 개수 (기본 20, 최대 40) */
  limit?: number;
  offset?: number;
  viewerUserId?: string | null;
  /** true면 로그인 필수 — 관심이웃 + 본인 글만 */
  neighborOnly?: boolean;
  /** 동네 섹션 주제 행 — 스킨·색·라벨 일치. 없으면 서버에서 로드 */
  topics?: CommunityTopicDTO[];
}): Promise<NeighborhoodFeedPageResult> {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return { posts: [], hasMore: false, dbScannedCount: 0 };
  }

  const pageSize = Math.min(Math.max(options.limit ?? 20, 1), 40);
  const offset = Math.min(Math.max(options.offset ?? 0, 0), 500);
  const lid = options.locationId.trim();
  if (!lid) return { posts: [], hasMore: false, dbScannedCount: 0 };

  const v = options.viewerUserId?.trim() ?? "";
  const topicsPromise = options.topics ? Promise.resolve(options.topics) : loadPhilifeDefaultSectionTopics();
  const [topics, socialPair] = await Promise.all([
    topicsPromise,
    v
      ? Promise.all([
          fetchBlockedAuthorIdsForViewer(sb, v),
          options.neighborOnly === true ? fetchNeighborFollowTargetIds(sb, v) : Promise.resolve<Set<string> | null>(null),
        ])
      : Promise.resolve([new Set<string>(), null] as [Set<string>, Set<string> | null]),
  ]);
  const blockExclude = socialPair[0];
  const neighborOnlySet: Set<string> | null = socialPair[1];

  const topicNameBySlug = buildPhilifeTopicNameLookup(topics);
  const topicFeedSkinBySlug = buildPhilifeTopicFeedListSkinLookup(topics);
  const topicColorBySlug = buildPhilifeTopicColorLookup(topics);

  const fetchCount = pageSize + 1;
  const cat = options.category?.trim().toLowerCase() || null;
  const authorUserId = options.authorUserId?.trim();

  const FEED_SELECT_FULL =
    "id, user_id, title, content, summary, category, topic_slug, images, location_id, region_label, view_count, like_count, comment_count, created_at, meetup_date, is_question, is_meetup, meetup_place, is_deleted, is_hidden, status, is_sample_data";
  const FEED_SELECT_FULL_NO_TOPIC_SLUG =
    "id, user_id, title, content, summary, category, images, location_id, region_label, view_count, like_count, comment_count, created_at, meetup_date, is_question, is_meetup, meetup_place, is_deleted, is_hidden, status, is_sample_data";
  const FEED_SELECT_BASE =
    "id, user_id, title, content, summary, category, topic_slug, images, location_id, region_label, view_count, like_count, comment_count, created_at, meetup_date, is_deleted, is_hidden, status, is_sample_data";
  const FEED_SELECT_BASE_NO_TOPIC_SLUG =
    "id, user_id, title, content, summary, category, images, location_id, region_label, view_count, like_count, comment_count, created_at, meetup_date, is_deleted, is_hidden, status, is_sample_data";

  const buildFeedQuery = (selectCols: string, useTopicSlugFilter: boolean) => {
    let qq = sb
      .from("community_posts")
      .select(selectCols)
      .eq("location_id", lid)
      .not("location_id", "is", null)
      .eq("status", "active")
      .eq("is_sample_data", false)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (cat) {
      if (useTopicSlugFilter && selectCols.includes("topic_slug")) {
        if (cat === "meetup") {
          qq = qq.eq("category", "meetup");
        } else if (normalizeNeighborhoodCategory(cat)) {
          qq = qq.or(`category.eq.${cat},topic_slug.eq.${cat}`);
        } else {
          qq = qq.eq("topic_slug", cat);
        }
      } else {
        qq = qq.eq("category", cat);
      }
    }
    if (authorUserId) qq = qq.eq("user_id", authorUserId);
    return qq.range(offset, offset + fetchCount - 1);
  };

  let useTopicSlug = true;
  let { data, error } = await buildFeedQuery(FEED_SELECT_FULL, true);
  if (error && isMissingDbColumnError(error, "topic_slug")) {
    useTopicSlug = false;
    ({ data, error } = await buildFeedQuery(FEED_SELECT_FULL_NO_TOPIC_SLUG, false));
  }
  if (
    error &&
    (isMissingDbColumnError(error, "is_question") ||
      isMissingDbColumnError(error, "is_meetup") ||
      isMissingDbColumnError(error, "meetup_place"))
  ) {
    ({ data, error } = await buildFeedQuery(
      useTopicSlug ? FEED_SELECT_BASE : FEED_SELECT_BASE_NO_TOPIC_SLUG,
      useTopicSlug
    ));
  }

  if (error || !Array.isArray(data)) return { posts: [], hasMore: false, dbScannedCount: 0 };

  const dbScannedCount = data.length;
  let rows = (data as unknown as Record<string, unknown>[]).filter((r) => {
    if (!isCommunityPostPubliclyVisible(r as never)) return false;
    const loc = r.location_id;
    if (loc == null || String(loc).trim() === "") return false;
    const uid = String(r.user_id ?? "");
    if (blockExclude.has(uid)) return false;
    if (neighborOnlySet && !neighborOnlySet.has(uid)) return false;
    const raw = String(r.category ?? "").trim().toLowerCase();
    if (!raw) return false;
    return true;
  });

  /** DB 창을 꽉 채웠으면 뒤에 행이 더 있을 수 있음(필터로 이번 페이지가 짧아도 다음 offset 필요) */
  const hasMore = dbScannedCount === fetchCount;
  rows = rows.slice(0, pageSize);

  const uids = [...new Set(rows.map((r) => String(r.user_id ?? "")).filter(Boolean))];
  const postIds = rows.map((r) => String(r.id));
  const meetingsPromise =
    postIds.length > 0
      ? (async () => {
          const rMeet = await sb
            .from("meetings")
            .select("id, post_id, meeting_date, tenure_type")
            .in("post_id", postIds);
          if (rMeet.error && isMissingDbColumnError(rMeet.error, "tenure_type")) {
            const r2 = await sb.from("meetings").select("id, post_id, meeting_date").in("post_id", postIds);
            return (r2.data as unknown[] | null) ?? null;
          }
          return (rMeet.data as unknown[] | null) ?? null;
        })()
      : Promise.resolve(null);

  const [nickMap, meetings] = await Promise.all([
    fetchNicknamesForUserIds(sb as never, uids),
    meetingsPromise,
  ]);

  const meetByPost = new Map<string, { id: string; meeting_date: string | null; tenure_type?: string | null }>();
  if (Array.isArray(meetings)) {
    for (const m of meetings as {
      id?: string;
      post_id?: string;
      meeting_date?: string | null;
      tenure_type?: string | null;
    }[]) {
      const pid = String(m.post_id ?? "");
      if (pid && m.id)
        meetByPost.set(pid, {
          id: String(m.id),
          meeting_date: m.meeting_date ?? null,
          tenure_type: m.tenure_type ?? null,
        });
    }
  }

  const defaultSkin = normalizeCommunityFeedListSkin(undefined);
  const posts = rows.map((r) => {
    const uid = String(r.user_id ?? "");
    const locationLabel = String(r.region_label ?? "").trim();
    const enumCat = String(r.category ?? "etc").trim().toLowerCase() || "etc";
    const topicUiSlug = neighborhoodPostTopicUiSlug(r);
    const imgs = Array.isArray(r.images) ? (r.images as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const meet = meetByPost.get(String(r.id));
    const content = String(r.content ?? "");
    const isQuestion = Boolean(r.is_question);
    const isMeetupRow = Boolean(r.is_meetup);
    const meetupPlace = r.meetup_place != null && String(r.meetup_place).trim() !== "" ? String(r.meetup_place).trim() : null;
    const hasMeeting = Boolean(meet?.id);
    const isMeetup = hasMeeting || isMeetupRow || enumCat === "meetup";
    const feedSkin = topicFeedSkinBySlug.get(topicUiSlug) ?? defaultSkin;
    const topicColor = topicColorBySlug.get(topicUiSlug) ?? null;
    return {
      id: String(r.id),
      category: topicUiSlug,
      category_label: labelForNeighborhoodPostCategory(topicUiSlug, topicNameBySlug),
      feed_list_skin: feedSkin,
      topic_color: topicColor,
      is_question: isQuestion,
      is_meetup: isMeetup,
      meetup_place: meetupPlace,
      title: String(r.title ?? ""),
      content,
      summary: r.summary != null ? String(r.summary) : summarize(content),
      location_id: String(r.location_id ?? lid),
      location_label: locationLabel,
      images: imgs,
      view_count: Number(r.view_count ?? 0),
      like_count: Number(r.like_count ?? 0),
      comment_count: Number(r.comment_count ?? 0),
      created_at: String(r.created_at ?? ""),
      author_name: nickMap.get(uid) ?? (uid ? uid.slice(0, 8) : "익명"),
      author_id: uid,
      meeting_id: meet?.id ?? null,
      meeting_date:
        meet?.tenure_type === "long"
          ? null
          : meet?.meeting_date ?? (r.meetup_date != null ? String(r.meetup_date) : null),
    };
  });

  return { posts, hasMore, dbScannedCount };
}

/** `post_id`로 연결된 모임 id — 컬럼 세트가 옛 DB와 다를 때 단계적 select */
async function fetchMeetingLinkByPostId(
  sb: ReturnType<typeof getSupabaseServer>,
  postId: string
): Promise<{ id: string; meeting_date: string | null; tenure: "short" | "long" } | null> {
  const trySelect = async (cols: string) =>
    sb.from("meetings").select(cols).eq("post_id", postId).maybeSingle();

  let { data, error } = await trySelect("id, meeting_date, tenure_type");
  if (error && isMissingDbColumnError(error, "tenure_type")) {
    ({ data, error } = await trySelect("id, meeting_date"));
  }
  if (!data) {
    ({ data } = await trySelect("id"));
  }
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  const id = String(row.id ?? "");
  if (!id) return null;
  const tenure: "short" | "long" = row.tenure_type === "long" ? "long" : "short";
  const meeting_date = row.meeting_date != null ? String(row.meeting_date) : null;
  return { id, meeting_date, tenure };
}

export async function getNeighborhoodPostDetail(
  postId: string,
  options?: { viewerUserId?: string | null }
): Promise<NeighborhoodFeedPostDTO | null> {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return null;
  }

  const v = options?.viewerUserId?.trim() ?? "";
  const DETAIL_SELECT_FULL =
    "id, user_id, title, content, summary, category, topic_slug, images, location_id, region_label, view_count, like_count, comment_count, created_at, meetup_date, is_question, is_meetup, meetup_place, is_deleted, is_hidden, status, is_sample_data";
  const DETAIL_SELECT_FULL_NO_TOPIC_SLUG =
    "id, user_id, title, content, summary, category, images, location_id, region_label, view_count, like_count, comment_count, created_at, meetup_date, is_question, is_meetup, meetup_place, is_deleted, is_hidden, status, is_sample_data";
  const DETAIL_SELECT_BASE =
    "id, user_id, title, content, summary, category, topic_slug, images, location_id, region_label, view_count, like_count, comment_count, created_at, meetup_date, is_deleted, is_hidden, status, is_sample_data";
  const DETAIL_SELECT_BASE_NO_TOPIC_SLUG =
    "id, user_id, title, content, summary, category, images, location_id, region_label, view_count, like_count, comment_count, created_at, meetup_date, is_deleted, is_hidden, status, is_sample_data";

  const fetchDetailRow = async (cols: string) => {
    let q = sb.from("community_posts").select(cols).eq("id", postId).eq("is_sample_data", false);
    if (v) {
      q = q.or(`status.eq.active,user_id.eq.${v}`);
    } else {
      q = q.eq("status", "active");
    }
    return q.maybeSingle();
  };

  let useTopicSlugDetail = true;
  let { data, error } = await fetchDetailRow(DETAIL_SELECT_FULL);
  if (error && isMissingDbColumnError(error, "topic_slug")) {
    useTopicSlugDetail = false;
    ({ data, error } = await fetchDetailRow(DETAIL_SELECT_FULL_NO_TOPIC_SLUG));
  }
  if (
    error &&
    (isMissingDbColumnError(error, "is_question") ||
      isMissingDbColumnError(error, "is_meetup") ||
      isMissingDbColumnError(error, "meetup_place"))
  ) {
    ({ data, error } = await fetchDetailRow(
      useTopicSlugDetail ? DETAIL_SELECT_BASE : DETAIL_SELECT_BASE_NO_TOPIC_SLUG
    ));
  }

  if (error || !data) return null;
  const row = data as unknown as Record<string, unknown>;
  if (!isCommunityPostPubliclyVisible(row as never) && String(row.user_id ?? "") !== v) return null;
  if (row.location_id == null || String(row.location_id).trim() === "") return null;

  const uid = String(row.user_id ?? "");
  const [blocked, nickMap, topics, meetLink] = await Promise.all([
    v ? fetchBlockedAuthorIdsForViewer(sb, v) : Promise.resolve(new Set<string>()),
    fetchNicknamesForUserIds(sb as never, [uid]),
    loadPhilifeDefaultSectionTopics(),
    fetchMeetingLinkByPostId(sb, postId),
  ]);
  if (v && blocked.has(uid)) return null;

  const locationLabel = String(row.region_label ?? "").trim();
  const topicNameBySlug = buildPhilifeTopicNameLookup(topics);
  const topicFeedSkinBySlug = buildPhilifeTopicFeedListSkinLookup(topics);
  const topicColorBySlug = buildPhilifeTopicColorLookup(topics);
  const enumCat = String(row.category ?? "etc").trim().toLowerCase() || "etc";
  const topicUiSlug = neighborhoodPostTopicUiSlug(row);
  const imgs = Array.isArray(row.images) ? (row.images as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const content = String(row.content ?? "");
  const isQuestion = Boolean(row.is_question);
  const isMeetupRow = Boolean(row.is_meetup);
  const meetupPlace = row.meetup_place != null && String(row.meetup_place).trim() !== "" ? String(row.meetup_place).trim() : null;
  const hasMeeting = Boolean(meetLink?.id);
  const isMeetup = hasMeeting || isMeetupRow || enumCat === "meetup";
  const defaultSkin = normalizeCommunityFeedListSkin(undefined);

  return {
    id: String(row.id),
    category: topicUiSlug,
    category_label: labelForNeighborhoodPostCategory(topicUiSlug, topicNameBySlug),
    feed_list_skin: topicFeedSkinBySlug.get(topicUiSlug) ?? defaultSkin,
    topic_color: topicColorBySlug.get(topicUiSlug) ?? null,
    is_question: isQuestion,
    is_meetup: isMeetup,
    meetup_place: meetupPlace,
    title: String(row.title ?? ""),
    content,
    summary: row.summary != null ? String(row.summary) : summarize(content),
    location_id: String(row.location_id ?? ""),
    location_label: locationLabel,
    images: imgs,
    view_count: Number(row.view_count ?? 0),
    like_count: Number(row.like_count ?? 0),
    comment_count: Number(row.comment_count ?? 0),
    created_at: String(row.created_at ?? ""),
    author_name: nickMap.get(uid) ?? (uid ? uid.slice(0, 8) : "익명"),
    author_id: uid,
    meeting_id: meetLink?.id ?? null,
    meeting_date:
      meetLink?.tenure === "long"
        ? null
        : meetLink?.meeting_date != null
          ? meetLink.meeting_date
          : row.meetup_date != null
            ? String(row.meetup_date)
            : null,
  };
}

export async function listNeighborhoodComments(postId: string, viewerUserId?: string | null): Promise<NeighborhoodCommentNode[]> {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return [];
  }

  const v = viewerUserId?.trim() ?? "";
  const [{ data, error }, blockExclude] = await Promise.all([
    sb
      .from("community_comments")
      .select("id, post_id, user_id, parent_id, content, created_at, is_deleted, is_hidden, status")
      .eq("post_id", postId)
      .order("created_at", { ascending: true }),
    v ? fetchBlockedAuthorIdsForViewer(sb, v) : Promise.resolve(new Set<string>()),
  ]);

  if (error || !Array.isArray(data)) return [];

  let rows = (data as Record<string, unknown>[]).filter((r) => isCommunityCommentPubliclyVisible(r as never));

  if (v) {
    rows = rows.filter((r) => !blockExclude.has(String(r.user_id ?? "")));
  }

  const uids = [...new Set(rows.map((r) => String(r.user_id ?? "")).filter(Boolean))];
  const nickMap = await fetchNicknamesForUserIds(sb as never, uids);

  const nodes: NeighborhoodCommentNode[] = rows.map((r) => ({
    id: String(r.id),
    post_id: String(r.post_id ?? ""),
    user_id: String(r.user_id ?? ""),
    parent_id: r.parent_id != null ? String(r.parent_id) : null,
    content: String(r.content ?? ""),
    created_at: String(r.created_at ?? ""),
    author_name: nickMap.get(String(r.user_id ?? "")) ?? String(r.user_id ?? "").slice(0, 8),
    children: [],
  }));

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots: NeighborhoodCommentNode[] = [];
  for (const n of nodes) {
    if (n.parent_id && byId.has(n.parent_id)) {
      byId.get(n.parent_id)!.children.push(n);
    } else {
      roots.push(n);
    }
  }
  return roots;
}

/** `/philife/:id` 오인 방지: id가 community_posts가 아니라 meetings.id인 경우 */
export async function isNeighborhoodMeetingId(meetingId: string): Promise<boolean> {
  const id = meetingId?.trim();
  if (!id) return false;
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return false;
  }
  const { data, error } = await sb.from("meetings").select("id").eq("id", id).maybeSingle();
  if (error || !data) return false;
  return !!(data as { id?: string }).id;
}

/** DB 마이그레이션 단계별로 컬럼이 다를 수 있어 select 를 단계적으로 시도 */
const MEETING_DETAIL_SELECT_LEVELS: string[] = [
  "id, post_id, title, description, location_text, meeting_date, tenure_type, max_members, created_by, host_user_id, join_policy, entry_policy, requires_approval, status, is_closed, joined_count, pending_count, banned_count, notice_count, last_notice_at, chat_room_id, password_hash, welcome_message, cover_image_url, allow_feed, allow_album_upload",
  "id, post_id, title, description, location_text, meeting_date, tenure_type, max_members, created_by, host_user_id, join_policy, entry_policy, requires_approval, status, is_closed, joined_count, pending_count, banned_count, notice_count, last_notice_at, chat_room_id, password_hash",
  "id, post_id, title, description, location_text, meeting_date, tenure_type, max_members, created_by, host_user_id, join_policy, status, is_closed, chat_room_id",
  "id, post_id, title, description, location_text, meeting_date, max_members, created_by, host_user_id, join_policy, status, is_closed, chat_room_id",
  "id, post_id, title, description, location_text, meeting_date, max_members, created_by, join_policy, status, is_closed, chat_room_id",
];

export async function getMeetingDetail(meetingId: string): Promise<NeighborhoodMeetingDetailDTO | null> {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return null;
  }

  const mid = meetingId?.trim();
  if (!mid) return null;

  let row: Record<string, unknown> | null = null;
  for (const cols of MEETING_DETAIL_SELECT_LEVELS) {
    const { data, error } = await sb.from("meetings").select(cols as never).eq("id", mid).maybeSingle();
    if (!error && data) {
      row = data as unknown as Record<string, unknown>;
      break;
    }
  }
  if (!row) return null;

  const { count } = await sb
    .from("meeting_members")
    .select("id", { count: "exact", head: true })
    .eq("meeting_id", mid)
    .eq("status", "joined");

  const st = String(row.status ?? (row.is_closed ? "closed" : "open"));
  const tenure = row.tenure_type === "long" ? "long" : "short";
  const joinedHead = count ?? 0;
  const jp = String(row.join_policy ?? "open").trim() || "open";
  const ep = row.entry_policy;
  const entryRaw =
    ep != null && String(ep).trim() !== "" ? String(ep).trim().toLowerCase() : jp.toLowerCase();
  const hasPwd = String(row.password_hash ?? "").trim().length > 0;
  let entry_policy = (["open", "approve", "password", "invite_only"].includes(entryRaw)
    ? entryRaw
    : jp === "approve"
      ? "approve"
      : "open") as NeighborhoodMeetingDetailDTO["entry_policy"];
  /** `password_hash` 가 있는데 정책만 open 으로 떨어지면 가입 API와 UI가 엇갈려 빈 POST 로 invalid_password 나는 경우 방지 */
  if (
    hasPwd &&
    entry_policy === "open" &&
    entryRaw !== "approve" &&
    entryRaw !== "invite_only"
  ) {
    entry_policy = "password";
  }
  return {
    id: String(row.id),
    post_id: String(row.post_id ?? ""),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    location_text: String(row.location_text ?? ""),
    meeting_date: tenure === "long" ? null : row.meeting_date != null ? String(row.meeting_date) : null,
    tenure_type: tenure,
    max_members: Number(row.max_members ?? 0),
    member_count: joinedHead,
    created_by: String(row.created_by ?? ""),
    host_user_id: String(row.host_user_id ?? row.created_by ?? ""),
    join_policy: jp,
    entry_policy,
    requires_approval:
      row.requires_approval === true ||
      entryRaw === "approve" ||
      entryRaw === "invite_only" ||
      jp === "approve",
    has_password: hasPwd,
    status: st,
    is_closed: !!row.is_closed || st === "closed" || st === "ended" || st === "cancelled",
    joined_count: Number(row.joined_count ?? joinedHead),
    pending_count: Number(row.pending_count ?? 0),
    banned_count: Number(row.banned_count ?? 0),
    notice_count: Number(row.notice_count ?? 0),
    last_notice_at: row.last_notice_at != null ? String(row.last_notice_at) : null,
    chat_room_id: row.chat_room_id != null ? String(row.chat_room_id) : null,
    welcome_message: row.welcome_message != null ? String(row.welcome_message) : null,
    cover_image_url: row.cover_image_url != null ? String(row.cover_image_url) : null,
    allow_feed: row.allow_feed !== false,
    allow_album_upload: row.allow_album_upload !== false,
  };
}

/** 모임 피드 글 상세에서 댓글 입력 허용 여부 등에 사용 */
export async function isViewerJoinedNeighborhoodMeeting(
  meetingId: string,
  viewerUserId: string | null | undefined
): Promise<boolean> {
  const mid = meetingId?.trim();
  const uid = viewerUserId?.trim();
  if (!mid || !uid) return false;
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return false;
  }
  const { data, error } = await sb
    .from("meeting_members")
    .select("id")
    .eq("meeting_id", mid)
    .eq("user_id", uid)
    .eq("status", "joined")
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

export async function listMeetingFeedPosts(
  meetingId: string,
  limit = 30
): Promise<MeetingFeedPostDTO[]> {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return [];
  }

  const pageSize = Math.min(Math.max(limit, 1), 50);
  const { data, error } = await sb
    .from("meeting_feed_posts")
    .select("id, meeting_id, author_user_id, post_type, content, is_pinned, is_hidden, created_at")
    .eq("meeting_id", meetingId)
    .is("deleted_at", null)
    .eq("is_hidden", false)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(pageSize);

  if (error || !Array.isArray(data)) return [];

  const uids = [...new Set(data.map((r: Record<string, unknown>) => String(r.author_user_id ?? "")).filter(Boolean))];
  const nickMap = await fetchNicknamesForUserIds(sb as never, uids);

  return (data as Record<string, unknown>[]).map((row) => {
    const uid = String(row.author_user_id ?? "");
    const pt = String(row.post_type ?? "normal");
    return {
      id: String(row.id),
      meeting_id: String(row.meeting_id ?? meetingId),
      author_user_id: uid,
      author_name: nickMap.get(uid) ?? (uid ? uid.slice(0, 8) : "알 수 없음"),
      post_type: (["normal", "notice", "intro", "attendance", "review"].includes(pt)
        ? pt
        : "normal") as MeetingFeedPostDTO["post_type"],
      content: String(row.content ?? ""),
      is_pinned: !!row.is_pinned,
      is_hidden: !!row.is_hidden,
      created_at: String(row.created_at ?? ""),
    };
  });
}

export async function listMeetingAlbumItems(
  meetingId: string,
  limit = 30
): Promise<MeetingAlbumItemDTO[]> {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return [];
  }

  const pageSize = Math.min(Math.max(limit, 1), 50);
  const { data, error } = await sb
    .from("meeting_album_items")
    .select("id, meeting_id, uploader_user_id, image_url, caption, is_hidden, created_at")
    .eq("meeting_id", meetingId)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(pageSize);

  if (error || !Array.isArray(data)) return [];

  const uids = [...new Set(data.map((r: Record<string, unknown>) => String(r.uploader_user_id ?? "")).filter(Boolean))];
  const nickMap = await fetchNicknamesForUserIds(sb as never, uids);

  return (data as Record<string, unknown>[]).map((row) => {
    const uid = String(row.uploader_user_id ?? "");
    return {
      id: String(row.id),
      meeting_id: String(row.meeting_id ?? meetingId),
      uploader_user_id: uid,
      uploader_name: nickMap.get(uid) ?? (uid ? uid.slice(0, 8) : "알 수 없음"),
      image_url: row.image_url != null ? String(row.image_url) : null,
      caption: row.caption != null ? String(row.caption) : null,
      is_hidden: !!row.is_hidden,
      created_at: String(row.created_at ?? ""),
    };
  });
}

export async function listMeetingNotices(meetingId: string, limit = 3): Promise<NeighborhoodMeetingNoticeDTO[]> {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return [];
  }

  /** 모임 상세 공지 탭 등에서 한 번에 충분히 불러오기 (상한만 둠) */
  const pageSize = Math.min(Math.max(limit, 1), 80);
  const { data, error } = await sb
    .from("meeting_notices")
    .select("id, meeting_id, title, body, visibility, is_pinned, created_at, updated_at, author_user_id")
    .eq("meeting_id", meetingId)
    .eq("is_active", true)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(pageSize);

  if (error || !Array.isArray(data)) return [];

  return data.map((row) => ({
    id: String(row.id),
    meeting_id: String(row.meeting_id ?? meetingId),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    visibility: String(row.visibility ?? "members") === "public" ? "public" : "members",
    is_pinned: !!row.is_pinned,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? row.created_at ?? ""),
    author_user_id: String(row.author_user_id ?? ""),
  }));
}

export type ListMeetingEventsPageResult = {
  events: NeighborhoodMeetingEventDTO[];
  hasMore: boolean;
};

export async function listMeetingEventsPage(
  meetingId: string,
  options: { limit?: number; offset?: number; eventType?: string | null } = {}
): Promise<ListMeetingEventsPageResult> {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return { events: [], hasMore: false };
  }

  const pageSize = Math.min(Math.max(options.limit ?? 15, 1), 30);
  const offset = Math.min(Math.max(options.offset ?? 0, 0), 2000);
  const fetchCount = pageSize + 1;

  let q = sb
    .from("meeting_events")
    .select("id, meeting_id, actor_user_id, target_user_id, event_type, payload, created_at")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  const et = options.eventType?.trim() ?? "";
  if (et && isMeetingEventType(et)) {
    q = q.eq("event_type", et);
  }

  const { data, error } = await q.range(offset, offset + fetchCount - 1);

  if (error || !Array.isArray(data)) return { events: [], hasMore: false };

  const hasMore = data.length > pageSize;
  const slice = hasMore ? data.slice(0, pageSize) : data;

  const userIds = [
    ...new Set(
      slice
        .flatMap((row) => [String(row.actor_user_id ?? "").trim(), String(row.target_user_id ?? "").trim()])
        .filter(Boolean)
    ),
  ];
  const nickMap = await fetchNicknamesForUserIds(sb as never, userIds);

  const events = slice.map((row) => {
    const actorId = row.actor_user_id != null ? String(row.actor_user_id) : null;
    const targetId = row.target_user_id != null ? String(row.target_user_id) : null;
    return {
      id: String(row.id),
      meeting_id: String(row.meeting_id ?? meetingId),
      actor_user_id: actorId,
      actor_name: actorId ? nickMap.get(actorId) ?? actorId.slice(0, 8) : "시스템",
      target_user_id: targetId,
      target_name: targetId ? nickMap.get(targetId) ?? targetId.slice(0, 8) : null,
      event_type: String(row.event_type ?? ""),
      payload:
        row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : {},
      created_at: String(row.created_at ?? ""),
    };
  });

  return { events, hasMore };
}
