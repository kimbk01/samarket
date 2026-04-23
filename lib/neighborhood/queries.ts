import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";
import { isCommunityCommentPubliclyVisible, isCommunityPostPubliclyVisible } from "@/lib/community-engine/visibility";
import type { CommunityFeedSortMode } from "@/lib/community-feed/constants";
import type { CommunityTopicDTO } from "@/lib/community-feed/types";
import { isMissingDbColumnError } from "@/lib/community-feed/supabase-column-error";
import { rankByRecommended } from "@/lib/community-feed/feed-ranking";
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
import { COMMUNITY_POST_FEED_STATUS_ACTIVE } from "@/lib/neighborhood/community-post-contract";
import { resolveNeighborhoodListSort } from "@/lib/neighborhood/philife-neighborhood-feed-sort";
import { stripMarkdownImageSyntaxForFeedPreview } from "@/lib/philife/interleaved-body-markdown";

function summarize(text: string, max = 120): string {
  const t = stripMarkdownImageSyntaxForFeedPreview(text);
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function countCsvSelectColumns(selectList: string): number {
  return selectList.split(",").map((c) => c.trim()).filter(Boolean).length;
}

/** 개발·진단용 — `listNeighborhoodFeed` 가 채움(프로덕션 응답 본문에는 포함하지 않음) */
export type NeighborhoodFeedServerPerfMs = {
  /**
   * 메인 `community_posts` 구간 합 — `main_query_filter_prepare_ms` + `main_query_db_ms` + `main_query_postprocess_ms`.
   * (과거에는 DB await 만 포함했으나, 분해와 합계를 맞추기 위해 전 구간으로 통일)
   */
  community_query_main_ms: number;
  /** `buildFeedQuery` 동기 체인 구성(각 라운드 합) */
  main_query_filter_prepare_ms: number;
  /** Supabase 왕복(await) 합 — 라운드마다 1회 이상 */
  main_query_db_ms: number;
  /** 마지막 성공 응답 직후 ~ `rows`·`postIds` 확정까지(차단/이웃 필터·slice). meetings/닉 제외 */
  main_query_postprocess_ms: number;
  /** `range` 전 DB가 돌려준 원시 행 수(필터 전) */
  main_query_row_count: number;
  /** 성공 시 사용한 select 문자열의 컬럼 개수(쉼표 분리) */
  main_query_selected_columns_count: number;
  /** 마지막 성공 라운드의 select 목록(진단용) */
  main_query_select_columns: string;
  /** eq / or / range 요약 */
  main_query_where_summary: string;
  /** order + range 요약 */
  main_query_order_summary: string;
  /** 차단/관심이웃 프리페치 + 닉네임·모임 병렬 구간 합(벽시계 합, 순차 단계) */
  community_query_related_ms: number;
  community_result_transform_ms: number;
  main_query_rounds: number;
  post_return_count: number;
  image_url_count_approx: number;
  /** `fetchNicknamesForUserIds` 내부: profiles 1회 + 필요 시 test_users 1회 */
  nickname_query_rounds: number;
  /** meetings `.in(post_id)` 시도 횟수(컬럼 폴백) */
  meetings_query_rounds: number;
  /** 로그인 시 `fetchBlockedAuthorIdsForViewer` 가 실행한 Supabase `.from` 호출 수(캐시 히트면 0) */
  blocked_supabase_calls: number;
  neighbor_follow_query: 0 | 1;
  /** `fetchBlockedAuthorIdsForViewer` 단일 await 구간(내부 최대 4 parallel select) */
  related_blocked_filter_ms: number;
  /** `neighborOnly` 이고 로그인일 때만 `fetchNeighborFollowTargetIds` */
  related_neighbor_filter_ms: number;
  /** `fetchNicknamesForUserIds` 전체(배치 profiles + 필요 시 test_users) */
  related_nickname_ms: number;
  /** `meetings` `.in(post_id, …)` 1회 */
  related_meetings_ms: number;
  /**
   * 병렬 구간에서 각 다리 벽시계 합보다 큰 잔여(이벤트 루프·`topicsPromise`가 social과 겹칠 때 등).
   * `community_query_related_ms` ≈ max(social 다리) + max(nick, meetings) + related_other_ms 가 아님 —
   * related_ms는 순차(social 벽시계 + nick∥meet 벽시계)이므로 other는 각 병렬 묶음의 잔여 합.
   */
  related_other_ms: number;
  /** 필터 통과 후 글 행 기준 고유 `user_id` 수 — 닉네임 배치 입력 크기 */
  related_distinct_author_ids: number;
  /** meetings `.in` 에 넣은 `community_posts.id` 개수 */
  related_meetings_post_ids: number;
};

export type NeighborhoodFeedPageResult = {
  posts: NeighborhoodFeedPostDTO[];
  hasMore: boolean;
  /**
   * 이번 요청에서 Supabase `range`로 실제 읽은 행 수(필터 전).
   * 필터로 반환 건수가 줄어도 offset은 이 값만큼 진행해야 페이지 경계에서 중복이 나지 않음.
   */
  dbScannedCount: number;
  /**
   * `nextOffset` = 요청 `offset` + `pagingOffsetAdvance` — `recommended` 랭크 모드는 `posts.length`(랭크 공간)를 쓰고, 그 외는 `dbScannedCount`(SQL 범위).
   */
  pagingOffsetAdvance: number;
  /** `NODE_ENV === "development"` 일 때만 채움 — 라우트가 응답 헤더로 노출 */
  serverCommunityPerf?: NeighborhoodFeedServerPerfMs;
};

export async function listNeighborhoodFeed(options: {
  /**
   * `allLocations` 가 false(기본)일 때만 사용 — 해당 동네 `locations.id`.
   * `allLocations` 가 true 이면 지역 필터 없이 전체 글(주제·차단 등만 적용).
   */
  locationId?: string | null;
  allLocations?: boolean;
  /** 피드 주제 slug — 동네 피드 섹션 `community_topics`와 동기. 미지정이면 전체 */
  category?: string | null;
  authorUserId?: string | null;
  /** 페이지당 개수 (기본 20, 최대 40) */
  limit?: number;
  offset?: number;
  viewerUserId?: string | null;
  /** true면 로그인 필수 — 관심이웃 + 본인 글만 */
  neighborOnly?: boolean;
  /**
   * 글 정렬(기본 `latest`).
   * - `popular` — `view_count`·`created_at` 내림차순(인기/조회 많은순).
   * - `recommended` — `feed-ranking` 점수(풀 max 200행) 후 `offset` 으로 페이지 슬라이스; 추천 탭의 `최신순`은 `latest` 를 쓴다.
   */
  feedSort?: CommunityFeedSortMode;
  /** 동네 섹션 주제 행 — 스킨·색·라벨 일치. 없으면 서버에서 로드 */
  topics?: CommunityTopicDTO[];
}): Promise<NeighborhoodFeedPageResult> {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return { posts: [], hasMore: false, dbScannedCount: 0, pagingOffsetAdvance: 0 };
  }

  const pageSize = Math.min(Math.max(options.limit ?? 20, 1), 40);
  const offset = Math.min(Math.max(options.offset ?? 0, 0), 500);
  const allLocations = options.allLocations === true;
  const lid = options.locationId?.trim() ?? "";
  if (!allLocations && !lid) return { posts: [], hasMore: false, dbScannedCount: 0, pagingOffsetAdvance: 0 };

  const collectPerf = process.env.NODE_ENV === "development";
  const blockedMetrics = { supabaseSelectCalls: 0 };
  const nickMetrics = { profileSelect: 0, testUsersSelect: 0 };
  let meetingsQueryRounds = 0;
  let socialPreflightMs = 0;
  let mainPrepareMs = 0;
  let mainDbMs = 0;
  let mainPostprocessMs = 0;
  let mainRounds = 0;
  let nickMeetMs = 0;
  let transformMs = 0;
  let relatedBlockedFilterMs = 0;
  let relatedNeighborFilterMs = 0;
  let relatedNicknameMs = 0;
  let relatedMeetingsMs = 0;

  const v = options.viewerUserId?.trim() ?? "";
  const topicsPromise = options.topics ? Promise.resolve(options.topics) : loadPhilifeDefaultSectionTopics();

  const blockedP: Promise<Set<string>> = v
    ? (async () => {
        const t0 = performance.now();
        try {
          return await fetchBlockedAuthorIdsForViewer(sb, v, collectPerf ? blockedMetrics : undefined);
        } finally {
          if (collectPerf) relatedBlockedFilterMs = performance.now() - t0;
        }
      })()
    : Promise.resolve(new Set<string>());

  const neighborP: Promise<Set<string> | null> =
    v && options.neighborOnly === true
      ? (async () => {
          const t0 = performance.now();
          try {
            return await fetchNeighborFollowTargetIds(sb, v);
          } finally {
            if (collectPerf) relatedNeighborFilterMs = performance.now() - t0;
          }
        })()
      : Promise.resolve<Set<string> | null>(null);

  const tSoc0 = performance.now();
  const [topics, blockExclude, neighborOnlySet] = await Promise.all([topicsPromise, blockedP, neighborP]);
  socialPreflightMs = performance.now() - tSoc0;

  const topicNameBySlug = buildPhilifeTopicNameLookup(topics);
  const topicFeedSkinBySlug = buildPhilifeTopicFeedListSkinLookup(topics);
  const topicColorBySlug = buildPhilifeTopicColorLookup(topics);

  const fetchCount = pageSize + 1;
  const authorUserId = options.authorUserId?.trim();
  const sortIn: CommunityFeedSortMode = options.feedSort ?? "latest";
  const { filterCategory: filterCat, feedSort: effSort } = resolveNeighborhoodListSort(
    options.category,
    sortIn,
    topics
  );

  const FEED_SELECT_FULL =
    "id, user_id, title, summary, category, topic_slug, images, location_id, region_label, view_count, like_count, comment_count, created_at, meetup_date, is_question, is_meetup, meetup_place, is_deleted, is_hidden, status";
  const FEED_SELECT_FULL_NO_TOPIC_SLUG =
    "id, user_id, title, summary, category, images, location_id, region_label, view_count, like_count, comment_count, created_at, meetup_date, is_question, is_meetup, meetup_place, is_deleted, is_hidden, status";
  const FEED_SELECT_BASE =
    "id, user_id, title, summary, category, topic_slug, images, location_id, region_label, view_count, like_count, comment_count, created_at, meetup_date, is_deleted, is_hidden, status";
  const FEED_SELECT_BASE_NO_TOPIC_SLUG =
    "id, user_id, title, summary, category, images, location_id, region_label, view_count, like_count, comment_count, created_at, meetup_date, is_deleted, is_hidden, status";

  const buildFeedQuery = (
    selectCols: string,
    useTopicSlugFilter: boolean,
    rangeFrom: number,
    rangeToInclusive: number
  ) => {
    let qq = sb.from("community_posts").select(selectCols).eq("status", COMMUNITY_POST_FEED_STATUS_ACTIVE);
    if (effSort === "popular") {
      qq = qq
        .order("view_count", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
    } else {
      /* 추천(랭크) 풀도 최신 기준 200행만 가져온 뒤 메모리에서 `rankByRecommended` — 추가 페이지는 동일 풀을 슬라이스 */
      qq = qq.order("created_at", { ascending: false }).order("id", { ascending: false });
    }
    if (!allLocations) {
      qq = qq.eq("location_id", lid).not("location_id", "is", null);
    }
    if (filterCat) {
      if (useTopicSlugFilter && selectCols.includes("topic_slug")) {
        if (filterCat === "meetup") {
          qq = qq.eq("category", "meetup");
        } else if (normalizeNeighborhoodCategory(filterCat)) {
          qq = qq.or(`category.eq.${filterCat},topic_slug.eq.${filterCat}`);
        } else {
          qq = qq.eq("topic_slug", filterCat);
        }
      } else {
        qq = qq.eq("category", filterCat);
      }
    }
    if (authorUserId) qq = qq.eq("user_id", authorUserId);
    return qq.range(rangeFrom, rangeToInclusive);
  };

  const rangeForPage: [number, number] | null = effSort === "recommended" ? [0, 199] : null;
  const runMainSelect = async (
    selectCols: string,
    useTopicSlugFilter: boolean,
    range: [number, number] | null
  ) => {
    const r0 = range?.[0] ?? offset;
    const r1 = range?.[1] ?? offset + fetchCount - 1;
    const tPrep = performance.now();
    const q = buildFeedQuery(selectCols, useTopicSlugFilter, r0, r1);
    mainPrepareMs += performance.now() - tPrep;
    const tDb = performance.now();
    const res = await q;
    mainDbMs += performance.now() - tDb;
    mainRounds += 1;
    return res;
  };

  let useTopicSlug = true;
  let effectiveSelectCols = FEED_SELECT_FULL;
  let { data, error } = await runMainSelect(FEED_SELECT_FULL, true, rangeForPage);
  if (error && isMissingDbColumnError(error, "topic_slug")) {
    useTopicSlug = false;
    ({ data, error } = await runMainSelect(FEED_SELECT_FULL_NO_TOPIC_SLUG, false, rangeForPage));
    effectiveSelectCols = FEED_SELECT_FULL_NO_TOPIC_SLUG;
  }
  if (
    error &&
    (isMissingDbColumnError(error, "is_question") ||
      isMissingDbColumnError(error, "is_meetup") ||
      isMissingDbColumnError(error, "meetup_place"))
  ) {
    effectiveSelectCols = useTopicSlug ? FEED_SELECT_BASE : FEED_SELECT_BASE_NO_TOPIC_SLUG;
    ({ data, error } = await runMainSelect(effectiveSelectCols, useTopicSlug, rangeForPage));
  }

  if (error || !Array.isArray(data)) {
    const empty: NeighborhoodFeedPageResult = { posts: [], hasMore: false, dbScannedCount: 0, pagingOffsetAdvance: 0 };
    if (collectPerf) {
      const maxSocLeg = Math.max(relatedBlockedFilterMs, relatedNeighborFilterMs);
      const relatedOtherSocial = Math.max(0, socialPreflightMs - maxSocLeg);
      const mainTotalErr = mainPrepareMs + mainDbMs;
      empty.serverCommunityPerf = {
        community_query_main_ms: Math.round(mainTotalErr),
        main_query_filter_prepare_ms: Math.round(mainPrepareMs),
        main_query_db_ms: Math.round(mainDbMs),
        main_query_postprocess_ms: 0,
        main_query_row_count: 0,
        main_query_selected_columns_count: 0,
        main_query_select_columns: "",
        main_query_where_summary: "",
        main_query_order_summary: "",
        community_query_related_ms: Math.round(socialPreflightMs),
        community_result_transform_ms: 0,
        main_query_rounds: mainRounds,
        post_return_count: 0,
        image_url_count_approx: 0,
        nickname_query_rounds: 0,
        meetings_query_rounds: 0,
        blocked_supabase_calls: blockedMetrics.supabaseSelectCalls,
        neighbor_follow_query: options.neighborOnly === true && v ? 1 : 0,
        related_blocked_filter_ms: Math.round(relatedBlockedFilterMs),
        related_neighbor_filter_ms: Math.round(relatedNeighborFilterMs),
        related_nickname_ms: 0,
        related_meetings_ms: 0,
        related_other_ms: Math.round(relatedOtherSocial),
        related_distinct_author_ids: 0,
        related_meetings_post_ids: 0,
      };
    }
    return empty;
  }

  const tSyncA = performance.now();
  const dbScannedCount = data.length;
  const rowsAfterPolicy = (data as unknown as Record<string, unknown>[]).filter((r) => {
    if (!isCommunityPostPubliclyVisible(r as never)) return false;
    const loc = r.location_id;
    if (!allLocations && (loc == null || String(loc).trim() === "")) return false;
    const uid = String(r.user_id ?? "");
    if (blockExclude.has(uid)) return false;
    if (neighborOnlySet && !neighborOnlySet.has(uid)) return false;
    return true;
  });
  let rows: Record<string, unknown>[];
  /** DB 창을 꽉 채웠으면 뒤에 행이 더 있을 수 있음(필터로 이번 페이지가 짧아도 다음 offset 필요) */
  let hasMore: boolean;
  if (effSort === "recommended") {
    const poolCap = 200;
    const rankedAll = rankByRecommended(rowsAfterPolicy, poolCap);
    const page = rankedAll.slice(offset, offset + pageSize);
    hasMore = offset + pageSize < rankedAll.length;
    rows = page;
  } else {
    hasMore = dbScannedCount === fetchCount;
    rows = rowsAfterPolicy.slice(0, pageSize);
  }

  const uids = [...new Set(rows.map((r) => String(r.user_id ?? "")).filter(Boolean))];
  const postIds = rows.map((r) => String(r.id));
  mainPostprocessMs = performance.now() - tSyncA;
  /**
   * `tenure_type` 은 `supabase/migrations/20260401120000_meetings_tenure_type.sql` 기준으로 고정.
   * 컬럼 미적용 DB에서의 2라운드 폴백은 RTT 낭비라 제거(운영 스키마가 마이그레이션을 따른다는 전제).
   */
  const meetingsPromise =
    postIds.length > 0
      ? (async () => {
          meetingsQueryRounds += 1;
          const t0 = performance.now();
          try {
            let rMeet = await sb
              .from("meetings")
              .select("id, post_id, meeting_date, tenure_type, cover_image_url, community_messenger_room_id")
              .in("post_id", postIds);
            if (rMeet.error && isMissingDbColumnError(rMeet.error, "community_messenger_room_id")) {
              const rMeetNarrow = await sb
                .from("meetings")
                .select("id, post_id, meeting_date, tenure_type, cover_image_url")
                .in("post_id", postIds);
              rMeet = rMeetNarrow as typeof rMeet;
            }
            return (rMeet.data as unknown[] | null) ?? null;
          } finally {
            if (collectPerf) relatedMeetingsMs = performance.now() - t0;
          }
        })()
      : Promise.resolve(null);
  const syncAfterMainMs = performance.now() - tSyncA;

  const nickPromise = (async () => {
    const t0 = performance.now();
    try {
      return await fetchNicknamesForUserIds(sb as never, uids, collectPerf ? nickMetrics : undefined);
    } finally {
      if (collectPerf) relatedNicknameMs = performance.now() - t0;
    }
  })();

  const tNick0 = performance.now();
  const [nickMap, meetings] = await Promise.all([nickPromise, meetingsPromise]);
  nickMeetMs = performance.now() - tNick0;

  const tSyncB = performance.now();
  const meetByPost = new Map<
    string,
    {
      id: string;
      meeting_date: string | null;
      tenure_type?: string | null;
      cover_image_url?: string | null;
      community_messenger_room_id?: string | null;
    }
  >();
  if (Array.isArray(meetings)) {
    for (const m of meetings as {
      id?: string;
      post_id?: string;
      meeting_date?: string | null;
      tenure_type?: string | null;
      cover_image_url?: string | null;
      community_messenger_room_id?: string | null;
    }[]) {
      const pid = String(m.post_id ?? "");
      if (pid && m.id) {
        const roomRaw = m.community_messenger_room_id;
        const roomId =
          roomRaw != null && String(roomRaw).trim() ? String(roomRaw).trim() : null;
        meetByPost.set(pid, {
          id: String(m.id),
          meeting_date: m.meeting_date ?? null,
          tenure_type: m.tenure_type ?? null,
          cover_image_url: m.cover_image_url != null && String(m.cover_image_url).trim() ? String(m.cover_image_url).trim() : null,
          community_messenger_room_id: roomId,
        });
      }
    }
  }

  const defaultSkin = normalizeCommunityFeedListSkin(undefined);
  const posts = rows.map((r) => {
    const uid = String(r.user_id ?? "");
    const locationLabel = String(r.region_label ?? "").trim();
    const enumCat = String(r.category ?? "etc").trim().toLowerCase() || "etc";
    const topicUiSlug = neighborhoodPostTopicUiSlug(r);
    let imgs = Array.isArray(r.images) ? (r.images as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const meet = meetByPost.get(String(r.id));
    if (imgs.length === 0 && meet?.cover_image_url) {
      imgs = [meet.cover_image_url];
    }
    const summaryRaw = r.summary != null ? String(r.summary) : "";
    const content = summaryRaw;
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
      summary: summaryRaw || summarize(content),
      location_id: String(r.location_id ?? (allLocations ? "" : lid)),
      location_label: locationLabel,
      images: imgs,
      view_count: Number(r.view_count ?? 0),
      like_count: Number(r.like_count ?? 0),
      comment_count: Number(r.comment_count ?? 0),
      created_at: String(r.created_at ?? ""),
      author_name: nickMap.get(uid) ?? (uid ? uid.slice(0, 8) : "익명"),
      author_id: uid,
      meeting_id: meet?.id ?? null,
      community_messenger_room_id: meet?.community_messenger_room_id ?? null,
      meeting_date:
        meet?.tenure_type === "long"
          ? null
          : meet?.meeting_date ?? (r.meetup_date != null ? String(r.meetup_date) : null),
    };
  });
  transformMs = syncAfterMainMs + (performance.now() - tSyncB);

  const main_query_where_summary = (() => {
    const parts = [`status.eq.${COMMUNITY_POST_FEED_STATUS_ACTIVE}`];
    if (allLocations) parts.push("scope=global");
    else parts.push("scope=location_id+not_null");
    if (filterCat) {
      if (filterCat === "meetup") parts.push("filter=category.eq.meetup");
      else if (useTopicSlug && normalizeNeighborhoodCategory(filterCat))
        parts.push(`filter=or(category.eq.${filterCat},topic_slug.eq.${filterCat})`);
      else if (useTopicSlug) parts.push(`filter=topic_slug.eq.${filterCat}`);
      else parts.push(`filter=category.eq.${filterCat}`);
    } else parts.push("filter=none");
    if (authorUserId) parts.push("user_id.eq");
    return parts.join(";");
  })();
  const r0 = rangeForPage?.[0] ?? offset;
  const r1 = rangeForPage?.[1] ?? offset + fetchCount - 1;
  const main_query_order_summary = (() => {
    const orderKey =
      effSort === "popular"
        ? "view_count.desc+created_at.desc+id.desc"
        : effSort === "recommended"
          ? "pool.200.created_at+rankByRecommended+slice"
          : "created_at.desc+id.desc";
    return `order=${orderKey};range=${r0}-${r1};window=${fetchCount};feedSort=${effSort};rankOffset=${effSort === "recommended" ? offset : 0}`;
  })();

  const maxSocialLeg = Math.max(relatedBlockedFilterMs, relatedNeighborFilterMs);
  const relatedOtherSocial = Math.max(0, socialPreflightMs - maxSocialLeg);
  const maxNickMeetLeg = Math.max(relatedNicknameMs, relatedMeetingsMs);
  const relatedOtherNickMeet = Math.max(0, nickMeetMs - maxNickMeetLeg);
  const relatedOtherMs = relatedOtherSocial + relatedOtherNickMeet;

  const mainTotalMs = mainPrepareMs + mainDbMs + mainPostprocessMs;

  const serverCommunityPerf: NeighborhoodFeedServerPerfMs | undefined = collectPerf
    ? {
        community_query_main_ms: Math.round(mainTotalMs),
        main_query_filter_prepare_ms: Math.round(mainPrepareMs),
        main_query_db_ms: Math.round(mainDbMs),
        main_query_postprocess_ms: Math.round(mainPostprocessMs),
        main_query_row_count: dbScannedCount,
        main_query_selected_columns_count: countCsvSelectColumns(effectiveSelectCols),
        main_query_select_columns: effectiveSelectCols,
        main_query_where_summary,
        main_query_order_summary,
        community_query_related_ms: Math.round(socialPreflightMs + nickMeetMs),
        community_result_transform_ms: Math.round(transformMs),
        main_query_rounds: mainRounds,
        post_return_count: posts.length,
        image_url_count_approx: posts.reduce((n, p) => n + (Array.isArray(p.images) ? p.images.length : 0), 0),
        nickname_query_rounds: nickMetrics.profileSelect + nickMetrics.testUsersSelect,
        meetings_query_rounds: meetingsQueryRounds,
        blocked_supabase_calls: blockedMetrics.supabaseSelectCalls,
        neighbor_follow_query: options.neighborOnly === true && v ? 1 : 0,
        related_blocked_filter_ms: Math.round(relatedBlockedFilterMs),
        related_neighbor_filter_ms: Math.round(relatedNeighborFilterMs),
        related_nickname_ms: Math.round(relatedNicknameMs),
        related_meetings_ms: Math.round(relatedMeetingsMs),
        related_other_ms: Math.round(relatedOtherMs),
        related_distinct_author_ids: uids.length,
        related_meetings_post_ids: postIds.length,
      }
    : undefined;

  const pagingOffsetAdvance = effSort === "recommended" ? posts.length : dbScannedCount;
  return { posts, hasMore, dbScannedCount, pagingOffsetAdvance, ...(serverCommunityPerf ? { serverCommunityPerf } : {}) };
}

/** `post_id`로 연결된 모임 id — 컬럼 세트가 옛 DB와 다를 때 단계적 select */
async function fetchMeetingLinkByPostId(
  sb: ReturnType<typeof getSupabaseServer>,
  postId: string
): Promise<{
  id: string;
  meeting_date: string | null;
  tenure: "short" | "long";
  cover_image_url?: string | null;
  community_messenger_room_id?: string | null;
} | null> {
  const trySelect = async (cols: string) =>
    sb.from("meetings").select(cols).eq("post_id", postId).maybeSingle();

  let { data, error } = await trySelect("id, meeting_date, tenure_type, cover_image_url, community_messenger_room_id");
  if (error && isMissingDbColumnError(error, "community_messenger_room_id")) {
    ({ data, error } = await trySelect("id, meeting_date, tenure_type, cover_image_url"));
  }
  if (error && isMissingDbColumnError(error, "tenure_type")) {
    ({ data, error } = await trySelect("id, meeting_date, cover_image_url"));
  }
  if (error && isMissingDbColumnError(error, "cover_image_url")) {
    ({ data, error } = await trySelect("id, meeting_date, tenure_type, community_messenger_room_id"));
    if (error && isMissingDbColumnError(error, "community_messenger_room_id")) {
      ({ data, error } = await trySelect("id, meeting_date, tenure_type"));
    }
    if (error && isMissingDbColumnError(error, "tenure_type")) {
      ({ data, error } = await trySelect("id, meeting_date"));
    }
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
  const cover =
    row.cover_image_url != null && String(row.cover_image_url).trim() ? String(row.cover_image_url).trim() : null;
  const messengerRoomId =
    row.community_messenger_room_id != null && String(row.community_messenger_room_id).trim()
      ? String(row.community_messenger_room_id).trim()
      : null;
  return { id, meeting_date, tenure, cover_image_url: cover, community_messenger_room_id: messengerRoomId };
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
    "id, user_id, title, content, summary, category, topic_slug, images, location_id, region_label, view_count, like_count, comment_count, created_at, meetup_date, is_question, is_meetup, meetup_place, is_deleted, is_hidden, status";
  const DETAIL_SELECT_FULL_NO_TOPIC_SLUG =
    "id, user_id, title, content, summary, category, images, location_id, region_label, view_count, like_count, comment_count, created_at, meetup_date, is_question, is_meetup, meetup_place, is_deleted, is_hidden, status";
  const DETAIL_SELECT_BASE =
    "id, user_id, title, content, summary, category, topic_slug, images, location_id, region_label, view_count, like_count, comment_count, created_at, meetup_date, is_deleted, is_hidden, status";
  const DETAIL_SELECT_BASE_NO_TOPIC_SLUG =
    "id, user_id, title, content, summary, category, images, location_id, region_label, view_count, like_count, comment_count, created_at, meetup_date, is_deleted, is_hidden, status";

  const fetchDetailRow = async (cols: string) => {
    let q = sb.from("community_posts").select(cols).eq("id", postId);
    if (v) {
      q = q.or(`status.eq.${COMMUNITY_POST_FEED_STATUS_ACTIVE},user_id.eq.${v}`);
    } else {
      q = q.eq("status", COMMUNITY_POST_FEED_STATUS_ACTIVE);
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
  let imgs = Array.isArray(row.images) ? (row.images as unknown[]).filter((x): x is string => typeof x === "string") : [];
  if (imgs.length === 0 && meetLink?.cover_image_url) {
    imgs = [meetLink.cover_image_url];
  }
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
    community_messenger_room_id: meetLink?.community_messenger_room_id ?? null,
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
  "id, post_id, title, description, location_text, meeting_date, tenure_type, max_members, created_by, host_user_id, join_policy, entry_policy, requires_approval, status, is_closed, joined_count, pending_count, banned_count, notice_count, last_notice_at, chat_room_id, community_messenger_room_id, password_hash, welcome_message, cover_image_url, region_text, category_text, platform_approval_required, platform_approval_status, allow_feed, allow_album_upload",
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
    community_messenger_room_id:
      row.community_messenger_room_id != null ? String(row.community_messenger_room_id) : null,
    welcome_message: row.welcome_message != null ? String(row.welcome_message) : null,
    cover_image_url: row.cover_image_url != null ? String(row.cover_image_url) : null,
    region_text: row.region_text != null ? String(row.region_text) : null,
    category_text: row.category_text != null ? String(row.category_text) : null,
    platform_approval_required: row.platform_approval_required !== false,
    platform_approval_status: (() => {
      if (row.platform_approval_status == null) return null;
      const s = String(row.platform_approval_status);
      if (s === "pending_approval" || s === "approved" || s === "rejected") return s;
      return null;
    })(),
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

export async function listMeetingMembers(
  meetingId: string,
  status: "joined" | "pending" = "joined"
): Promise<import("@/lib/neighborhood/types").MeetingMemberListItemDTO[]> {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return [];
  }

  const { data, error } = await sb
    .from("meeting_members")
    .select("user_id, status, role, created_at, requested_at")
    .eq("meeting_id", meetingId)
    .eq("status", status)
    .order(status === "pending" ? "requested_at" : "created_at", { ascending: true });
  if (error || !Array.isArray(data)) return [];

  const rows = data as Array<{
    user_id?: unknown;
    status?: unknown;
    role?: unknown;
    created_at?: unknown;
    requested_at?: unknown;
  }>;
  const userIds = [...new Set(rows.map((row) => String(row.user_id ?? "").trim()).filter(Boolean))];
  const nickMap = await fetchNicknamesForUserIds(sb as never, userIds);

  const requestMessageMap = new Map<string, string>();
  if (status === "pending" && userIds.length > 0) {
    const { data: requests } = await sb
      .from("meeting_join_requests")
      .select("user_id, request_message, requested_at")
      .eq("meeting_id", meetingId)
      .eq("status", "pending")
      .in("user_id", userIds)
      .order("requested_at", { ascending: false });
    for (const row of (requests ?? []) as Array<{ user_id?: unknown; request_message?: unknown }>) {
      const userId = String(row.user_id ?? "").trim();
      if (!userId || requestMessageMap.has(userId)) continue;
      requestMessageMap.set(userId, typeof row.request_message === "string" ? row.request_message.trim() : "");
    }
  }

  return rows.map((row) => {
    const userId = String(row.user_id ?? "").trim();
    const roleRaw = String(row.role ?? "member").trim();
    const resolvedRole =
      roleRaw === "host" || roleRaw === "co_host" || roleRaw === "member" ? roleRaw : "member";
    const statusRaw = String(row.status ?? status).trim();
    const resolvedStatus =
      statusRaw === "joined" ||
      statusRaw === "pending" ||
      statusRaw === "left" ||
      statusRaw === "kicked" ||
      statusRaw === "banned" ||
      statusRaw === "rejected"
        ? statusRaw
        : status;
    return {
      userId,
      name: nickMap.get(userId) ?? (userId ? userId.slice(0, 8) : "알 수 없음"),
      role: resolvedRole,
      status: resolvedStatus,
      joinedAt:
        typeof row.requested_at === "string"
          ? row.requested_at
          : typeof row.created_at === "string"
            ? row.created_at
            : null,
      requestMessage: requestMessageMap.get(userId) ?? null,
    };
  });
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
