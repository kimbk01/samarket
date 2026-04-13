/**
 * 거래 `posts` — 읽기는 선택적으로 마스킹 뷰(`posts_masked`), 쓰기는 실제 테이블.
 *
 * - 기본값은 **`posts`**: DB에 `posts_masked` 뷰가 없으면 PostgREST 가 `PGRST205` 를 낸다.
 * - `reserved_buyer_id` 마스킹 뷰를 쓰려면 `supabase/migrations/*_posts_reserved_buyer_masked_view.sql` 적용 후
 *   `POSTS_TABLE_READ=posts_masked` 또는 `NEXT_PUBLIC_POSTS_TABLE_READ=posts_masked` 설정.
 */
export const POSTS_TABLE_WRITE = "posts" as const;

function resolvePostsReadTableName(): "posts" | "posts_masked" {
  if (typeof process === "undefined" || !process.env) {
    return "posts";
  }
  const raw = (
    process.env.POSTS_TABLE_READ ??
    process.env.NEXT_PUBLIC_POSTS_TABLE_READ ??
    ""
  ).trim()
    .toLowerCase();
  if (raw === "posts_masked") {
    return "posts_masked";
  }
  return "posts";
}

export const POSTS_TABLE_READ = resolvePostsReadTableName();
