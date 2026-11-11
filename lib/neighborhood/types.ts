import type { CommunityFeedListSkin } from "@/lib/community-feed/topic-feed-skin";

export type NeighborhoodFeedPostDTO = {
  id: string;
  /** 운영팀 공지 (노출 기간 중) — 피드 상단·「공지」 배지 (§F-5-2) */
  is_notice?: boolean;
  /** 관리자 상단 고정 (현재 보는 피드 범위 기준) — 피드 상단·「고정」 배지 */
  is_pinned?: boolean;
  /** `community_topics.slug` 와 동기(어드민 피드 주제) */
  category: string;
  category_label: string;
  /** `community_topics.name_en` — 카드 뱃지 en 표시(본문 아님) */
  category_name_en?: string | null;
  /** 어드민 주제별 목록 카드 스킨 (`community_topics.feed_list_skin`) */
  feed_list_skin: CommunityFeedListSkin;
  topic_color: string | null;
  is_question: boolean;
  title: string;
  summary: string;
  content: string;
  location_id: string;
  location_label: string;
  images: string[];
  view_count: number;
  like_count: number;
  comment_count: number;
  /**
   * Public display clock (= published_at / DIBAY_PUBLISHED_AT). Kept as `created_at` for card/timeago compat.
   * DB audit `created_at` is not exposed on this public DTO.
   */
  created_at: string;
  /** Community-wide Public publication chronology (same as public display clock) */
  published_at?: string;
  /**
   * SOURCE_PUBLISHED_AT snapshot for imported posts (`community_posts.display_date`).
   * Loaded in the same Feed/Detail batch select — never N+1.
   * When set, cards/detail may show this as the visible source date; sort still uses published_at.
   */
  display_date?: string | null;
  author_name: string;
  /** profiles.avatar_url — 상세·카드 아바타; imported → display_author_avatar_url */
  author_avatar_url?: string | null;
  author_id: string;
  /** member | admin | imported — internal provenance; Public must not branch product type on this */
  origin_kind?: import("@/lib/community/community-post-origin").CommunityPostOriginKind;
  /**
   * Real member peer target for follow/block CTAs.
   * Null when no real member target (e.g. import principal). Authority = capability, not origin_kind UI branch.
   */
  member_peer_user_id?: string | null;
  /**
   * Optional Public attribution when rights/attribution policy requires.
   * Visibility is policy metadata — not origin_kind === imported.
   */
  source_attribution?: {
    sourceName: string;
    canonicalUrl: string | null;
    sourcePublishedAt: string | null;
  } | null;
  /** Imported posts only: sanitized structured body for the detail page (null = render `content`). */
  content_blocks?: import("@/lib/community/imported-content-blocks").ImportedContentBlock[] | null;
  /** 로그인 viewer 전용 — 목록·상세 동기화 */
  viewer?: import("@/lib/community/post-engagement/types").CommunityPostViewerState;
};

export type NeighborhoodCommentNode = {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  /** `updated_at`가 생성 시각과 의미 있게 달릴 때 */
  is_edited: boolean;
  author_name: string;
  like_count: number;
  liked_by_viewer: boolean;
  /** 삭제·숨김된 부모 자리(답글 보존용) — 본문·작성자 비노출 */
  is_removed?: boolean;
  children: NeighborhoodCommentNode[];
};
