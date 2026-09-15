/** 커뮤니티 활동 허브 — `/api/me/community-activity` · RSC loader 공통 타입 */

export type CommunityActivityCommentItem = {
  id: string;
  postId: string;
  postTitle: string;
  regionLabel: string | null;
  content: string;
  createdAt: string;
};

export type CommunityActivityReactionItem = {
  id: string;
  postId: string;
  title: string;
  regionLabel: string | null;
  createdAt: string;
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
