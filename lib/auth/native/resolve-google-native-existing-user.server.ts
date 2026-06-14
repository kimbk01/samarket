import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findActiveProfileIdByProviderUserId,
  findActiveProfileIdsByEmail,
} from "@/lib/auth/active-profile-lookup";
import {
  buildGoogleNativeAuthEmail,
  GOOGLE_NATIVE_AUTH_EMAIL_DOMAIN,
} from "@/lib/auth/native/google-auth-env.server";
import { isGoogleNativeOrphanProfileRow, isReclaimableGoogleNativeOrphanProfile } from "@/lib/auth/native/reconcile-google-native-orphan.server";
import type { GoogleVerifiedIdentity } from "@/lib/auth/native/google-token-verify.server";
import { isDeletedStoreMember } from "@/lib/auth/store-member-policy";
import { findAuthUserByEmail } from "@/lib/auth/naver-oauth";

export type GoogleVerifiedEmailLookupResult =
  | { status: "found"; profileId: string }
  | { status: "none" }
  | { status: "ambiguous"; candidateIds: string[] };

export type ResolveGoogleNativeExistingUserResult =
  | { status: "found"; userId: string; match: GoogleNativeExistingUserMatch }
  | { status: "new" }
  | { status: "ambiguous_email"; candidateIds: string[] };

export type GoogleNativeExistingUserMatch =
  | "provider_user_id"
  | "verified_email"
  | "auth_identity_sub"
  | "auth_user_email"
  | "synthetic_orphan";

async function findProfileIdByGoogleProviderEmail(
  adminSb: SupabaseClient,
  email: string,
): Promise<string | null> {
  const { data, error } = await adminSb
    .from("profiles")
    .select("id, status, deleted_at")
    .eq("provider", "google")
    .or(`email.eq.${email},auth_login_email.eq.${email}`)
    .limit(5);
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const active = data.find((row) => !isDeletedStoreMember(row as { status?: string; deleted_at?: string | null }));
  if (!active) return null;
  const row = active as { id?: unknown };
  return typeof row.id === "string" ? row.id : null;
}

function isGoogleTaggedProfile(row: { provider?: unknown; auth_provider?: unknown }): boolean {
  const provider = String(row.provider ?? "").trim().toLowerCase();
  const authProvider = String(row.auth_provider ?? "").trim().toLowerCase();
  return provider === "google" || authProvider === "google";
}

/**
 * Verified Gmail → profiles 매칭.
 * - provider=google 행 1건 우선
 * - email 중복 2건 이상이고 google 태그가 유일하지 않으면 ambiguous (첫 후보 자동 선택 금지)
 */
export async function lookupProfileIdByVerifiedGoogleEmail(
  adminSb: SupabaseClient,
  verified: GoogleVerifiedIdentity,
): Promise<GoogleVerifiedEmailLookupResult> {
  if (!verified.emailVerified || !verified.email?.trim()) {
    return { status: "none" };
  }
  const email = verified.email.trim().toLowerCase();
  if (email.endsWith(`@${GOOGLE_NATIVE_AUTH_EMAIL_DOMAIN}`)) {
    return { status: "none" };
  }

  const fromGoogleProvider = await findProfileIdByGoogleProviderEmail(adminSb, email);
  if (fromGoogleProvider) {
    const googleProviderRow = await loadProfileOrphanRow(adminSb, fromGoogleProvider);
    if (!isGoogleNativeOrphanProfileRow(googleProviderRow, fromGoogleProvider)) {
      return { status: "found", profileId: fromGoogleProvider };
    }
  }

  const candidateIds = await findActiveProfileIdsByEmail(adminSb, email);
  if (candidateIds.length === 0) return { status: "none" };
  if (candidateIds.length === 1) {
    return { status: "found", profileId: candidateIds[0] ?? "" };
  }

  const { data } = await adminSb
    .from("profiles")
    .select("id, provider, auth_provider")
    .in("id", candidateIds)
    .limit(10);
  const rows = Array.isArray(data) ? data : [];
  const googleRows = rows.filter((row) => isGoogleTaggedProfile(row as { provider?: unknown; auth_provider?: unknown }));
  if (googleRows.length === 1) {
    const googleId = (googleRows[0] as { id?: unknown }).id;
    if (typeof googleId === "string" && googleId) {
      const googleRow = await loadProfileOrphanRow(adminSb, googleId);
      if (!isGoogleNativeOrphanProfileRow(googleRow, googleId)) {
        return { status: "found", profileId: googleId };
      }
    }
  }
  const nonGoogleRows = rows.filter(
    (row) => !isGoogleTaggedProfile(row as { provider?: unknown; auth_provider?: unknown }),
  );
  if (nonGoogleRows.length === 1) {
    const canonicalId = (nonGoogleRows[0] as { id?: unknown }).id;
    if (typeof canonicalId === "string" && canonicalId) {
      return { status: "found", profileId: canonicalId };
    }
  }
  if (googleRows.length === 1) {
    const googleId = (googleRows[0] as { id?: unknown }).id;
    if (typeof googleId === "string" && googleId) {
      return { status: "found", profileId: googleId };
    }
  }
  if (googleRows.length > 1) {
    return {
      status: "ambiguous",
      candidateIds: googleRows
        .map((row) => String((row as { id?: unknown }).id ?? ""))
        .filter(Boolean),
    };
  }

  return { status: "ambiguous", candidateIds };
}

