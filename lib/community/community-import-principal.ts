/**
 * Community Import System Principal contract.
 *
 * - Exactly one auth.users row, registered in public.community_import_principal
 * - FK ON DELETE RESTRICT on that table blocks accidental Auth delete while registered
 * - community_posts.user_id remains NOT NULL → imported rows point at this principal
 * - Display name/avatar NEVER come from this principal's profile
 *
 * Seed (ops, not STEP 1 runtime):
 *   1) Auth Admin createUser (dedicated, no member login UX)
 *   2) INSERT INTO community_import_principal (user_id) VALUES (...)
 *   3) Optional profiles.nickname = internal marker (never shown for imported)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

let cachedPrincipalId: string | null | undefined;

export function clearCommunityImportPrincipalCache(): void {
  cachedPrincipalId = undefined;
}

export async function loadCommunityImportPrincipalUserId(
  sb: SupabaseClient
): Promise<string | null> {
  if (cachedPrincipalId !== undefined) return cachedPrincipalId;
  const { data, error } = await sb.from("community_import_principal").select("user_id").limit(1).maybeSingle();
  if (error) {
    const m = String(error.message ?? "").toLowerCase();
    if (m.includes("community_import_principal") || m.includes("does not exist") || m.includes("schema cache")) {
      cachedPrincipalId = null;
      return null;
    }
    cachedPrincipalId = null;
    return null;
  }
  const id = String((data as { user_id?: string } | null)?.user_id ?? "").trim();
  cachedPrincipalId = id || null;
  return cachedPrincipalId;
}

export function isSameCommunityImportPrincipal(
  userId: string | null | undefined,
  principalId: string | null | undefined
): boolean {
  const a = String(userId ?? "")
    .trim()
    .toLowerCase();
  const b = String(principalId ?? "")
    .trim()
    .toLowerCase();
  return Boolean(a && b && a === b);
}
