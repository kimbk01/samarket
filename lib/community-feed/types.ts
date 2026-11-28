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
  /** UI en 표시명 (어드민) */
  name_en?: string | null;
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
  /** 피드 목록 카드 레이아웃 */
  feed_list_skin: CommunityFeedListSkin;
};

export type CommunityFeedPostDTO = {
  id: string;
  section_slug: string;
  topic_slug: string;
  topic_name: string;
  topic_name_en?: string | null;
  topic_color: string | null;
  /** 주제에 설정된 목록 카드 스킨 */
  feed_list_skin: CommunityFeedListSkin;
  title: string;
  content: string;
  summary: string | null;
  region_label: string;
  is_question: boolean;
  view_count: number;
  like_count: number;
  comment_count: number;
  created_at: string;
  author_name: string;
  thumbnail_url: string | null;
  /** member | admin | imported — default member when column absent */
  origin_kind?: import("@/lib/community/community-post-origin").CommunityPostOriginKind;
};

export type CommunityPostDetailDTO = CommunityFeedPostDTO & {
  author_id: string;
  images: { id: string; url: string | null; sort_order: number }[];
  author_avatar_url?: string | null;
};

/**
 * 댓글 표시 상태 — 서버 단일 판정 (라운지 댓글 SSOT `docs/audit/lounge-comments-2026-11-28/lounge-comments-audit-design.md` §6.2).
 * 화면은 이 값만 보고 그린다. 본문 글자로 상태를 추측하지 않는다.
 */
export type CommunityCommentDisplayState =
  | "visible"
  | "deleted_by_author"
  | "removed_by_admin"
  | "blocked_author"
  | "unavailable";

export type CommunityCommentDTO = {
  id: string;
  post_id: string;
  /** `visible` 이 아니면 빈 값 */
  user_id: string;
  parent_id: string | null;
  /** `visible` 이 아니면 빈 값 */
  content: string;
  created_at: string;
  /** `visible` 이 아니면 빈 값 · 닉네임이 없으면 빈 값(화면이 「익명」) */
  author_name: string;
  author_avatar_url: string | null;
  /** 글 작성자의 댓글인가 (`visible` 일 때만 true) */
  is_post_author: boolean;
  like_count: number;
  /** 로그인 시: 현재 보는 사람이 눌렀는지 (비로그인/조회 전은 false) */
  liked_by_viewer: boolean;
  updated_at: string;
  /** 작성자가 본문을 고쳤는가 (`edited_at`) — 관리자 처리와 무관 */
  is_edited: boolean;
  /** 글 작성자가 고정한 댓글 (`visible` 일 때만 true) */
  is_pinned: boolean;
  display_state: CommunityCommentDisplayState;
};
