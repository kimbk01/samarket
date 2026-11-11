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
