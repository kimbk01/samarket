import { createHash } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import {
  buildGoogleNativeAuthEmail,
  isGoogleNativeExchangeSessionEnabled,
} from "@/lib/auth/native/google-auth-env.server";
import type { GoogleVerifiedIdentity } from "@/lib/auth/native/google-token-verify.server";
import { deriveNativeExchangeGateFlags } from "@/lib/auth/native/native-provider-contract";
import { ensureUserProfile } from "@/lib/auth/ensure-user-profile";
import { getOnboardingStatus } from "@/lib/auth/get-onboarding-status";
import { ensurePendingAuthProfileRow } from "@/lib/auth/member-access";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { resolvePostLoginRoute } from "@/lib/auth/resolve-post-login-route";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { buildRequestSessionMeta } from "@/lib/auth/request-device-info";
import { findAuthUserByEmail } from "@/lib/auth/naver-oauth";
import { syncActiveSessionForUser } from "@/lib/auth/server-guards";

export function buildGoogleSupabasePassword(googleUserId: string): string {
  const seed =
    process.env.GOOGLE_NATIVE_PASSWORD_SEED?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || "dibay-google-native";
  const digest = createHash("sha256").update(`${seed}:google:${googleUserId}`).digest("base64url");
  return `Gg#${digest.slice(0, 48)}!`;
}

export type GoogleNativeSessionContext = {
  adminSb: SupabaseClient;
  routeSb: SupabaseClient;
  request: NextRequest;
  response: NextResponse;
};

export type GoogleNativeSessionResult =
  | {
      ok: true;
      userId: string;
      redirectTo: string;
      signupComplete: boolean;
      sessionEstablished: true;
      isNewUser: boolean;
      needsProfileCompletion: boolean;
      needsTermsAgreement: boolean;
    }
  | {
      ok: false;
      errorCode: string;
      message: string;
      status: number;
    };

