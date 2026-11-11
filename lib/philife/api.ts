/**
 * 필라이프 클라이언트·서버에서 호출하는 `/api/philife/*` URL 단일 정의.
 * 라우트 파일은 `app/api/philife/` 아래에 두고, 여기 경로와 반드시 일치시킵니다.
 */
const PHILIFE_API = "/api/philife" as const;

export function philifeUploadImageUrl(): string {
  return `${PHILIFE_API}/upload-image`;
}

/** 클립보드 HTML `img` 등 외부 URL → 서버 fetch 후 `post-images` 저장 */
export function philifeUploadImageFromUrl(): string {
  return `${PHILIFE_API}/upload-image-from-url`;
}

/** 기사 URL → og:image(대표 썸네일) URL, 서버에서 HTML 파싱 */
export function philifeArticleOgImageUrl(): string {
  return `${PHILIFE_API}/article-og-image`;
}

export function philifeNeighborhoodPostsUrl(): string {
  return `${PHILIFE_API}/neighborhood-posts`;
}

export function philifeNeighborhoodPostUrl(postId: string): string {
  return `${PHILIFE_API}/neighborhood-posts/${encodeURIComponent(postId)}`;
}

/** `searchParams`는 이미 인코딩된 쿼리 문자열 (예: `p.toString()`). */
export function philifeNeighborhoodFeedUrl(searchParams: string): string {
  return `${PHILIFE_API}/neighborhood-feed?${searchParams}`;
}

/** 홈 피드 칩·글쓰기 카테고리 — 어드민 `community_topics`(dongnae) 연동 */
export function philifeNeighborhoodTopicOptionsUrl(): string {
  return `${PHILIFE_API}/neighborhood-topic-options`;
}

export function philifePostsRootUrl(): string {
  return `${PHILIFE_API}/posts`;
}

export function philifePostViewUrl(postId: string): string {
  return `${PHILIFE_API}/posts/${encodeURIComponent(postId)}/view`;
}

export function philifePostLikeUrl(postId: string): string {
  return `${PHILIFE_API}/posts/${encodeURIComponent(postId)}/like`;
}

export function philifePostCommentsUrl(postId: string): string {
  return `${PHILIFE_API}/posts/${encodeURIComponent(postId)}/comments`;
}

export function philifePostCommentUrl(postId: string, commentId: string): string {
  return `${PHILIFE_API}/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`;
}

export function philifePostCommentLikeUrl(postId: string, commentId: string): string {
  return `${PHILIFE_API}/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/like`;
}
