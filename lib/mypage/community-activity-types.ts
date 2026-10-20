/** 커뮤니티 활동 허브 — `/api/me/community-activity` · RSC loader 공통 타입 */

export type CommunityActivityCommentItem = {
  id: string;
  postId: string;
  postTitle: string;
  regionLabel: string | null;
  content: string;
  createdAt: string;
  /** 탭 모드(A5)만 — 원글을 볼 수 있는지(삭제·숨김이면 false → 「볼 수 없는 글」, 탭 비활성) */
  postVisible?: boolean;
};

export type CommunityActivityReactionItem = {
  id: string;
  postId: string;
  title: string;
  regionLabel: string | null;
  createdAt: string;
  /** 탭 모드(A5)만 — 원글을 볼 수 있는지 */
  postVisible?: boolean;
};

export type CommunityActivityReportItem = {
  id: string;
  channel: "community" | "messenger";
  targetType: string;
  targetId: string;
  title: string;
  reasonType: string;
  status: string;
  createdAt: string;
};

export type CommunityActivityHubData = {
  comments: CommunityActivityCommentItem[];
  /** 공감한 글 — community_post_likes only */
  likedPosts: CommunityActivityReactionItem[];
  /** 저장한 글 — community_post_saves only */
  savedPosts: CommunityActivityReactionItem[];
  /**
   * Compatibility alias for hub tab: likes only (never saves-or-likes).
   * Prefer `likedPosts` for new consumers.
   */
  reactions: CommunityActivityReactionItem[];
  reports: CommunityActivityReportItem[];
  source: "db" | "fallback";
};

export type CommunityActivityHubTabId = "comments" | "reactions" | "saved" | "reports";

export const COMMUNITY_ACTIVITY_HUB_TABS: readonly CommunityActivityHubTabId[] = [
  "comments",
  "reactions",
  "saved",
  "reports",
];

export function parseCommunityActivityHubTab(raw: string | null | undefined): CommunityActivityHubTabId | null {
  return raw === "comments" || raw === "reactions" || raw === "saved" || raw === "reports" ? raw : null;
}

/** 신고 처리 상태 → 4단계 라벨(접수·검토중·처리완료·반려). community: open/reviewing/resolved/dismissed, messenger: received/reviewing/resolved/rejected/sanctioned */
export type CommunityReportStatusStage = "received" | "reviewing" | "resolved" | "rejected";

export function communityReportStatusStage(status: string | null | undefined): CommunityReportStatusStage {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "reviewing") return "reviewing";
  if (s === "resolved" || s === "sanctioned") return "resolved";
  if (s === "dismissed" || s === "rejected") return "rejected";
  return "received";
}
