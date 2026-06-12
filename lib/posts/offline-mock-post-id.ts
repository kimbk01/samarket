/**
 * 로컬 전용 목 ID(`my-*`) — DB `posts`에 없어 API 호출 시 403·불필요 트래픽만 유발함.
 */
export function isOfflineMockPostId(postId: string | undefined | null): boolean {
  if (!postId || typeof postId !== "string") return false;
  return /^my-\d+$/.test(postId.trim());
}
