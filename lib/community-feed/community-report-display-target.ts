/**
 * Community Admin report / comment display type — derived from community_reports.target_type
 * + community_comments.parent_id. No separate reply table.
 */

export type CommunityReportDisplayTarget = "post" | "comment" | "reply";

export function resolveCommunityReportDisplayTarget(input: {
  targetType: string | null | undefined;
  parentId?: string | null | undefined;
}): CommunityReportDisplayTarget {
  const t = String(input.targetType ?? "")
    .trim()
    .toLowerCase();
  if (t === "post") return "post";
  if (t === "comment") {
    const parent = String(input.parentId ?? "").trim();
    return parent ? "reply" : "comment";
  }
  return "post";
}

export function resolveCommunityCommentRowKind(parentId: string | null | undefined): "comment" | "reply" {
  return String(parentId ?? "").trim() ? "reply" : "comment";
}

/** Admin comments surface locator for a report/comment target. */
export function adminCommunityCommentModerationHref(input: {
  commentId: string;
  postId?: string | null;
}): string {
  const cid = String(input.commentId ?? "").trim();
  const q = new URLSearchParams();
  if (cid) q.set("commentId", cid);
  const postId = String(input.postId ?? "").trim();
  if (postId) q.set("postId", postId);
  const qs = q.toString();
  return qs ? `/admin/community/comments?${qs}` : "/admin/community/comments";
}

export function adminCommunityPostModerationHref(postId: string): string {
  const id = String(postId ?? "").trim();
  return id ? `/admin/community/posts/${encodeURIComponent(id)}` : "/admin/community/posts";
}
