/**
 * 필라이프 동네 피드·글쓰기(`neighborhood-posts`, `lib/neighborhood/queries`)가
 * `community_posts` 에서 읽거나 쓰는 컬럼. DB와 어긋나면 PostgREST schema cache 오류가 난다.
 *
 * 통합 붙여넣기 SQL: `supabase/scripts/philife-schema-paste.sql`
 */
export const PHILIFE_COMMUNITY_POSTS_WRITE_KEYS = [
  "user_id",
  "section_id",
  "section_slug",
  "topic_id",
  "topic_slug",
  "title",
  "content",
  "summary",
  "region_label",
  "location_id",
  "category",
  "images",
  "is_question",
  "is_meetup",
  "meetup_place",
  "meetup_date",
  "status",
  "is_sample_data",
] as const;

/** 피드·상세 select 에서 추가로 조회하는 컬럼 */
export const PHILIFE_COMMUNITY_POSTS_READ_EXTRA = [
  "id",
  "view_count",
  "like_count",
  "comment_count",
  "created_at",
  "is_deleted",
  "is_hidden",
] as const;
