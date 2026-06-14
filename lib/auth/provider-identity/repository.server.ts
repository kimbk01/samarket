import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LinkableAuthProvider,
  ProviderIdentityCandidate,
  StoredAuthProvider,
  UserAuthIdentityRow,
} from "@/lib/auth/provider-identity/types";
import { isEmailEligibleForConflictMatch, normalizeProviderEmail } from "@/lib/auth/provider-identity/email-policy";

const TABLE = "user_auth_identities";

export async function findIdentityByProviderUserId(
  sb: SupabaseClient,
  provider: string,
  providerUserId: string,
): Promise<UserAuthIdentityRow | null> {
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("provider", provider)
    .eq("provider_user_id", providerUserId)
    .maybeSingle();
  if (error) throw error;
  return (data as UserAuthIdentityRow | null) ?? null;
}

export async function findIdentitiesByUserId(
  sb: SupabaseClient,
  userId: string,
): Promise<UserAuthIdentityRow[]> {
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("linked_at", { ascending: true });
  if (error) throw error;
  return (data as UserAuthIdentityRow[]) ?? [];
}

export async function findIdentitiesByEmailForConflict(
  sb: SupabaseClient,
  email: string,
  excludeProvider?: string,
): Promise<UserAuthIdentityRow[]> {
  const normalized = normalizeProviderEmail(email);
  if (!normalized || !isEmailEligibleForConflictMatch(normalized)) return [];

  let query = sb
    .from(TABLE)
    .select("*")
    .eq("email", normalized)
    .eq("email_is_private_relay", false);

  if (excludeProvider) {
    query = query.neq("provider", excludeProvider);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as UserAuthIdentityRow[]) ?? [];
}

/** profiles fallback when identity row missing (transition). */
export async function findProfileByProviderUserId(
  sb: SupabaseClient,
  provider: string,
  providerUserId: string,
): Promise<{ id: string; provider: string | null } | null> {
  const { data: byProvider, error: byProviderError } = await sb
    .from("profiles")
    .select("id, provider")
    .eq("provider_user_id", providerUserId)
    .eq("provider", provider)
    .maybeSingle();
  if (byProviderError) throw byProviderError;
  if (byProvider?.id) return byProvider;

  const { data: byAuthProvider, error: byAuthProviderError } = await sb
    .from("profiles")
    .select("id, provider")
    .eq("provider_user_id", providerUserId)
    .eq("auth_provider", provider)
    .maybeSingle();
  if (byAuthProviderError) throw byAuthProviderError;
  return byAuthProvider;
}

export async function insertUserAuthIdentity(
  sb: SupabaseClient,
  userId: string,
  candidate: ProviderIdentityCandidate,
): Promise<UserAuthIdentityRow> {
  const email = normalizeProviderEmail(candidate.email);
  const row = {
    user_id: userId,
    provider: candidate.provider,
    provider_user_id: candidate.providerUserId,
    email,
    email_verified: candidate.emailVerified ?? Boolean(email),
    email_is_private_relay: candidate.emailIsPrivateRelay ?? false,
    raw_profile: candidate.rawProfile ?? {},
  };
  const { data, error } = await sb.from(TABLE).insert(row).select("*").single();
  if (error) throw error;
  return data as UserAuthIdentityRow;
}

export async function deleteUserAuthIdentity(
  sb: SupabaseClient,
  userId: string,
  provider: LinkableAuthProvider,
): Promise<boolean> {
  const { error, count } = await sb
    .from(TABLE)
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export function distinctProviders(rows: UserAuthIdentityRow[]): StoredAuthProvider[] {
  const seen = new Set<string>();
  const out: StoredAuthProvider[] = [];
  for (const row of rows) {
    const p = row.provider;
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}
