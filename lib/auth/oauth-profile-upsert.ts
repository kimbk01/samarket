import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureAuthProfileForLogin } from "@/lib/auth/completion/ensure-auth-profile-for-login.server";

/**
 * OAuth callback·native exchange 공통 — provider nickname/avatar 시드 + profile row upsert.
 * @id·전화·주소는 설정하지 않는다.
 *
 * Slice 2-1: delegates to ensureAuthProfileForLogin (single profile writer).
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
