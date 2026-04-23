import type { SupabaseServer } from "@/lib/chat/supabase-server";

export async function fetchLikedCommentIdsSetForUser(
  sb: SupabaseServer,
  userId: string,
  commentIds: string[]
): Promise<Set<string>> {
  const u = userId?.trim() ?? "";
  if (!u || !commentIds.length) return new Set();
  const { data, error } = await sb
    .from("community_comment_likes")
    .select("comment_id")
    .eq("user_id", u)
    .in("comment_id", commentIds);
  if (error || !Array.isArray(data)) return new Set();
  return new Set((data as { comment_id?: string }[]).map((x) => String(x.comment_id ?? "")).filter(Boolean));
}
