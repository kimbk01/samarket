import type { CommunityCommentDTO } from "@/lib/community-feed/types";
import { flatCommentsToNeighborhoodTree } from "@/lib/neighborhood/comment-tree";
import type { NeighborhoodCommentNode } from "@/lib/neighborhood/types";
import { philifePostCommentsUrl } from "@domain/philife/api";

export type PhilifePostCommentsFetchResult = {
  ok: boolean;
  status: number;
  tree: NeighborhoodCommentNode[];
};

/**
 * 필라이프 글 상세 댓글 목록 — GET 한 번 → 트리.
 * (당근: 상세 진입 시 목록 조회, 작성 후 전체 재조회)
 */
export async function fetchPhilifePostCommentTree(postId: string): Promise<PhilifePostCommentsFetchResult> {
  const pid = String(postId ?? "").trim();
  if (!pid) {
    return { ok: false, status: 400, tree: [] };
  }

  let res: Response;
  try {
    res = await fetch(philifePostCommentsUrl(pid), { cache: "no-store", credentials: "include" });
  } catch {
    /** 네트워크 예외도 실패 결과로 — 로딩이 끝나고 재시도 버튼이 보이도록 (CM-P2-04) */
    return { ok: false, status: 0, tree: [] };
  }
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    tree?: NeighborhoodCommentNode[];
    comments?: CommunityCommentDTO[];
  };

  if (!res.ok || !data.ok) {
    return { ok: false, status: res.status, tree: [] };
  }

  if (Array.isArray(data.tree)) {
    return { ok: true, status: res.status, tree: data.tree };
  }

  if (Array.isArray(data.comments)) {
    return { ok: true, status: res.status, tree: flatCommentsToNeighborhoodTree(data.comments) };
  }

  return { ok: true, status: res.status, tree: [] };
}