async function findProfileIdByGoogleUserId(
  adminSb: SupabaseClient,
  googleUserId: string,
): Promise<string | null> {
  const { data, error } = await adminSb
    .from("profiles")
    .select("id")
    .eq("provider", "google")
    .eq("provider_user_id", googleUserId)
    .limit(1);
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as { id?: unknown };
  return typeof row.id === "string" ? row.id : null;
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

async function resolveExistingGoogleUserId(
  adminSb: SupabaseClient,
  googleUserId: string,
): Promise<string | null> {
  const fromProfile = await findProfileIdByGoogleUserId(adminSb, googleUserId);
  if (fromProfile) return fromProfile;

  /** 이전 Native 시도가 synthetic auth user 만 남긴 경우 — createUser 중복 방지 */
  const syntheticEmail = resolveAuthEmailForGoogleUser(googleUserId);
  const fromSyntheticAuth = await findAuthUserByEmail(adminSb, syntheticEmail);
  if (fromSyntheticAuth?.id) return fromSyntheticAuth.id;

  return findAuthUserIdByGoogleSub(adminSb, googleUserId);
}

async function updateGoogleAuthUserById(
  adminSb: SupabaseClient,
  userId: string,
  args: {
    verified: GoogleVerifiedIdentity;
  },
): Promise<{ userId: string; isNewUser: boolean } | GoogleNativeSessionResult> {
  const authEmail = resolveAuthEmailForGoogleUser(args.verified.googleUserId);
  const password = buildGoogleSupabasePassword(args.verified.googleUserId);
  const metadata = buildGoogleUserMetadata(args.verified);

  const { data: existingUserData, error: getUserError } = await adminSb.auth.admin.getUserById(userId);
  if (getUserError || !existingUserData.user) {
    return {
      ok: false,
      errorCode: "provider_account_conflict",
      message: "Google account profile exists but auth user is missing",
      status: 409,
    };
  }
  const { error: updateError } = await adminSb.auth.admin.updateUserById(userId, {
    password,
    email: authEmail,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (updateError) {
    return {
      ok: false,
      errorCode: "provider_account_conflict",
      message: updateError.message || "Failed to update Google auth user",
      status: 409,
    };
  }
  return { userId, isNewUser: false };
}

function buildGoogleUserMetadata(verified: GoogleVerifiedIdentity): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    provider: "google",
    google_id: verified.googleUserId,
  };
  if (verified.name) metadata.full_name = verified.name;
  if (verified.picture) metadata.avatar_url = verified.picture;
  if (verified.email && verified.emailVerified) {
    metadata.google_email_hint = verified.email;
  }
  return metadata;
}

function resolveAuthEmailForGoogleUser(googleUserId: string): string {
  return buildGoogleNativeAuthEmail(googleUserId);
}

async function upsertGoogleAuthUser(
  adminSb: SupabaseClient,
  args: {
    existingUserId: string | null;
    verified: GoogleVerifiedIdentity;
  },
): Promise<{ userId: string; isNewUser: boolean } | GoogleNativeSessionResult> {
  const authEmail = resolveAuthEmailForGoogleUser(args.verified.googleUserId);
  const password = buildGoogleSupabasePassword(args.verified.googleUserId);
  const metadata = buildGoogleUserMetadata(args.verified);

  if (args.existingUserId) {
    return updateGoogleAuthUserById(adminSb, args.existingUserId, { verified: args.verified });
  }

  const { data: created, error: createError } = await adminSb.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (createError || !created.user) {
    const recovered = await findAuthUserByEmail(adminSb, authEmail);
    if (recovered?.id) {
      return updateGoogleAuthUserById(adminSb, recovered.id, { verified: args.verified });
    }
    return {
      ok: false,
      errorCode: "provider_account_conflict",
      message: createError?.message || "Failed to create Google auth user",
      status: 409,
    };
  }
  return { userId: created.user.id, isNewUser: true };
}

async function persistGoogleProfileIdentity(
  adminSb: SupabaseClient,
  userId: string,
  verified: GoogleVerifiedIdentity,
): Promise<void> {
  const patch: Record<string, unknown> = {
    provider: "google",
    auth_provider: "google",
    provider_user_id: verified.googleUserId,
    updated_at: new Date().toISOString(),
  };
  if (verified.email && verified.emailVerified) {
    patch.auth_login_email = verified.email;
  }
  await adminSb.from("profiles").update(patch).eq("id", userId).then(() => undefined, () => undefined);
}

function syntheticUserForEnsure(userId: string, verified: GoogleVerifiedIdentity): User {
  const authEmail = resolveAuthEmailForGoogleUser(verified.googleUserId);
  return {
    id: userId,
    email: authEmail,
    app_metadata: { provider: "google" },
    user_metadata: buildGoogleUserMetadata(verified),
    aud: "authenticated",
    created_at: new Date().toISOString(),
    identities: [
      {
        id: verified.googleUserId,
        user_id: userId,
        provider: "google",
        identity_id: verified.googleUserId,
        identity_data: { sub: verified.googleUserId, provider: "google" },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
      },
    ],
  } as unknown as User;
}

export async function establishGoogleNativeSession(
  ctx: GoogleNativeSessionContext,
  input: {
    verified: GoogleVerifiedIdentity;
    next?: string | null;
  },
): Promise<GoogleNativeSessionResult> {
  if (!isGoogleNativeExchangeSessionEnabled()) {
    return {
      ok: false,
      errorCode: "google_native_exchange_disabled",
      message: "Google native session exchange is disabled — set AUTH_GOOGLE_NATIVE_EXCHANGE_ENABLED=true",
      status: 503,
    };
  }

  const googleUserId = input.verified.googleUserId;
  const safeNext = sanitizeNextPath(input.next ?? null);
  const existingUserId = await resolveExistingGoogleUserId(ctx.adminSb, googleUserId);

  const upsert = await upsertGoogleAuthUser(ctx.adminSb, {
    existingUserId: existingUserId,
    verified: input.verified,
  });
  if ("ok" in upsert) return upsert;

  const { userId, isNewUser } = upsert;
  const authEmail = resolveAuthEmailForGoogleUser(googleUserId);
  const password = buildGoogleSupabasePassword(googleUserId);

  const { data: signInData, error: signInError } = await ctx.routeSb.auth.signInWithPassword({
    email: authEmail,
    password,
  });
  if (signInError || !signInData.user) {
    return {
      ok: false,
      errorCode: "google_native_session_failed",
      message: signInError?.message || "Google native Supabase session creation failed",
      status: 500,
    };
  }

  const signedUser = signInData.user;
  const syntheticUser = syntheticUserForEnsure(signedUser.id, input.verified);

  try {
    await ensurePendingAuthProfileRow(ctx.adminSb, syntheticUser, {
      authProvider: "google",
      nicknameCandidate: input.verified.name ?? null,
      avatarCandidate: input.verified.picture ?? null,
      emailInternal: input.verified.emailVerified ? input.verified.email ?? null : null,
    });
  } catch {
    /* 클라 ensure 폴백 */
  }

  const profileOutcome = await ensureUserProfile(ctx.adminSb, syntheticUser).catch(() => null);
  if (profileOutcome?.duplicateWarning) {
    const conflictByProvider = profileOutcome.duplicateCandidates?.some((id) => id !== signedUser.id);
    if (conflictByProvider) {
      return {
        ok: false,
        errorCode: "provider_account_conflict",
        message: "Google provider_user_id conflicts with another profile",
        status: 409,
      };
    }
  }

  await persistGoogleProfileIdentity(ctx.adminSb, signedUser.id, input.verified);

  let redirectTo = safeNext ?? POST_LOGIN_PATH;
  let signupComplete = false;
  let needsProfileCompletion = true;
  let needsTermsAgreement = true;
  try {
    const status = await getOnboardingStatus(ctx.adminSb, signedUser.id);
    signupComplete = status.signupComplete;
    const gateFlags = deriveNativeExchangeGateFlags({
      consentComplete: status.consentComplete,
      dibayIdComplete: status.dibayIdComplete,
      profileComplete: status.profileComplete,
      signupComplete: status.signupComplete,
    });
    needsProfileCompletion = gateFlags.needsProfileCompletion;
    needsTermsAgreement = gateFlags.needsTermsAgreement;
    redirectTo =
      resolvePostLoginRoute({
        hasSession: true,
        status,
        next: safeNext,
      }) ?? redirectTo;
  } catch {
    /* 약관 gate fallback */
  }

  const sessionMeta = buildRequestSessionMeta(ctx.request);
  await syncActiveSessionForUser(signedUser.id, ctx.response, {
    sessionMeta,
    loginIdentifier: authEmail,
    request: ctx.request,
  }).catch(() => undefined);

  return {
    ok: true,
    userId: signedUser.id,
    redirectTo,
    signupComplete,
    sessionEstablished: true,
    isNewUser,
    needsProfileCompletion,
    needsTermsAgreement,
  };
}