/** Supabase Web Google OAuth — profiles.provider_user_id 없이 auth.identities 만 있는 경우 */
async function findAuthUserIdByGoogleSub(
  adminSb: SupabaseClient,
  googleUserId: string,
): Promise<string | null> {
  const sub = String(googleUserId ?? "").trim();
  if (!sub) return null;
  const perPage = 200;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminSb.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const users = Array.isArray(data?.users) ? data.users : [];
    for (const user of users) {
      const identities = Array.isArray(user.identities) ? user.identities : [];
      for (const identity of identities) {
        const provider = String((identity as { provider?: unknown }).provider ?? "").toLowerCase();
        if (provider !== "google") continue;
        const providerId = String((identity as { provider_id?: unknown }).provider_id ?? "").trim();
        const identityData = (identity as { identity_data?: Record<string, unknown> | null }).identity_data;
        const subFromData =
          identityData && typeof identityData === "object"
            ? String(identityData.sub ?? identityData.provider_id ?? "").trim()
            : "";
        if (providerId === sub || subFromData === sub) {
          return user.id;
        }
      }
    }
    if (users.length < perPage) break;
  }
  return null;
}

async function loadProfileOrphanRow(
  adminSb: SupabaseClient,
  profileId: string,
): Promise<{
  id: string;
  status?: string | null;
  email?: string | null;
  auth_login_email?: string | null;
  provider?: string | null;
  auth_provider?: string | null;
  provider_user_id?: string | null;
  deleted_at?: string | null;
} | null> {
  const { data } = await adminSb
    .from("profiles")
    .select("id, status, email, auth_login_email, provider, auth_provider, provider_user_id, deleted_at")
    .eq("id", profileId)
    .maybeSingle();
  if (!data || typeof (data as { id?: unknown }).id !== "string") return null;
  return data as {
    id: string;
    status?: string | null;
    email?: string | null;
    auth_login_email?: string | null;
    provider?: string | null;
    auth_provider?: string | null;
    provider_user_id?: string | null;
    deleted_at?: string | null;
  };
}

/**
 * Native Google exchange — 기존 회원 vs 신규 가입 구분.
 * 식별 우선순위: provider_user_id(sub) → verified Gmail → auth.identities → auth.users Gmail → synthetic orphan
 * 단, sub 가 orphan profile 에만 있고 verified Gmail 이 다른 canonical profile 과 일치하면 canonical 을 우선한다.
 */
export async function resolveGoogleNativeExistingUserId(
  adminSb: SupabaseClient,
  verified: GoogleVerifiedIdentity,
): Promise<ResolveGoogleNativeExistingUserResult> {
  const googleUserId = verified.googleUserId;

  const emailLookup = await lookupProfileIdByVerifiedGoogleEmail(adminSb, verified);
  const fromProfile = await findActiveProfileIdByProviderUserId(adminSb, "google", googleUserId);

  if (
    fromProfile
    && emailLookup.status === "found"
    && emailLookup.profileId
    && fromProfile !== emailLookup.profileId
  ) {
    const providerRow = await loadProfileOrphanRow(adminSb, fromProfile);
    if (isReclaimableGoogleNativeOrphanProfile(providerRow, fromProfile, emailLookup.profileId)) {
      return { status: "found", userId: emailLookup.profileId, match: "verified_email" };
    }
  }

  if (fromProfile) {
    return { status: "found", userId: fromProfile, match: "provider_user_id" };
  }

  if (emailLookup.status === "ambiguous") {
    return { status: "ambiguous_email", candidateIds: emailLookup.candidateIds };
  }
  if (emailLookup.status === "found" && emailLookup.profileId) {
    return { status: "found", userId: emailLookup.profileId, match: "verified_email" };
  }

  const fromAuthIdentity = await findAuthUserIdByGoogleSub(adminSb, googleUserId);
  if (fromAuthIdentity) {
    return { status: "found", userId: fromAuthIdentity, match: "auth_identity_sub" };
  }

  if (verified.emailVerified && verified.email?.trim()) {
    const fromVerifiedAuthEmail = await findAuthUserByEmail(adminSb, verified.email.trim().toLowerCase());
    if (fromVerifiedAuthEmail?.id) {
      return { status: "found", userId: fromVerifiedAuthEmail.id, match: "auth_user_email" };
    }
  }

  const syntheticEmail = buildGoogleNativeAuthEmail(googleUserId);
  const fromSyntheticAuth = await findAuthUserByEmail(adminSb, syntheticEmail);
  if (fromSyntheticAuth?.id) {
    return { status: "found", userId: fromSyntheticAuth.id, match: "synthetic_orphan" };
  }

  return { status: "new" };
}
