import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";

function labelFromProfileRow(row: Record<string, unknown>): string {
  const nick = typeof row.nickname === "string" ? row.nickname.trim() : "";
  if (nick) return nick;
  const user = typeof row.username === "string" ? row.username.trim() : "";
  return user;
}

/**
 * `posts.author_nickname` 이 비어 있으면 `profiles` 에서 id 일괄 조회해 보강 (닉네임 → username).
 */
export async function enrichPostsAuthorNicknamesFromProfiles(
  sb: SupabaseClient,
  posts: PostWithMeta[]
): Promise<void> {
  if (posts.length === 0) return;
  const needIds = new Set<string>();
  for (const p of posts) {
    const existing =
      typeof p.author_nickname === "string" ? p.author_nickname.trim() : "";
    if (existing) continue;
    const aid = typeof p.author_id === "string" ? p.author_id.trim() : "";
    if (aid) needIds.add(aid);
  }
  if (needIds.size === 0) return;

  const ids = [...needIds];
  const { data, error } = await sb.from("profiles").select("id, nickname, username").in("id", ids);
  if (error || !Array.isArray(data)) return;

  const map = new Map<string, string>();
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const label = labelFromProfileRow(row);
    if (id && label) map.set(id, label);
  }

  for (const p of posts) {
    const existing =
      typeof p.author_nickname === "string" ? p.author_nickname.trim() : "";
    if (existing) continue;
    const aid = typeof p.author_id === "string" ? p.author_id.trim() : "";
    const label = aid ? map.get(aid) : undefined;
    if (label) p.author_nickname = label;
  }
}
