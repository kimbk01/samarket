import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureAuthProfileForLogin } from "@/lib/auth/completion/ensure-auth-profile-for-login.server";

/**
 * COMPATIBILITY HOLD thin alias → ensureAuthProfileForLogin (Slice 2-1 / 6-6).
 *
 * OAuth callback·native exchange 공통 — provider nickname/avatar 시드 + profile row upsert.
 * @id·전화·주소는 설정하지 않는다.
 *
 * New call sites should prefer ensureAuthProfileForLogin. Do not reintroduce a separate
 * profile-writer authority beside the Completion owner.
 */
export async function upsertOAuthProfileFromUser(
  sb: SupabaseClient,
  user: User,
  opts?: { nicknameOverride?: string | null }
): Promise<void> {
  await ensureAuthProfileForLogin(sb, user, {
    nicknameOverride: opts?.nicknameOverride,
    enrichMemberProfile: false,
  });
}
