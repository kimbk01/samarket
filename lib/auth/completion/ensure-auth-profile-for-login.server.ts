import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ensureUserProfile, type EnsureUserProfileOutcome } from "@/lib/auth/ensure-user-profile";
import { ensurePendingAuthProfileRow } from "@/lib/auth/member-access";
import { extractOAuthProfileSeed } from "@/lib/auth/oauth-profile-seed";

export type EnsureAuthProfileForLoginOptions = {
  nicknameOverride?: string | null;
  /**
   * When true, also run ensureUserProfile once (member link / provider columns).
   * Default false — pending seed only (matches legacy upsertOAuthProfileFromUser).
   */
  enrichMemberProfile?: boolean;
};

export type EnsureAuthProfileForLoginResult = {
  enriched: boolean;
  ensureUserProfileOutcome: EnsureUserProfileOutcome | null;
};

/**
 * Common Profile Resolution — single logical writer for login completion.
 *
 * - New user: minimum profile row via ensurePendingAuthProfileRow
 * - Existing: empty-field fill / legacy nick-avatar gates only (non-destructive)
 * - username regeneration forbidden (delegated to pending/ensure gates)
 * - Confirmed displayName/avatar not overwritten after onboarding (same gates)
 *
 * DO NOT call ensurePendingAuthProfileRow + ensureUserProfile + upsertOAuth
 * separately in the same login completion path — use this once.
 */
export async function ensureAuthProfileForLogin(
  sb: SupabaseClient,
  user: User,
  opts?: EnsureAuthProfileForLoginOptions,
): Promise<EnsureAuthProfileForLoginResult> {
  const seed = extractOAuthProfileSeed(user);
  const override = opts?.nicknameOverride?.trim();
  if (override) {
    seed.nicknameCandidate = override;
  }

  await ensurePendingAuthProfileRow(sb, user, seed);

  if (!opts?.enrichMemberProfile) {
    return { enriched: false, ensureUserProfileOutcome: null };
  }

  const ensureUserProfileOutcome = await ensureUserProfile(sb, user);
  return { enriched: true, ensureUserProfileOutcome };
}
