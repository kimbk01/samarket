/**
 * community_posts / community_comments — status 컬럼(v2) + 레거시 is_hidden / is_deleted 호환
 */

export function isCommunityPostPubliclyVisible(row: {
  status?: string | null;
  is_hidden?: boolean | null;
  is_deleted?: boolean | null;
}): boolean {
  const s = String(row.status ?? "")
    .trim()
    .toLowerCase();
  if (s === "deleted" || s === "hidden") return false;
  if (s === "active") return true;
  if (s) return false;
  return row.is_deleted !== true && row.is_hidden !== true;
}

export function isCommunityCommentPubliclyVisible(row: {
  status?: string | null;
  is_hidden?: boolean | null;
  is_deleted?: boolean | null;
}): boolean {
  return isCommunityPostPubliclyVisible(row);
}

/** 모임 참여/채팅 허용 여부 (종료·취소 시 차단) */
export function isMeetingJoinable(row: {
  status?: string | null;
  is_closed?: boolean | null;
}): boolean {
  const s = String(row.status ?? "")
    .trim()
    .toLowerCase();
  if (s === "ended" || s === "cancelled" || s === "closed") return false;
  if (s === "open") return true;
  return row.is_closed !== true;
}
