/**
 * 라운지 댓글 표시 상태 — 서버 단일 판정 (설계 `docs/audit/lounge-comments-2026-11-28/lounge-comments-audit-design.md` §6.2).
 *
 * - visible            : 정상 댓글
 * - deleted_by_author  : 작성자가 지움(`status=deleted`, `moderated_by` 없음)
 * - removed_by_admin   : 운영 숨김·삭제(`hidden`·`is_hidden`, 또는 `moderated_by` 있는 삭제)
 * - blocked_author     : 내가 차단한 회원의 댓글 — 항상 자리 표시, 그 아래 다른 사람 답글은 그대로 (Owner 결정 3)
 * - unavailable        : 나를 차단한 회원의 댓글 — 차단 사실을 드러내지 않는 중립 자리, 답글이 있을 때만
 *
 * 자리만 남는 상태(visible 이 아닌 것)는 본문·작성자·사진을 내리지 않는다.
 * 삭제·숨김·unavailable 은 살아 있는 답글(visible·blocked_author)이 있을 때만 자리로 남고, 없으면 목록에서 빠진다.
 */
import type { CommunityCommentDisplayState } from "@/lib/community-feed/types";
import { selectCommentRowsWithTombstones } from "@/lib/community-feed/comment-tombstones";

export type CommentDisplayRow = {
  id: string;
  user_id: string | null;
  parent_id: string | null;
  status?: string | null;
  is_hidden?: boolean | null;
  is_deleted?: boolean | null;
  moderated_by?: string | null;
};

/**
 * 공개 댓글 = DB 댓글 수 트리거(`sync_community_post_comment_count`)와 같은 정의:
 * status 가 active(없으면 active) 이고 숨김·삭제 표시가 모두 아님.
 */
export function isCommentRowPublic(row: Pick<CommentDisplayRow, "status" | "is_hidden" | "is_deleted">): boolean {
  const status = String(row.status ?? "active").trim() || "active";
  return status === "active" && row.is_hidden !== true && row.is_deleted !== true;
}

export function resolveCommentDisplayState(
  row: CommentDisplayRow,
  blocks: { blockedByMe: Set<string>; blockedMe: Set<string> }
): CommunityCommentDisplayState {
  if (!isCommentRowPublic(row)) {
    const status = String(row.status ?? "").trim();
    const byAdmin = String(row.moderated_by ?? "").trim().length > 0;
    if (status === "deleted" && !byAdmin && row.is_hidden !== true) return "deleted_by_author";
    return "removed_by_admin";
  }
  const author = String(row.user_id ?? "").trim();
  if (author && blocks.blockedByMe.has(author)) return "blocked_author";
  if (author && blocks.blockedMe.has(author)) return "unavailable";
  return "visible";
}

/** 자리 표시가 아니라 「살아 있는」 댓글로 셈하는 상태 — 조상 자리를 남기는 기준 */
export function isLiveCommentDisplayState(state: CommunityCommentDisplayState): boolean {
  return state === "visible" || state === "blocked_author";
}

/**
 * 행 목록 → 남길 행과 상태. 입력 순서(작성 시각 순)를 유지한다.
 */
export function selectCommentDisplayRows<R extends CommentDisplayRow>(
  rows: R[],
  blocks: { blockedByMe: Set<string>; blockedMe: Set<string> }
): Array<{ row: R; state: CommunityCommentDisplayState }> {
  const stateById = new Map<string, CommunityCommentDisplayState>();
  for (const r of rows) stateById.set(String(r.id), resolveCommentDisplayState(r, blocks));
  const { keptRows } = selectCommentRowsWithTombstones(
    rows as unknown as Array<Record<string, unknown>>,
    (r) => isLiveCommentDisplayState(stateById.get(String(r.id)) ?? "removed_by_admin")
  );
  return (keptRows as unknown as R[]).map((row) => ({ row, state: stateById.get(String(row.id))! }));
}

/** 「댓글 N」 — DB `comment_count` 트리거와 같은 정의(공개 상태 행 수). 보는 사람 차단과 무관 */
export function countPublicComments(rows: CommentDisplayRow[]): number {
  let n = 0;
  for (const r of rows) {
    if (isCommentRowPublic(r)) n += 1;
  }
  return n;
}

/** 관리자 콘솔 상태 배지 4종 — 앱 판정과 같은 규칙 (설계 §6.7 · 감사 L16) */
export type CommunityCommentModerationKind = "active" | "deleted_by_author" | "deleted_by_admin" | "hidden";

export function resolveCommunityCommentModerationKind(row: {
  status?: unknown;
  is_hidden?: unknown;
  is_deleted?: unknown;
  moderated_by?: unknown;
}): CommunityCommentModerationKind {
  const status = String(row.status ?? "active").trim();
  const byAdmin = String(row.moderated_by ?? "").trim().length > 0;
  if (status === "hidden" || row.is_hidden === true) return "hidden";
  if (status === "deleted" || row.is_deleted === true) return byAdmin ? "deleted_by_admin" : "deleted_by_author";
  return "active";
}
