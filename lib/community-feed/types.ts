import type { CommunityFeedListSkin } from "@/lib/community-feed/topic-feed-skin";

export type CommunitySectionDTO = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
};

/** 관리자 목록용 — 비활성 섹션 포함 */
export type CommunitySectionAdminRow = CommunitySectionDTO & {
  is_active: boolean;
};

export type CommunityTopicDTO = {
  id: string;
  section_id: string;
  name: string;
  slug: string;
  color: string | null;
  icon: string | null;
  sort_order: number;
  is_visible: boolean;
  is_feed_sort: boolean;
  /**
   * `is_feed_sort` 일 때만: `popular` = 조회수 정렬, `recommended` = 추천 랭킹(·URL sort와 하위정렬).
   * null/미설정·레거시는 slug(인기/추천)로 `resolveTopicFeedSortMode` 가 보강.
   */
  feed_sort_mode: "popular" | "recommended" | null;
  allow_question: boolean;
  allow_meetup: boolean;
  /** 피드 목록 카드 레이아웃 */
  feed_list_skin: CommunityFeedListSkin;
};

export type CommunityFeedPostDTO = {
  id: string;
  section_slug: string;
  topic_slug: string;
  topic_name: string;
  topic_color: string | null;
  /** 주제에 설정된 목록 카드 스킨 */
  feed_list_skin: CommunityFeedListSkin;
  title: string;
  content: string;
  summary: string | null;
  region_label: string;
  is_question: boolean;
  is_meetup: boolean;
  meetup_date: string | null;
  meetup_place: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  created_at: string;
  author_name: string;
  thumbnail_url: string | null;
};

export type CommunityPostDetailDTO = CommunityFeedPostDTO & {
  author_id: string;
  images: { id: string; url: string | null; sort_order: number }[];
};

export type CommunityCommentDTO = {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  author_name: string;
};
