import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchViewerSuggestedOpenNickname(
  sb: SupabaseClient<any>,
  userId: string
): Promise<string | null> {
  const { data: profileRow } = await sb.from("profiles").select("nickname, username").eq("id", userId).maybeSingle();
  if (profileRow) {
    const p = profileRow as { nickname?: string | null; username?: string | null };
    const n = String(p.nickname ?? p.username ?? "").trim();
    if (n) return n.slice(0, 40);
  }
  const { data: testRow } = await sb
    .from("test_users")
    .select("display_name, username")
    .eq("id", userId)
    .maybeSingle();
  if (testRow) {
    const t = testRow as { display_name?: string | null; username?: string | null };
    const n = String(t.display_name ?? t.username ?? "").trim();
    if (n) return n.slice(0, 40);
  }
  return null;
}
