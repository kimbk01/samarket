import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";
import {
  MEMBER_IDENTITY_PROFILE_SELECT,
  memberDisplayLabelFromRow,
  type MemberIdentityProfileFields,
} from "@/lib/users/public-member-identity";

/**
 * Trade list/detail — `author_nickname` = Member **displayLabel** (nickname only; no `(@dibay_id)`).
 * Always refreshes from profiles (never keep contaminated display_name-based cache).
 * Never uses profiles.display_name / username / store fields.
 */
export async function enrichPostsAuthorNicknamesFromProfiles(
  sb: SupabaseClient,
  posts: PostWithMeta[]
): Promise<void> {
  if (posts.length === 0) return;
  const needIds = new Set<string>();
  for (const p of posts) {
    const aid =
      (typeof p.author_id === "string" && p.author_id.trim()) ||
      (typeof p.user_id === "string" && p.user_id.trim()) ||
      "";
    if (aid) needIds.add(aid);
  }
  if (needIds.size === 0) return;

  const ids = [...needIds];
  const { data, error } = await sb.from("profiles").select(MEMBER_IDENTITY_PROFILE_SELECT).in("id", ids);
  if (error || !Array.isArray(data)) return;

  const map = new Map<string, string>();
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) continue;
    map.set(id, memberDisplayLabelFromRow(row as MemberIdentityProfileFields, { userId: id }));
  }

  for (const p of posts) {
    const aid =
      (typeof p.author_id === "string" && p.author_id.trim()) ||
      (typeof p.user_id === "string" && p.user_id.trim()) ||
      "";
    const label = aid ? map.get(aid) : undefined;
    if (label) p.author_nickname = label;
  }
}
