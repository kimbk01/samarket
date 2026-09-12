import type { SupabaseClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";

export type CommunityAuthorPoolAlias = {
  id: string;
  pool_id: string;
  alias_name: string;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
};

export type CommunityAuthorPool = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  aliases: CommunityAuthorPoolAlias[];
};

export type AuthorPoolWithAliases = CommunityAuthorPool;

export async function listAuthorPools(sb: SupabaseClient): Promise<CommunityAuthorPool[]> {
  const { data: pools, error: pErr } = await sb
    .from("community_author_pools")
    .select("*")
    .order("name", { ascending: true });
  if (pErr) throw new Error(pErr.message);

  const { data: aliases, error: aErr } = await sb
    .from("community_author_pool_aliases")
    .select("*")
    .order("alias_name", { ascending: true });
  if (aErr) throw new Error(aErr.message);

  const aliasMap = new Map<string, CommunityAuthorPoolAlias[]>();
  for (const a of aliases || []) {
    const pid = String(a.pool_id);
    if (!aliasMap.has(pid)) aliasMap.set(pid, []);
    aliasMap.get(pid)!.push({
      id: String(a.id),
      pool_id: pid,
      alias_name: String(a.alias_name),
      avatar_url: a.avatar_url ? String(a.avatar_url) : null,
      is_active: a.is_active !== false,
      created_at: String(a.created_at),
    });
  }

  return (pools || []).map((p) => ({
    id: String(p.id),
    name: String(p.name),
    description: p.description ? String(p.description) : null,
    created_at: String(p.created_at),
    updated_at: String(p.updated_at),
    aliases: aliasMap.get(String(p.id)) || [],
  }));
}

export async function getAuthorPool(sb: SupabaseClient, poolId: string): Promise<CommunityAuthorPool | null> {
  const { data: pool, error: pErr } = await sb
    .from("community_author_pools")
    .select("*")
    .eq("id", poolId)
    .maybeSingle();
  if (pErr || !pool) return null;

  const { data: aliases, error: aErr } = await sb
    .from("community_author_pool_aliases")
    .select("*")
    .eq("pool_id", poolId)
    .order("alias_name", { ascending: true });
  if (aErr) throw new Error(aErr.message);

  return {
    id: String(pool.id),
    name: String(pool.name),
    description: pool.description ? String(pool.description) : null,
    created_at: String(pool.created_at),
    updated_at: String(pool.updated_at),
    aliases: (aliases || []).map((a) => ({
      id: String(a.id),
      pool_id: String(a.pool_id),
      alias_name: String(a.alias_name),
      avatar_url: a.avatar_url ? String(a.avatar_url) : null,
      is_active: a.is_active !== false,
      created_at: String(a.created_at),
    })),
  };
}

export async function createAuthorPool(
  sb: SupabaseClient,
  input: { name: string; description?: string | null }
): Promise<CommunityAuthorPool> {
  const name = input.name.trim();
  if (!name) throw new Error("pool_name_required");

  const { data, error } = await sb
    .from("community_author_pools")
    .insert({
      name,
      description: input.description?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  return {
    id: String(data.id),
    name: String(data.name),
    description: data.description ? String(data.description) : null,
    created_at: String(data.created_at),
    updated_at: String(data.updated_at),
    aliases: [],
  };
}

export async function updateAuthorPool(
  sb: SupabaseClient,
  poolId: string,
  input: { name?: string; description?: string | null }
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof input.name === "string") {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error("pool_name_required");
    patch.name = trimmed;
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  const { error } = await sb.from("community_author_pools").update(patch).eq("id", poolId);
  if (error) throw new Error(error.message);
}

export async function deleteAuthorPool(sb: SupabaseClient, poolId: string): Promise<void> {
  const { error } = await sb.from("community_author_pools").delete().eq("id", poolId);
  if (error) throw new Error(error.message);
}

export async function addAuthorPoolAlias(
  sb: SupabaseClient,
  input: { poolId: string; aliasName: string; avatarUrl?: string | null }
): Promise<{ ok: true; alias: CommunityAuthorPoolAlias } | { ok: false; error: string }> {
  const aliasName = input.aliasName.trim();
  if (!aliasName) return { ok: false, error: "alias_name_required" };

  // Anti-impersonation: Check against member profiles
  const { data: conflict } = await sb
    .from("profiles")
    .select("id")
    .ilike("display_name", aliasName)
    .limit(1)
    .maybeSingle();

  if (conflict) {
    return { ok: false, error: "ALIAS_CONFLICTS_WITH_MEMBER_NICKNAME" };
  }

  const { data, error } = await sb
    .from("community_author_pool_aliases")
    .insert({
      pool_id: input.poolId,
      alias_name: aliasName,
      avatar_url: input.avatarUrl?.trim() || null,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    alias: {
      id: String(data.id),
      pool_id: String(data.pool_id),
      alias_name: String(data.alias_name),
      avatar_url: data.avatar_url ? String(data.avatar_url) : null,
      is_active: data.is_active !== false,
      created_at: String(data.created_at),
    },
  };
}

export async function updateAuthorPoolAlias(
  sb: SupabaseClient,
  aliasId: string,
  input: { aliasName?: string; avatarUrl?: string | null; isActive?: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const patch: Record<string, unknown> = {};
  if (typeof input.aliasName === "string") {
    const trimmed = input.aliasName.trim();
    if (!trimmed) return { ok: false, error: "alias_name_required" };

    const { data: conflict } = await sb
      .from("profiles")
      .select("id")
      .ilike("display_name", trimmed)
      .limit(1)
      .maybeSingle();
    if (conflict) {
      return { ok: false, error: "ALIAS_CONFLICTS_WITH_MEMBER_NICKNAME" };
    }
    patch.alias_name = trimmed;
  }
  if (input.avatarUrl !== undefined) {
    patch.avatar_url = input.avatarUrl?.trim() || null;
  }
  if (typeof input.isActive === "boolean") {
    patch.is_active = input.isActive;
  }

  const { error } = await sb.from("community_author_pool_aliases").update(patch).eq("id", aliasId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteAuthorPoolAlias(sb: SupabaseClient, aliasId: string): Promise<void> {
  const { error } = await sb.from("community_author_pool_aliases").delete().eq("id", aliasId);
  if (error) throw new Error(error.message);
}

export async function pickRandomAliasFromPool(
  sb: SupabaseClient,
  poolId: string
): Promise<{ aliasName: string; avatarUrl: string | null } | null> {
  const { data, error } = await sb
    .from("community_author_pool_aliases")
    .select("alias_name, avatar_url")
    .eq("pool_id", poolId)
    .eq("is_active", true);

  if (error || !data || data.length === 0) return null;
  const picked = data[randomInt(0, data.length)]!;
  return {
    aliasName: String(picked.alias_name).trim(),
    avatarUrl: picked.avatar_url ? String(picked.avatar_url).trim() : null,
  };
}
