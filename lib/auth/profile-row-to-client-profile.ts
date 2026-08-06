import type { Profile } from "@/lib/types/profile";
import type { ProfileRow } from "@/lib/profile/types";
import { withDefaultAvatar } from "@/lib/profile/default-avatar";
import { resolveDisplayName } from "@/lib/users/user-label";
import { resolveProfilePhoneDb09 } from "@/lib/profile/resolve-profile-phone";
import { resolveTrustScoreAuthority } from "@/lib/trust/trust-score-ssot";

/** `/api/me/profile`·RLS 조회 결과를 앱 `Profile`(헤더·게이트) 형태로 맞춘다. */
export function profileRowToClientProfile(row: ProfileRow): Profile {
  const nick = resolveDisplayName(row);
  const temp = resolveTrustScoreAuthority({
    trust_score: row.trust_score,
    manner_score: row.manner_score,
  });
  return {
    id: row.id,
    email: row.email ?? "",
    display_name: row.display_name?.trim() || nick,
    nickname: nick,
    avatar_url: withDefaultAvatar(row.avatar_url),
    username: row.dibay_id ?? row.username ?? null,
    dibay_id: row.dibay_id ?? null,
    dibay_id_locked: row.dibay_id_locked === true,
    dibay_id_auto_assigned: row.dibay_id_auto_assigned === true,
    dibay_id_initial: row.dibay_id_initial ?? null,
    dibay_id_changed_once: row.dibay_id_changed_once === true,
    dibay_id_changed_at: row.dibay_id_changed_at ?? null,
    username_confirmed: row.username_confirmed ?? null,
    onboarding_status: row.onboarding_status ?? null,
    onboarding_completed_at: row.onboarding_completed_at ?? null,
    profile_completed: row.profile_completed === true,
    role: row.role,
    status: row.status,
    member_type: row.member_type,
    phone: resolveProfilePhoneDb09(row),
    phone_country_code: row.phone_country_code ?? null,
    phone_number: row.phone_number ?? null,
    phone_verified: row.phone_verified === true,
    phone_verified_at: row.phone_verified_at ?? null,
    phone_verification_status: row.phone_verification_status,
    auth_login_email: row.auth_login_email ?? null,
    provider: row.provider ?? row.auth_provider,
    auth_provider: row.auth_provider,
    member_status: row.member_status ?? null,
    is_admin: row.is_admin,
    terms_accepted_at: row.terms_accepted_at ?? null,
    terms_version: row.terms_version ?? null,
    privacy_accepted_at: row.privacy_accepted_at ?? null,
    privacy_version: row.privacy_version ?? null,
    deleted_at: row.deleted_at ?? null,
    manual_account_type: row.manual_account_type ?? null,
    temperature: typeof temp === "number" && Number.isFinite(temp) ? temp : 50,
    trust_score: row.trust_score ?? null,
  };
}
