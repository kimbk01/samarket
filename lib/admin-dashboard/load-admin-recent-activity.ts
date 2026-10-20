/**
 * 관리자 「최근 활동」 목록 (상품·회원·신고·채팅·후기 최신 5건) — `/api/admin/stats/dashboard` 와
 * 통합 대시보드(`/api/admin/dashboard/overview?parts=recent`)가 같은 질의를 쓴다.
 * 질의 실패는 해당 목록을 비우고 `errors` 에 남긴다 (호출자가 표시 여부를 정한다).
 */
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { ADMIN_DASHBOARD_REPORT_REASON_LABELS } from "@/lib/admin-dashboard/report-reason-labels";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";
import type {
  RecentChat,
  RecentProduct,
  RecentReport,
  RecentReview,
  RecentUser,
} from "@/lib/types/admin-dashboard";

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST builder chain */

export type AdminRecentActivityLists = {
  recentProducts: RecentProduct[];
  recentUsers: RecentUser[];
  recentReports: RecentReport[];
  recentChats: RecentChat[];
  recentReviews: RecentReview[];
  errors: string[];
};

async function mapNicknamesFromProfiles(sbAny: any, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data } = await sbAny
    .from("profiles")
    .select("id, display_name, nickname, username")
    .in("id", ids);
  for (const u of (data ?? []) as {
    id: string;
    display_name?: string | null;
    nickname?: string | null;
    username?: string | null;
  }[]) {
    const id = String(u.id ?? "");
    const base = (u.display_name ?? u.nickname ?? "").trim();
    const uname = (u.username ?? "").trim();
    const label = labelFromDisplayAndUsername(base || null, uname || null) || base || uname || id;
    map.set(id, label);
  }
  return map;
}

function dedupeNonEmptyIds(ids: Iterable<unknown>): string[] {
  const out = new Set<string>();
  for (const raw of ids) {
    const s = String(raw ?? "").trim();
    if (s) out.add(s);
  }
  return [...out];
}

