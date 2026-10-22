/**
 * Philife 댓글 — community 핸들러와 같은 접근 검사(작성자·공개 상태·차단)를 쓴다 (CM-P2-01).
 * 응답 `{ comments }`(flat) 는 `fetchPhilifePostCommentTree` 가 트리로 변환한다.
 */
export { GET, POST } from "../../../../community/posts/[postId]/comments/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
