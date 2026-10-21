import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findActiveProfileIdByProviderUserId } from "@/lib/auth/active-profile-lookup";
import {
  buildGoogleNativeAuthEmail,
  GOOGLE_NATIVE_AUTH_EMAIL_DOMAIN,
} from "@/lib/auth/native/google-auth-env.server";
import { findAuthUserByEmail } from "@/lib/auth/naver-oauth";

type ProfileOrphanRow = {
  id?: string | null;
  status?: string | null;
  member_status?: string | null;
  terms_accepted_at?: string | null;
  dibay_id_locked?: boolean | null;
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

const ORPHAN_PROFILE_SELECT =
  "id, status, member_status, terms_accepted_at, dibay_id_locked, email, auth_login_email, provider, auth_provider, provider_user_id, deleted_at";

/**
 * P1-8 — orphan 판정 축소: profile 행 없음, 또는 **콘텐츠 없는 pending**
 * (member_status=pending · 약관 미동의 · DIBAY ID 미잠금) 만. 활성·탈퇴·동의 회원은 절대 대상 아님.
 */
export function isReclaimableGoogleNativeOrphanProfile(
  profile: ProfileOrphanRow | null,
  holderId: string,
  canonicalUserId: string,
): boolean {
  if (!holderId || holderId === canonicalUserId) return false;
  if (!profile?.id) return true;
  if (String(profile.id) !== holderId) return false;
  if (String(profile.member_status ?? "").trim().toLowerCase() !== "pending") return false;
  if (String(profile.terms_accepted_at ?? "").trim()) return false;
  if (profile.dibay_id_locked === true) return false;
  if (String(profile.deleted_at ?? "").trim()) return false;
  return true;
}

function orphanTombstoneEmail(orphanUserId: string): string {
  return `orphan.${orphanUserId.replace(/-/g, "")}.${Date.now()}@${GOOGLE_NATIVE_AUTH_EMAIL_DOMAIN}`;
}

/**
 * P1-8 — hard delete 금지. landing pad 와 같은 tombstone:
 * email 을 tombstone 주소로 옮겨 synthetic email 을 비우고, 로그인 차단(ban) + metadata 표식.
 */
async function tombstoneGoogleNativeOrphanAuthUser(
  adminSb: SupabaseClient,
  orphanUserId: string,
  canonicalUserId: string,
): Promise<void> {
  let meta: Record<string, unknown> = {};
  try {
    const { data } = await adminSb.auth.admin.getUserById(orphanUserId);
    const current = data?.user?.user_metadata;
    if (current && typeof current === "object") meta = { ...(current as Record<string, unknown>) };
  } catch {
    /* metadata merge is best-effort */
  }
  meta.dibay_orphan_tombstone = true;
  meta.dibay_orphan_tombstone_at = new Date().toISOString();
  meta.dibay_orphan_canonical_hash = createHash("sha256").update(canonicalUserId || "none").digest("hex").slice(0, 12);

  try {
    await adminSb.auth.admin.updateUserById(orphanUserId, {
      email: orphanTombstoneEmail(orphanUserId),
      email_confirm: true,
      ban_duration: "876000h",
      user_metadata: meta,
    });
  } catch {
    /* best-effort — 실패해도 회원 삭제로 대체하지 않는다 */
  }
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
    .select(ORPHAN_PROFILE_SELECT)
    .eq("id", holderId)
    .maybeSingle();

  if (!isReclaimableGoogleNativeOrphanProfile(holderProfile as ProfileOrphanRow | null, holderId, canonicalUserId)) {
    return;
  }

  await tombstoneGoogleNativeOrphanAuthUser(adminSb, holderId, canonicalUserId);
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
    .select(ORPHAN_PROFILE_SELECT)
    .eq("id", conflictProfileId)
    .maybeSingle();
  if (!conflictRow) return;

  // P1-8 — email 일치만으로는 정리하지 않는다 (활성 회원 보호). 콘텐츠 없는 pending orphan 만.
  void verifiedGmail;
  const row = conflictRow as ProfileOrphanRow;
  if (!isReclaimableGoogleNativeOrphanProfile(row, conflictProfileId, canonicalUserId)) return;

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

  await tombstoneGoogleNativeOrphanAuthUser(adminSb, conflictProfileId, canonicalUserId);
}