export async function loadAdminRecentActivityLists(sbAny: any, nowIso: string): Promise<AdminRecentActivityLists> {
  const RECENT_LIMIT = 5;

  const toReportPanelStatus = (s: string): RecentReport["status"] => {
    if (s === "rejected") return "rejected";
    if (s === "pending" || s === "reviewing") return "pending";
    return "reviewed";
  };

  const [postsRes, usersRes, reportsRes, roomsRes, reviewsRes] = await Promise.all([
    sbAny
      .from(POSTS_TABLE_READ)
      .select("id, title, status, user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
    sbAny
      .from("profiles")
      .select("id, display_name, nickname, username, role, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
    sbAny
      .from("reports")
      .select("id, target_type, reason_code, status, created_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
    sbAny
      .from("product_chats")
      .select("id, post_id, seller_id, buyer_id, last_message_at, last_message_preview, created_at")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(RECENT_LIMIT),
    sbAny
      .from("transaction_reviews")
      .select("id, reviewer_id, reviewee_id, public_review_type, created_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
  ]);

  const errors = [
    postsRes.error ? `posts:${postsRes.error.message ?? "query_failed"}` : null,
    usersRes.error ? `profiles:${usersRes.error.message ?? "query_failed"}` : null,
    reportsRes.error ? `reports:${reportsRes.error.message ?? "query_failed"}` : null,
    roomsRes.error ? `product_chats:${roomsRes.error.message ?? "query_failed"}` : null,
    reviewsRes.error ? `transaction_reviews:${reviewsRes.error.message ?? "query_failed"}` : null,
  ].filter((e): e is string => e !== null);

  const posts = !postsRes.error && Array.isArray(postsRes.data) ? (postsRes.data as any[]) : [];
  const users = !usersRes.error && Array.isArray(usersRes.data) ? (usersRes.data as Record<string, unknown>[]) : [];
  const reportRows = !reportsRes.error && Array.isArray(reportsRes.data) ? (reportsRes.data as any[]) : [];
  const rooms = !roomsRes.error && Array.isArray(roomsRes.data) ? (roomsRes.data as any[]) : [];
  const reviewRows = !reviewsRes.error && Array.isArray(reviewsRes.data) ? (reviewsRes.data as any[]) : [];

  const postIdsForChatTitles = dedupeNonEmptyIds(rooms.map((r) => r.post_id));
  const nicknameSourceIds = dedupeNonEmptyIds([
    ...posts.map((p) => p.user_id),
    ...rooms.flatMap((r) => [r.seller_id, r.buyer_id]),
    ...reviewRows.flatMap((r) => [r.reviewer_id, r.reviewee_id]),
  ]);

  const [postTitlesRes, nicknameById] = await Promise.all([
    postIdsForChatTitles.length
      ? sbAny.from(POSTS_TABLE_READ).select("id, title").in("id", postIdsForChatTitles)
      : Promise.resolve({ data: [] as { id?: string; title?: string | null }[] }),
    mapNicknamesFromProfiles(sbAny, nicknameSourceIds),
  ]);

  const postTitleRows = (postTitlesRes.data ?? []) as { id?: string; title?: string | null }[];
  const postTitleById = new Map<string, string>(
    postTitleRows.map((p) => [String(p.id ?? ""), String(p.title ?? "")])
  );

  const recentProducts: RecentProduct[] = posts.map((p: any) => ({
    id: p.id,
    title: p.title ?? "",
    sellerNickname: (nicknameById.get(String(p.user_id ?? "")) ?? String(p.user_id ?? "").slice(0, 8)) || "-",
    status: p.status ?? "active",
    createdAt: p.created_at,
  }));

  const recentUsers: RecentUser[] = users.map((u) => {
    const role = String(u.role ?? "");
    const memberType: RecentUser["memberType"] =
      role === "admin" || role === "master" || role === "super_admin"
        ? "admin"
        : role === "special" || role === "premium"
          ? "premium"
          : "normal";
    const id = String(u.id ?? "");
    const displayName = typeof u.display_name === "string" ? u.display_name : null;
    const legacy = typeof u.nickname === "string" ? u.nickname : null;
    const uname = typeof u.username === "string" ? u.username : null;
    const nickname =
      labelFromDisplayAndUsername(displayName ?? legacy, uname) ||
      String(displayName ?? legacy ?? uname ?? id).trim() ||
      id.slice(0, 8);
    const joinedAt =
      (typeof u.created_at === "string" && u.created_at) ||
      (typeof u.updated_at === "string" && u.updated_at) ||
      nowIso;
    return {
      id,
      nickname,
      memberType,
      joinedAt,
    };
  });

  const toTargetType = (t: string): RecentReport["targetType"] => {
    if (t === "product" || t === "user") return t;
    if (t === "chat_room" || t === "chat_message") return "chat";
    return "product";
  };

  const recentReports: RecentReport[] = reportRows.map((r: any) => ({
    id: r.id,
    targetType: toTargetType(r.target_type ?? ""),
    reasonLabel: ADMIN_DASHBOARD_REPORT_REASON_LABELS[r.reason_code] ?? r.reason_code ?? "-",
    status: toReportPanelStatus(r.status ?? "pending"),
    createdAt: r.created_at,
  }));

  const recentChats: RecentChat[] = rooms.map((r: any) => ({
    id: r.id,
    productTitle: postTitleById.get(String(r.post_id ?? "")) || "(제목 없음)",
    buyerNickname: nicknameById.get(String(r.buyer_id ?? "")) ?? String(r.buyer_id ?? "").slice(0, 8),
    sellerNickname: nicknameById.get(String(r.seller_id ?? "")) ?? String(r.seller_id ?? "").slice(0, 8),
    lastMessageAt: r.last_message_at ?? r.created_at,
  }));

  const toRating = (t: string): number => {
    if (t === "good") return 5;
    if (t === "bad") return 1;
    return 3;
  };

  const recentReviews: RecentReview[] = reviewRows.map((r: any) => ({
    id: r.id,
    reviewerNickname: nicknameById.get(String(r.reviewer_id ?? "")) ?? String(r.reviewer_id ?? "").slice(0, 8),
    targetNickname: nicknameById.get(String(r.reviewee_id ?? "")) ?? String(r.reviewee_id ?? "").slice(0, 8),
    rating: toRating(r.public_review_type ?? ""),
    createdAt: r.created_at,
  }));

  return { recentProducts, recentUsers, recentReports, recentChats, recentReviews, errors };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
