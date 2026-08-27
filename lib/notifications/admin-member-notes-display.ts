import type { SupabaseClient } from "@supabase/supabase-js";
import type { NoteThreadRow } from "@/lib/notifications/member-admin-notes-service";

export type AdminNoteThreadDisplay = NoteThreadRow & {
  member_display_name: string | null;
  member_email: string | null;
  is_store_owner: boolean;
  store_names: string[];
  store_ids: string[];
};

/**
 * Display-only enrichment for Admin Member Notes list.
 * Does not change member_admin_note thread/message authority.
 */
export async function enrichAdminNoteThreadsForDisplay(
  sb: SupabaseClient,
  threads: NoteThreadRow[]
): Promise<AdminNoteThreadDisplay[]> {
  if (threads.length === 0) return [];
  const memberIds = [...new Set(threads.map((t) => t.member_user_id).filter(Boolean))];

  const [{ data: profiles }, { data: stores }] = await Promise.all([
    sb
      .from("profiles")
      .select("id, display_name, nickname, email")
      .in("id", memberIds),
    sb
      .from("stores")
      .select("id, store_name, owner_user_id")
      .in("owner_user_id", memberIds)
      .limit(500),
  ]);

  const profileById = new Map<
    string,
    { display_name?: string | null; nickname?: string | null; email?: string | null }
  >();
  for (const p of profiles ?? []) {
    const id = String((p as { id?: string }).id ?? "");
    if (id) profileById.set(id, p as { display_name?: string | null; nickname?: string | null; email?: string | null });
  }

  const storesByOwner = new Map<string, { id: string; store_name: string }[]>();
  for (const s of stores ?? []) {
    const owner = String((s as { owner_user_id?: string }).owner_user_id ?? "");
    const id = String((s as { id?: string }).id ?? "");
    const name = String((s as { store_name?: string }).store_name ?? "").trim() || id.slice(0, 8);
    if (!owner || !id) continue;
    const list = storesByOwner.get(owner) ?? [];
    list.push({ id, store_name: name });
    storesByOwner.set(owner, list);
  }

  return threads.map((th) => {
    const profile = profileById.get(th.member_user_id);
    const owned = storesByOwner.get(th.member_user_id) ?? [];
    const display =
      String(profile?.display_name ?? "").trim() ||
      String(profile?.nickname ?? "").trim() ||
      null;
    return {
      ...th,
      member_display_name: display,
      member_email: String(profile?.email ?? "").trim() || null,
      is_store_owner: owned.length > 0,
      store_names: owned.map((s) => s.store_name),
      store_ids: owned.map((s) => s.id),
    };
  });
}
