import type { SupabaseClient } from "@supabase/supabase-js";
import { findActiveProfileIdByProviderUserId } from "@/lib/auth/active-profile-lookup";
import {
  buildGoogleNativeAuthEmail,
  GOOGLE_NATIVE_AUTH_EMAIL_DOMAIN,
} from "@/lib/auth/native/google-auth-env.server";
import { findAuthUserByEmail } from "@/lib/auth/naver-oauth";
import { isDeletedStoreMember } from "@/lib/auth/store-member-policy";

type ProfileOrphanRow = {
  id?: string | null;
  status?: string | null;
  email?: string | null;
  auth_login_email?: string | null;
  provider?: string | null;
  auth_provider?: string | null;
  provider_user_id?: string | null;
  deleted_at?: string | null;
};

export function isGoogleNativeSyntheticAuthEmail(email: string | null | undefined): boolean {
  const normalized = String(email ?? "").trim().toLowerCase();
  return normalized.endsWith(`@${GOOGLE_NATIVE_AUTH_EMAIL_DOMAIN}`);
}

/** 기존 auth.users.email 유지 시 실제 Gmail, 신규·orphan 은 synthetic */
export function resolveGoogleNativeSignInEmail(
  authUserEmail: string | null | undefined,
  googleUserId: string,
): string {
  const trimmed = String(authUserEmail ?? "").trim();
  if (trimmed && !isGoogleNativeSyntheticAuthEmail(trimmed)) {
    return trimmed.toLowerCase();
  }
  return buildGoogleNativeAuthEmail(googleUserId);
}

export function isGoogleNativeOrphanProfileRow(profile: ProfileOrphanRow | null, profileId: string): boolean {
  return isReclaimableGoogleNativeOrphanProfile(profile, profileId, "__canonical__");
}

export function isReclaimableGoogleNativeOrphanProfile(
  profile: ProfileOrphanRow | null,
  holderId: string,
  canonicalUserId: string,
): boolean {
  if (holderId === canonicalUserId) return false;
  if (!profile?.id) return true;
  if (isDeletedStoreMember(profile)) return true;
  if (String(profile.id) !== holderId) return false;
  if (String(profile.status ?? "").trim() === "sns_pending") return true;

  const email = String(profile.auth_login_email ?? profile.email ?? "").trim().toLowerCase();
  if (!email || isGoogleNativeSyntheticAuthEmail(email)) return true;

  const provider = String(profile.provider ?? profile.auth_provider ?? "").trim().toLowerCase();
  return provider === "google";
}

async function deleteGoogleNativeOrphanAuthUser(
  adminSb: SupabaseClient,
  orphanUserId: string,
): Promise<void> {
  const { error } = await adminSb.auth.admin.deleteUser(orphanUserId);
  if (!error) return;

  const tombstoneEmail = `orphan.${orphanUserId.replace(/-/g, "")}.${Date.now()}@google.native.dibay.internal`;
  await adminSb.auth.admin
    .updateUserById(orphanUserId, { email: tombstoneEmail, email_confirm: true })
    .catch(() => undefined);
}

/**
 * 이전 Native 시도가 남긴 synthetic auth.users 가 canonical 계정의 email 변경·로그인을 막는 경우 정리한다.
 */
export async function reclaimGoogleNativeSyntheticAuthOrphan(
  adminSb: SupabaseClient,
  canonicalUserId: string,
  googleUserId: string,
): Promise<void> {
  const syntheticEmail = buildGoogleNativeAuthEmail(googleUserId);
  const holder = await findAuthUserByEmail(adminSb, syntheticEmail);
  const holderId = String(holder?.id ?? "").trim();
  if (!holderId || holderId === canonicalUserId) return;

  const { data: holderProfile } = await adminSb
    .from("profiles")
    .select("id, status, email, auth_login_email, provider, auth_provider, provider_user_id, deleted_at")
    .eq("id", holderId)
    .maybeSingle();

  if (!isReclaimableGoogleNativeOrphanProfile(holderProfile as ProfileOrphanRow | null, holderId, canonicalUserId)) {
    return;
  }

  await deleteGoogleNativeOrphanAuthUser(adminSb, holderId);
}

/**
 * 동일 Google sub 가 orphan profile 에만 붙어 있고 canonical 계정이 verified Gmail 인 경우 충돌을 해소한다.
 */
export async function reconcileGoogleNativeProviderProfileConflict(
  adminSb: SupabaseClient,
  canonicalUserId: string,
  googleUserId: string,
  verifiedGmail: string | null,
): Promise<void> {
  const conflictProfileId = await findActiveProfileIdByProviderUserId(adminSb, "google", googleUserId);
  if (!conflictProfileId || conflictProfileId === canonicalUserId) return;

  const { data: conflictRow } = await adminSb
    .from("profiles")
    .select("id, status, email, auth_login_email, provider, auth_provider, provider_user_id, deleted_at")
    .eq("id", conflictProfileId)
    .maybeSingle();
  if (!conflictRow) return;

  const row = conflictRow as ProfileOrphanRow;
  const conflictEmail = String(row.auth_login_email ?? row.email ?? "").trim().toLowerCase();
  const samePersonByEmail = Boolean(
    verifiedGmail
    && conflictEmail
    && conflictEmail === verifiedGmail.trim().toLowerCase(),
  );
  const reclaimableOrphan = isReclaimableGoogleNativeOrphanProfile(row, conflictProfileId, canonicalUserId);

  if (!samePersonByEmail && !reclaimableOrphan) return;

  await adminSb
    .from("profiles")
    .update({
      provider: null,
      auth_provider: null,
      provider_user_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conflictProfileId)
    .then(() => undefined, () => undefined);

  if (conflictProfileId !== canonicalUserId) {
    await deleteGoogleNativeOrphanAuthUser(adminSb, conflictProfileId);
  }
}
