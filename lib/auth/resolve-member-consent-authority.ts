/**
 * B3 — member legal-consent authority for the central API mutation gate.
 * Same verdict as `getOnboardingStatus().signupComplete` (consent with CMS versions; privileged
 * Admin is consent-complete), without its address / phone / profile reads.
 *
 * Fail-closed: a read failure is UNAVAILABLE — never "consented".
 */

import { hasActiveAdminMembershipOrLegacyRole } from "@/lib/admin/admin-membership";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";
import {
  hasRequiredMemberConsents,
  resolveRequiredConsentGap,
  type RequiredConsentGap,
} from "@/lib/legal/has-required-member-consents";
import { readMemberAgeGateLegacy } from "@/lib/legal/member-age-gate-legacy.server";
import { resolveRequiredConsentVersionsStrict } from "@/lib/legal/resolve-required-consent-versions";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export type MemberConsentAuthorityResult =
  | { kind: "CONSENTED"; via: "consent" | "privileged_admin" }
  | {
      kind: "CONSENT_REQUIRED";
      requiredTermsVersion: string;
      requiredPrivacyVersion: string;
      gap: Exclude<RequiredConsentGap, null>;
    }
  | { kind: "UNAVAILABLE"; reason: "no_client" | "query_error" | "versions_unavailable" | "profile_missing" };

/**
 * 쓰기 검사가 `member_write_gate_snapshot` 1회로 이미 읽은 동의 행·활성 관리자 역할.
 * 넘기면 profiles·admin_memberships 를 다시 읽지 않는다 — 판정식은 같다.
 */
export type MemberConsentPreloaded = {
  row: ConsentRow;
  /** 활성 admin_memberships.role — 없으면 null */
  adminRole: string | null;
};

type ConsentRow = {
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  privacy_accepted_at?: string | null;
  privacy_version?: string | null;
  date_of_birth?: string | null;
  age_gate_status?: string | null;
  age_attested_at?: string | null;
  age_gate_legacy?: boolean | null;
  role?: string | null;
};

export async function resolveMemberConsentAuthority(
  userId: string,
  preloaded?: MemberConsentPreloaded
): Promise<MemberConsentAuthorityResult> {
  const uid = String(userId ?? "").trim();
  const sb = tryCreateSupabaseServiceClient();
  if (!uid || !sb) return { kind: "UNAVAILABLE", reason: "no_client" };

  let required: Awaited<ReturnType<typeof resolveRequiredConsentVersionsStrict>>;
  try {
    required = await resolveRequiredConsentVersionsStrict();
  } catch {
    return { kind: "UNAVAILABLE", reason: "versions_unavailable" };
  }

  if (preloaded) {
    if (hasRequiredMemberConsents(preloaded.row, required)) return { kind: "CONSENTED", via: "consent" };
    // 판정식 = hasActiveAdminMembershipOrLegacyRole (활성 membership role 이 admin·super_admin)
    if (isPrivilegedAdminRole(preloaded.adminRole)) return { kind: "CONSENTED", via: "privileged_admin" };
    return {
      kind: "CONSENT_REQUIRED",
      requiredTermsVersion: required.termsVersion,
      requiredPrivacyVersion: required.privacyVersion,
      gap: resolveRequiredConsentGap(preloaded.row, required) ?? "terms_privacy_and_age",
    };
  }

  let row: ConsentRow | null = null;
  try {
    const res = await sb
      .from("profiles")
      .select(
        "terms_accepted_at, terms_version, privacy_accepted_at, privacy_version, date_of_birth, age_gate_status, age_attested_at, role",
      )
      .eq("id", uid)
      .maybeSingle();
    if (res.error) {
      // Pre-migration: age columns missing — retry without age (fail-closed as incomplete).
      const retry = await sb
        .from("profiles")
        .select("terms_accepted_at, terms_version, privacy_accepted_at, privacy_version, role")
        .eq("id", uid)
        .maybeSingle();
      if (retry.error) return { kind: "UNAVAILABLE", reason: "query_error" };
      row = (retry.data as ConsentRow | null) ?? null;
    } else {
      row = (res.data as ConsentRow | null) ?? null;
    }
  } catch {
    return { kind: "UNAVAILABLE", reason: "query_error" };
  }
  if (!row) return { kind: "UNAVAILABLE", reason: "profile_missing" };

  const legacy = await readMemberAgeGateLegacy(sb, uid);
  if (!legacy.ok) return { kind: "UNAVAILABLE", reason: "query_error" };
  row = { ...row, age_gate_legacy: legacy.legacy };

  if (hasRequiredMemberConsents(row, required)) return { kind: "CONSENTED", via: "consent" };

  // deriveDibaySignupStatus: privileged Admin is signup-complete (membership authority).
  try {
    if (await hasActiveAdminMembershipOrLegacyRole(sb, uid, row.role ?? null)) {
      return { kind: "CONSENTED", via: "privileged_admin" };
    }
  } catch {
    return { kind: "UNAVAILABLE", reason: "query_error" };
  }

  return {
    kind: "CONSENT_REQUIRED",
    requiredTermsVersion: required.termsVersion,
    requiredPrivacyVersion: required.privacyVersion,
    gap: resolveRequiredConsentGap(row, required) ?? "terms_privacy_and_age",
  };
}
