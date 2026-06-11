import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentProfile } from "@/lib/auth/server-guards";
import {
  invalidatePhoneVerifiedPositiveProfile,
  rememberPhoneVerifiedPositiveProfile,
} from "@/lib/auth/phone-verified-positive-cache";
import { hasPhilippinePhoneVerification } from "@/lib/auth/store-member-policy";

/** OTP 검증 성공 직후 — stale positive 캐시 제거 후 fresh profile 로 gate 캐시 재구성 */
export async function syncPhoneVerifiedServerCache(userId: string): Promise<void> {
  invalidatePhoneVerifiedPositiveProfile(userId);
  const profile = await getCurrentProfile(userId);
  if (!profile) return;
  const passes = hasPhilippinePhoneVerification({
    role: profile.role ?? null,
    phone_verified: profile.phone_verified === true,
    phone_verified_at: profile.phone_verified_at ?? null,
    provider: profile.provider ?? profile.auth_provider ?? null,
    auth_provider: profile.auth_provider ?? profile.provider ?? null,
    email: profile.email ?? null,
  });
  if (passes) {
    rememberPhoneVerifiedPositiveProfile(userId, profile);
  }
}

export async function patchProfileDisplayName(
  sb: SupabaseClient,
  userId: string,
  displayName: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = String(displayName ?? "").trim().slice(0, 20);
  if (!trimmed) return { ok: true };
  const { error } = await sb
    .from("profiles")
    .update({ display_name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) return { ok: false, message: error.message || "profile_display_name_update_failed" };
  return { ok: true };
}
