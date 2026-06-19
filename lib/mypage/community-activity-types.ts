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
  reactions: CommunityActivityReactionItem[];
  reports: CommunityActivityReportItem[];
  source: "db" | "fallback";
};

export type CommunityActivityHubTabId = "comments" | "reactions" | "reports";
