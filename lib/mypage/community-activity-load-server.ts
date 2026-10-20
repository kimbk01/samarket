import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type {
  CommunityActivityCommentItem,
  CommunityActivityHubData,
  CommunityActivityHubTabId,
  CommunityActivityReactionItem,
  CommunityActivityReportItem,
} from "@/lib/mypage/community-activity-types";
import {
  mypageKeysetOrFilter,
  paginateMypageRowsDesc,
  sliceMypageKeysetPage,
  type MypageListCursor,
} from "@/lib/mypage/mypage-list-cursor";
import { formatCommunityPublicRegionLabel } from "@/lib/addresses/community-public-region-label";

function isMissingTableError(message: string, table: string): boolean {
  const lowered = message.toLowerCase();
  return lowered.includes(table.toLowerCase()) && lowered.includes("does not exist");
}

const EMPTY: CommunityActivityHubData = {
  comments: [],
  likedPosts: [],
  savedPosts: [],
  reactions: [],
  reports: [],
  source: "fallback",
};

function mapPostEngagementRows(
  rows: Record<string, unknown>[],
  postMap: Map<string, Record<string, unknown>>,
  deletedTitle: string
) {
  return rows.map((row) => {
    const postId = String(row.post_id ?? "").trim();
    const post = postMap.get(postId);
    return {
      id: postId,
      postId,
      title: typeof post?.title === "string" ? post.title : deletedTitle,
      regionLabel:
        typeof post?.region_label === "string"
          ? formatCommunityPublicRegionLabel({ regionLabel: post.region_label })
          : null,
      createdAt: String(row.created_at ?? ""),
    };
  });
}

