import type { CommunityCommentDTO } from "@/lib/community-feed/types";
import { flatCommentsToNeighborhoodTree } from "@/lib/neighborhood/comment-tree";
import type { NeighborhoodCommentNode } from "@/lib/neighborhood/types";
import { philifePostCommentsUrl } from "@domain/philife/api";

export type PhilifePostCommentsFetchResult = {
  ok: boolean;
  status: number;
  tree: NeighborhoodCommentNode[];
  /** 「댓글 N」 — DB `comment_count` 와 같은 정의(공개 댓글 수) */
  count: number;
  /** 운영 설정 댓글 글자 수 상한 (없으면 null) */
  maxLength: number | null;
};

/**
 * 필라이프 글 상세 댓글 목록 — GET 한 번 → 트리.
 * (상세 진입 시 목록 조회, 작성·삭제·관리자 처리 후 전체 재조회 — 화면 = 새로고침 결과)
 */
export async function fetchPhilifePostCommentTree(postId: string): Promise<PhilifePostCommentsFetchResult> {
  const pid = String(postId ?? "").trim();
  const fail = (status: number): PhilifePostCommentsFetchResult => ({ ok: false, status, tree: [], count: 0, maxLength: null });
  if (!pid) return fail(400);

  let res: Response;
  try {
    res = await fetch(philifePostCommentsUrl(pid), { cache: "no-store", credentials: "include" });
  } catch {
    /** 네트워크 예외도 실패 결과로 — 로딩이 끝나고 재시도 버튼이 보이도록 (CM-P2-04) */
    return fail(0);
  }
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    comments?: CommunityCommentDTO[];
    count?: number;
    max_length?: number;
  };

  if (!res.ok || !data.ok || !Array.isArray(data.comments)) return fail(res.status);

  const tree = flatCommentsToNeighborhoodTree(data.comments);
  const count =
    typeof data.count === "number" && Number.isFinite(data.count)
      ? Math.max(0, data.count)
      : data.comments.filter((c) => c.display_state === "visible").length;
  const maxLength =
    typeof data.max_length === "number" && Number.isFinite(data.max_length) && data.max_length > 0
      ? data.max_length
      : null;
  return { ok: true, status: res.status, tree, count, maxLength };
}
