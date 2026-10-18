/**
 * B3 — member legal-consent authority for the central API mutation gate.
 * Same verdict as `getOnboardingStatus().signupComplete` (consent with CMS versions; privileged
 * Admin is consent-complete), without its address / phone / profile reads.
 *
 * Fail-closed: a read failure is UNAVAILABLE — never "consented".
 */

import { hasActiveAdminMembershipOrLegacyRole } from "@/lib/admin/admin-membership";
import { hasStoreTermsConsent } from "@/lib/auth/store-member-policy";
import { resolveRequiredConsentVersionsStrict } from "@/lib/legal/resolve-required-consent-versions";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export type MemberConsentAuthorityResult =
  | { kind: "CONSENTED"; via: "consent" | "privileged_admin" }
  | { kind: "CONSENT_REQUIRED"; requiredTermsVersion: string; requiredPrivacyVersion: string }
  | { kind: "UNAVAILABLE"; reason: "no_client" | "query_error" | "versions_unavailable" | "profile_missing" };

type ConsentRow = {
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  privacy_accepted_at?: string | null;
  privacy_version?: string | null;
  role?: string | null;
};

export async function resolveMemberConsentAuthority(userId: string): Promise<MemberConsentAuthorityResult> {
  const uid = String(userId ?? "").trim();
  const sb = tryCreateSupabaseServiceClient();
  if (!uid || !sb) return { kind: "UNAVAILABLE", reason: "no_client" };

  let required: Awaited<ReturnType<typeof resolveRequiredConsentVersionsStrict>>;
  try {
    required = await resolveRequiredConsentVersionsStrict();
  } catch {
    return { kind: "UNAVAILABLE", reason: "versions_unavailable" };
  }

  let row: ConsentRow | null = null;
  try {
    const res = await sb
      .from("profiles")
      .select("terms_accepted_at, terms_version, privacy_accepted_at, privacy_version, role")
      .eq("id", uid)
      .maybeSingle();
    if (res.error) return { kind: "UNAVAILABLE", reason: "query_error" };
    row = (res.data as ConsentRow | null) ?? null;
  } catch {
    return { kind: "UNAVAILABLE", reason: "query_error" };
  }
  if (!row) return { kind: "UNAVAILABLE", reason: "profile_missing" };

  if (hasStoreTermsConsent(row, required)) return { kind: "CONSENTED", via: "consent" };

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
  };
}