/** RSC · API 공통 — 사용자 커뮤니티 댓글·공감·저장·신고 활동 (likes/saves 분리) */
export async function loadCommunityActivityHubServer(
  userId: string
): Promise<CommunityActivityHubData> {
  const uid = userId.trim();
  if (!uid) return EMPTY;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return EMPTY;

  const [commentsRes, savesRes, likesRes, reportsRes, messengerReportsRes] = await Promise.all([
    sb
      .from("community_comments")
      .select("id, post_id, content, created_at")
      .eq("user_id", uid)
      // 삭제·숨김 처리된 댓글은 내 활동에 보이지 않게 (D12)
      .not("is_deleted", "is", true)
      .not("is_hidden", "is", true)
      .order("created_at", { ascending: false })
      .limit(20),
    sb
      .from("community_post_saves")
      .select("post_id, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(20),
    sb
      .from("community_post_likes")
      .select("post_id, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(20),
    sb
      .from("community_reports")
      // Production: reporter=`user_id`, reason text=`reason` (no reporter_id/reason_type).
      .select("id, target_type, target_id, reason, status, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(20),
    sb
      .from("community_messenger_reports")
      .select("id, report_type, room_id, message_id, reported_user_id, reason_type, status, created_at")
      .eq("reporter_user_id", uid)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (commentsRes.error && !isMissingTableError(commentsRes.error.message ?? "", "community_comments")) {
    throw new Error(commentsRes.error.message ?? "comments_fetch_failed");
  }
  if (likesRes.error && !isMissingTableError(likesRes.error.message ?? "", "community_post_likes")) {
    throw new Error(likesRes.error.message ?? "likes_fetch_failed");
  }
  if (savesRes.error && !isMissingTableError(savesRes.error.message ?? "", "community_post_saves")) {
    throw new Error(savesRes.error.message ?? "saves_fetch_failed");
  }
  if (reportsRes.error && !isMissingTableError(reportsRes.error.message ?? "", "community_reports")) {
    throw new Error(reportsRes.error.message ?? "reports_fetch_failed");
  }
  if (
    messengerReportsRes.error &&
    !isMissingTableError(messengerReportsRes.error.message ?? "", "community_messenger_reports")
  ) {
    throw new Error(messengerReportsRes.error.message ?? "messenger_reports_fetch_failed");
  }

  const commentRows = Array.isArray(commentsRes.data) ? (commentsRes.data as Record<string, unknown>[]) : [];
  const saveRows = Array.isArray(savesRes.data) ? (savesRes.data as Record<string, unknown>[]) : [];
  const likeRows = Array.isArray(likesRes.data) ? (likesRes.data as Record<string, unknown>[]) : [];
  const reportRows = Array.isArray(reportsRes.data) ? (reportsRes.data as Record<string, unknown>[]) : [];
  const messengerReportRows = Array.isArray(messengerReportsRes.data)
    ? (messengerReportsRes.data as Record<string, unknown>[])
    : [];

  const postIds = Array.from(
    new Set(
      [
        ...commentRows.map((row) => String(row.post_id ?? "").trim()),
        ...saveRows.map((row) => String(row.post_id ?? "").trim()),
        ...likeRows.map((row) => String(row.post_id ?? "").trim()),
        ...reportRows
          .filter((row) => String(row.target_type ?? "") === "post")
          .map((row) => String(row.target_id ?? "").trim()),
      ].filter(Boolean)
    )
  );

  const postMap = new Map<string, Record<string, unknown>>();
  if (postIds.length > 0) {
    const { data: posts } = await sb
      .from("community_posts")
      .select("id, title, region_label")
      .in("id", postIds);
    for (const row of (posts ?? []) as Record<string, unknown>[]) {
      const id = String(row.id ?? "").trim();
      if (id) postMap.set(id, row);
    }
  }

  /** 글이 없거나(삭제) 숨김이면 빈 제목 — 화면이 회원 언어로 안내 문구를 붙인다 (D12, 서버 한국어 하드코딩 제거) */
  const deletedTitle = "";
  const likedPosts = mapPostEngagementRows(likeRows, postMap, deletedTitle);
  const savedPosts = mapPostEngagementRows(saveRows, postMap, deletedTitle);

  return {
    comments: commentRows.map((row) => {
      const postId = String(row.post_id ?? "").trim();
      const post = postMap.get(postId);
      return {
        id: String(row.id ?? ""),
        postId,
        postTitle: typeof post?.title === "string" ? post.title : deletedTitle,
        regionLabel:
          typeof post?.region_label === "string"
            ? formatCommunityPublicRegionLabel({ regionLabel: post.region_label })
            : null,
        content: String(row.content ?? ""),
        createdAt: String(row.created_at ?? ""),
      };
    }),
    likedPosts,
    savedPosts,
    /** likes only — never saves-or-likes replacement */
    reactions: likedPosts,
    reports: [
      ...reportRows.map((row) => {
        const targetType = String(row.target_type ?? "").trim() || "post";
        const targetId = String(row.target_id ?? "").trim();
        const post = targetType === "post" ? postMap.get(targetId) : null;
        return {
          id: String(row.id ?? ""),
          channel: "community" as const,
          targetType,
          targetId,
          title: typeof post?.title === "string" ? post.title : "",
          reasonType: String(row.reason ?? row.reason_type ?? "etc"),
          status: String(row.status ?? "open"),
          createdAt: String(row.created_at ?? ""),
        };
      }),
      ...messengerReportRows.map((row) => ({
        id: String(row.id ?? ""),
        channel: "messenger" as const,
        targetType: String(row.report_type ?? "room"),
        targetId:
          String(row.room_id ?? "").trim() ||
          String(row.message_id ?? "").trim() ||
          String(row.reported_user_id ?? "").trim(),
        title: "",
        reasonType: String(row.reason_type ?? "etc"),
        status: String(row.status ?? "received"),
        createdAt: String(row.created_at ?? ""),
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    source: "db",
  };
}

/* ------------------------------------------------------------------------------------------------
 * 탭 모드 (최종 설계 C.0.3 A5 · S27) — `GET /api/me/community-activity?tab=&limit=20&cursor=<created_at|id>`.
 * 활성 탭 테이블만 읽는다(무 `tab` 5종 묶음 응답·`loadCommunityActivityHubServer` 는 불변).
 * 신고 탭은 `community_reports` + `community_messenger_reports` 를 같은 커서로 각각 limit+1 읽고 병합 정렬.
 * 조회 실패는 throw(라우트 500) — 빈 목록 금지.
 * ---------------------------------------------------------------------------------------------- */

export type CommunityActivityTabPage =
  | { tab: "comments"; items: CommunityActivityCommentItem[]; next_cursor: string | null }
  | { tab: "reactions" | "saved"; items: CommunityActivityReactionItem[]; next_cursor: string | null }
  | { tab: "reports"; items: CommunityActivityReportItem[]; next_cursor: string | null };

type KeysetRows = { data: Record<string, unknown>[] | null; error: { message?: string } | null };

/** `created_at desc, id desc` + `limit+1` + 커서 조건 — PostgREST 빌더(테이블별 타입이 달라 최소 인터페이스로 받음) */
type KeysetBuilder = {
  order: (column: string, opts: { ascending: boolean }) => KeysetBuilder;
  limit: (n: number) => KeysetBuilder;
  or: (filter: string) => KeysetBuilder;
} & PromiseLike<KeysetRows>;

function keysetQuery(q: unknown, cursor: MypageListCursor | null, limit: number): PromiseLike<KeysetRows> {
  let out = (q as KeysetBuilder).order("created_at", { ascending: false }).order("id", { ascending: false });
  out = out.limit(limit + 1);
  if (cursor) out = out.or(mypageKeysetOrFilter(cursor, "created_at"));
  return out;
}

async function loadPostMetaMap(
  sb: NonNullable<ReturnType<typeof tryCreateSupabaseServiceClient>>,
  postIds: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  const ids = [...new Set(postIds.filter(Boolean))];
  if (!ids.length) return map;
  const { data, error } = await sb
    .from("community_posts")
    .select("id, title, region_label, status, is_hidden, is_deleted")
    .in("id", ids);
  if (error) throw new Error(error.message ?? "posts_fetch_failed");
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const id = String(row.id ?? "").trim();
    if (id) map.set(id, row);
  }
  return map;
}

/** 볼 수 없는 글(삭제·숨김·없음) — 제목 비움 + `postVisible:false` (화면은 「볼 수 없는 글」·탭 비활성) */
function postVisibleFor(post: Record<string, unknown> | undefined): boolean {
  if (!post) return false;
  if (post.is_deleted === true || post.is_hidden === true) return false;
  const s = String(post.status ?? "").trim().toLowerCase();
  return !s || s === "active";
}

export async function loadCommunityActivityTabPageServer(
  userId: string,
  opts: { tab: CommunityActivityHubTabId; limit: number; cursor: MypageListCursor | null }
): Promise<CommunityActivityTabPage> {
  const uid = userId.trim();
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) throw new Error("supabase_unavailable");
  const { tab, limit, cursor } = opts;

  if (tab === "comments") {
    const res = await keysetQuery(
      sb
        .from("community_comments")
        .select("id, post_id, content, created_at")
        .eq("user_id", uid)
        .not("is_deleted", "is", true)
        .not("is_hidden", "is", true),
      cursor,
      limit
    );
    const { data, error } = res;
    if (error && !isMissingTableError(error.message ?? "", "community_comments")) {
      throw new Error(error.message ?? "comments_fetch_failed");
    }
    const page = sliceMypageKeysetPage(data ?? [], limit, (r) => String(r.created_at ?? ""), (r) => String(r.id ?? ""));
    const postMap = await loadPostMetaMap(sb, page.items.map((r) => String(r.post_id ?? "").trim()));
    return {
      tab,
      next_cursor: page.next_cursor,
      items: page.items.map((row) => {
        const postId = String(row.post_id ?? "").trim();
        const post = postMap.get(postId);
        const visible = postVisibleFor(post);
        return {
          id: String(row.id ?? ""),
          postId,
          postTitle: visible && typeof post?.title === "string" ? post.title : "",
          regionLabel:
            visible && typeof post?.region_label === "string"
              ? formatCommunityPublicRegionLabel({ regionLabel: post.region_label })
              : null,
          content: String(row.content ?? ""),
          createdAt: String(row.created_at ?? ""),
          postVisible: visible,
        };
      }),
    };
  }

  if (tab === "reactions" || tab === "saved") {
    const table = tab === "reactions" ? "community_post_likes" : "community_post_saves";
    const res = await keysetQuery(
      sb.from(table).select("id, post_id, created_at").eq("user_id", uid),
      cursor,
      limit
    );
    const { data, error } = res;
    if (error && !isMissingTableError(error.message ?? "", table)) {
      throw new Error(error.message ?? `${table}_fetch_failed`);
    }
    const page = sliceMypageKeysetPage(data ?? [], limit, (r) => String(r.created_at ?? ""), (r) => String(r.id ?? ""));
    const postMap = await loadPostMetaMap(sb, page.items.map((r) => String(r.post_id ?? "").trim()));
    return {
      tab,
      next_cursor: page.next_cursor,
      items: page.items.map((row) => {
        const postId = String(row.post_id ?? "").trim();
        const post = postMap.get(postId);
        const visible = postVisibleFor(post);
        return {
          id: postId,
          postId,
          title: visible && typeof post?.title === "string" ? post.title : "",
          regionLabel:
            visible && typeof post?.region_label === "string"
              ? formatCommunityPublicRegionLabel({ regionLabel: post.region_label })
              : null,
          createdAt: String(row.created_at ?? ""),
          postVisible: visible,
        };
      }),
    };
  }

  // reports — 두 테이블 병합
  const [cRes, mRes] = await Promise.all([
    keysetQuery(
      sb.from("community_reports").select("id, target_type, target_id, reason, status, created_at").eq("user_id", uid),
      cursor,
      limit
    ),
    keysetQuery(
      sb
        .from("community_messenger_reports")
        .select("id, report_type, room_id, message_id, reported_user_id, reason_type, status, created_at")
        .eq("reporter_user_id", uid),
      cursor,
      limit
    ),
  ]);
  const c = cRes;
  const m = mRes;
  if (c.error && !isMissingTableError(c.error.message ?? "", "community_reports")) {
    throw new Error(c.error.message ?? "reports_fetch_failed");
  }
  if (m.error && !isMissingTableError(m.error.message ?? "", "community_messenger_reports")) {
    throw new Error(m.error.message ?? "messenger_reports_fetch_failed");
  }
  const communityRows = c.error ? [] : (c.data ?? []);
  const messengerRows = m.error ? [] : (m.data ?? []);
  const postMap = await loadPostMetaMap(
    sb,
    communityRows
      .filter((row) => String(row.target_type ?? "") === "post")
      .map((row) => String(row.target_id ?? "").trim())
  );
  const merged: CommunityActivityReportItem[] = [
    ...communityRows.map((row) => {
      const targetType = String(row.target_type ?? "").trim() || "post";
      const targetId = String(row.target_id ?? "").trim();
      const post = targetType === "post" ? postMap.get(targetId) : undefined;
      return {
        id: String(row.id ?? ""),
        channel: "community" as const,
        targetType,
        targetId,
        title: postVisibleFor(post) && typeof post?.title === "string" ? post.title : "",
        reasonType: String(row.reason ?? row.reason_type ?? "etc"),
        status: String(row.status ?? "open"),
        createdAt: String(row.created_at ?? ""),
      };
    }),
    ...messengerRows.map((row) => ({
      id: String(row.id ?? ""),
      channel: "messenger" as const,
      targetType: String(row.report_type ?? "room"),
      targetId:
        String(row.room_id ?? "").trim() ||
        String(row.message_id ?? "").trim() ||
        String(row.reported_user_id ?? "").trim(),
      title: "",
      reasonType: String(row.reason_type ?? "etc"),
      status: String(row.status ?? "received"),
      createdAt: String(row.created_at ?? ""),
    })),
  ];
  const page = paginateMypageRowsDesc(merged, (r) => r.createdAt, (r) => r.id, null, limit);
  return { tab, items: page.items, next_cursor: page.next_cursor };
}
