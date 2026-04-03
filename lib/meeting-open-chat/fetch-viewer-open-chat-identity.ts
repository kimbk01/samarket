import type { SupabaseClient } from "@supabase/supabase-js";

export type MeetingOpenChatViewerIdentity = {
  suggestedNickname: string | null;
  suggestedRealname: string | null;
  avatarUrl: string | null;
};

export async function fetchViewerOpenChatIdentity(
  sb: SupabaseClient<any>,
  userId: string
): Promise<MeetingOpenChatViewerIdentity> {
  const uid = userId.trim();
  if (!uid) {
    return { suggestedNickname: null, suggestedRealname: null, avatarUrl: null };
  }

  const { data: profileRow } = await sb
    .from("profiles")
    .select("nickname, username, avatar_url, realname")
    .eq("id", uid)
    .maybeSingle();

  if (profileRow) {
    const p = profileRow as {
      nickname?: string | null;
      username?: string | null;
      avatar_url?: string | null;
      realname?: string | null;
    };
    const suggestedNickname = String(p.nickname ?? p.username ?? "").trim() || null;
    const suggestedRealname = String(p.realname ?? "").trim() || null;
    const avatarUrl = String(p.avatar_url ?? "").trim() || null;
    return {
      suggestedNickname: suggestedNickname ? suggestedNickname.slice(0, 40) : null,
      suggestedRealname: suggestedRealname ? suggestedRealname.slice(0, 40) : null,
      avatarUrl,
    };
  }

  const { data: testRow } = await sb
    .from("test_users")
    .select("display_name, username")
    .eq("id", uid)
    .maybeSingle();

  if (testRow) {
    const t = testRow as { display_name?: string | null; username?: string | null };
    const displayName = String(t.display_name ?? "").trim() || null;
    const nickname = String(t.username ?? t.display_name ?? "").trim() || null;
    return {
      suggestedNickname: nickname ? nickname.slice(0, 40) : null,
      suggestedRealname: displayName ? displayName.slice(0, 40) : null,
      avatarUrl: null,
    };
  }

  return { suggestedNickname: null, suggestedRealname: null, avatarUrl: null };
}
