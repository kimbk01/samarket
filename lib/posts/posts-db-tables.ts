/**
 * 거래 `posts` — 읽기는 마스킹 뷰, 쓰기는 실제 테이블.
 * 배포 순서: Supabase에 마이그레이션 적용(뷰 `posts_masked` 생성 + 권한) 후 앱 배포.
 * @see supabase/migrations/*_posts_reserved_buyer_masked_view.sql
 */
export const POSTS_TABLE_WRITE = "posts" as const;
export const POSTS_TABLE_READ = "posts_masked" as const;
