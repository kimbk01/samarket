import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { CommunityActivityHubData } from "@/lib/mypage/community-activity-types";

function isMissingTableError(message: string, table: string): boolean {
  const lowered = message.toLowerCase();
  return lowered.includes(table.toLowerCase()) && lowered.includes("does not exist");
}

const EMPTY: CommunityActivityHubData = {
  comments: [],
  reactions: [],
  reports: [],
  source: "fallback",
};

/** RSC · API 공통 — 사용자 커뮤니티 댓글·반응·신고 활동 */
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
      .select("id, target_type, target_id, reason_type, status, created_at")
      .eq("reporter_id", uid)
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

  const deletedTitle = "삭제되었거나 숨김 처리된 글";

  return {
    comments: commentRows.map((row) => {
      const postId = String(row.post_id ?? "").trim();
      const post = postMap.get(postId);
      return {
        id: String(row.id ?? ""),
        postId,
        postTitle: typeof post?.title === "string" ? post.title : deletedTitle,
        regionLabel: typeof post?.region_label === "string" ? post.region_label : null,
        content: String(row.content ?? ""),
        createdAt: String(row.created_at ?? ""),
      };
    }),
    reactions: (saveRows.length > 0 ? saveRows : likeRows).map((row) => {
      const postId = String(row.post_id ?? "").trim();
      const post = postMap.get(postId);
      return {
        id: postId,
        postId,
        title: typeof post?.title === "string" ? post.title : deletedTitle,
        regionLabel: typeof post?.region_label === "string" ? post.region_label : null,
        createdAt: String(row.created_at ?? ""),
      };
    }),
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
          title:
            typeof post?.title === "string"
              ? post.title
              : targetType === "comment"
                ? "커뮤니티 댓글 신고"
                : "커뮤니티 신고",
          reasonType: String(row.reason_type ?? "etc"),
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
        title: "메신저 신고",
        reasonType: String(row.reason_type ?? "etc"),
        status: String(row.status ?? "received"),
        createdAt: String(row.created_at ?? ""),
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    source: "db",
  };
}
