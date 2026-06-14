import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensurePendingAuthProfileRow } from "@/lib/auth/member-access";
import { extractOAuthProfileSeed } from "@/lib/auth/oauth-profile-seed";

/**
 * OAuth callback·native exchange 공통 — provider nickname/avatar 시드 + profile row upsert.
 * @id·전화·주소는 설정하지 않는다.
 */
export async function upsertOAuthProfileFromUser(
  sb: SupabaseClient,
  user: User,
  opts?: { nicknameOverride?: string | null }
): Promise<void> {
  const seed = extractOAuthProfileSeed(user);
  const override = opts?.nicknameOverride?.trim();
  if (override) {
    seed.nicknameCandidate = override;
  }
  await ensurePendingAuthProfileRow(sb, user, seed);
}
