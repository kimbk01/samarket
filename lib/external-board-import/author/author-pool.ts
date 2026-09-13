import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthorPool = {
  id: string;
  name: string;
  created_at: string;
};

export type AuthorAlias = {
  id: string;
  pool_id: string;
  display_name: string;
  avatar_url: string | null;
  enabled: boolean;
};

/** Import-only editorial aliases. Never impersonate member profiles. */
export async function listAuthorPools(sb: SupabaseClient): Promise<AuthorPool[]> {
  const { data, error } = await sb.from("external_board_author_pools").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String((r as { id: string }).id),
    name: String((r as { name: string }).name),
    created_at: String((r as { created_at: string }).created_at),
  }));
}

export async function createAuthorPool(sb: SupabaseClient, name: string): Promise<AuthorPool> {
  const { data, error } = await sb
    .from("external_board_author_pools")
    .insert({ name: name.trim() })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: String((data as { id: string }).id),
    name: String((data as { name: string }).name),
    created_at: String((data as { created_at: string }).created_at),
  };
}

export async function listAuthorAliases(sb: SupabaseClient, poolId: string): Promise<AuthorAlias[]> {
  const { data, error } = await sb
    .from("external_board_author_aliases")
    .select("*")
    .eq("pool_id", poolId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String((r as { id: string }).id),
    pool_id: String((r as { pool_id: string }).pool_id),
    display_name: String((r as { display_name: string }).display_name),
    avatar_url: (r as { avatar_url?: string | null }).avatar_url != null ? String((r as { avatar_url: string }).avatar_url) : null,
    enabled: Boolean((r as { enabled?: boolean }).enabled),
  }));
}

export async function addAuthorAlias(
  sb: SupabaseClient,
  poolId: string,
  input: { displayName: string; avatarUrl?: string | null }
): Promise<AuthorAlias> {
  const { data, error } = await sb
    .from("external_board_author_aliases")
    .insert({
      pool_id: poolId,
      display_name: input.displayName.trim(),
      avatar_url: input.avatarUrl ?? null,
      enabled: true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    pool_id: String(r.pool_id),
    display_name: String(r.display_name),
    avatar_url: r.avatar_url != null ? String(r.avatar_url) : null,
    enabled: Boolean(r.enabled),
  };
}

export async function pickAuthorAliasForPublish(
  sb: SupabaseClient,
  poolId: string | null
): Promise<{ displayName: string; avatarUrl: string | null }> {
  if (!poolId) {
    return { displayName: "DIBAY Editorial", avatarUrl: null };
  }
  const aliases = await listAuthorAliases(sb, poolId);
  const enabled = aliases.filter((a) => a.enabled);
  if (!enabled.length) {
    return { displayName: "DIBAY Editorial", avatarUrl: null };
  }
  const pick = enabled[Math.floor(Math.random() * enabled.length)]!;
  return { displayName: pick.display_name, avatarUrl: pick.avatar_url };
}
