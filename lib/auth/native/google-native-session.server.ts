import { createHash } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import {
  buildGoogleNativeAuthEmail,
  isGoogleNativeExchangeSessionEnabled,
} from "@/lib/auth/native/google-auth-env.server";
import type { GoogleVerifiedIdentity } from "@/lib/auth/native/google-token-verify.server";
import { deriveNativeExchangeGateFlags } from "@/lib/auth/native/native-provider-contract";
import {
  buildGoogleProviderCandidate,
  ensureProviderAuthIdentityRow,
  resolveNativeProviderSessionPrelude,
} from "@/lib/auth/provider-identity/native-session-bridge.server";
import type { ProviderEmailConflictDetail } from "@/lib/auth/provider-identity/types";
import {
  isGoogleNativeSyntheticAuthEmail,
  reclaimGoogleNativeSyntheticAuthOrphan,
  reconcileGoogleNativeProviderProfileConflict,
  resolveGoogleNativeSignInEmail,
} from "@/lib/auth/native/reconcile-google-native-orphan.server";
import { ensureAuthProfileForLogin } from "@/lib/auth/completion/ensure-auth-profile-for-login.server";
import { revokeSessionForWithdrawnMember } from "@/lib/auth/withdrawn-account-guard";
import { getOnboardingStatus } from "@/lib/auth/get-onboarding-status";
import { DIBAY_SIGNUP_TERMS_PATH } from "@/lib/auth/dibay-signup-status";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { resolveCommonAuthDestination } from "@/lib/auth/completion/resolve-common-auth-destination.server";
import type { EnsureUserProfileOutcome } from "@/lib/auth/ensure-user-profile";
import { sanitizeNextPath, withNextSearchParam } from "@/lib/auth/safe-next-path";
import { buildRequestSessionMeta } from "@/lib/auth/request-device-info";
import { findAuthUserByEmail } from "@/lib/auth/naver-oauth";
import { syncActiveSessionForUser } from "@/lib/auth/server-guards";
import { ensureProfileForUserId } from "@/lib/profile/ensure-profile-for-user-id";

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
      conflict?: ProviderEmailConflictDetail & { stashToken: string };
    };

async function updateGoogleAuthUserById(
  adminSb: SupabaseClient,
  userId: string,
  args: {
    verified: GoogleVerifiedIdentity;
  },
): Promise<{ userId: string; isNewUser: boolean; signInEmail: string } | GoogleNativeSessionResult> {
  const syntheticEmail = resolveAuthEmailForGoogleUser(args.verified.googleUserId);
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

  const existingEmail = String(existingUserData.user.email ?? "").trim();
  await reclaimGoogleNativeSyntheticAuthOrphan(adminSb, userId, args.verified.googleUserId);

  const updatePayload: {
    password: string;
    email_confirm: boolean;
    user_metadata: Record<string, unknown>;
    email?: string;
  } = {
    password,
    email_confirm: true,
    user_metadata: metadata,
  };
  if (!existingEmail || isGoogleNativeSyntheticAuthEmail(existingEmail)) {
    updatePayload.email = syntheticEmail;
  }

  const { error: updateError } = await adminSb.auth.admin.updateUserById(userId, updatePayload);
  if (updateError) {
    return {
      ok: false,
      errorCode: "provider_account_conflict",
      message: updateError.message || "Failed to update Google auth user",
      status: 409,
    };
  }

  const { data: refreshedUserData } = await adminSb.auth.admin.getUserById(userId);
  const signInEmail = resolveGoogleNativeSignInEmail(refreshedUserData?.user?.email, args.verified.googleUserId);
  return { userId, isNewUser: false, signInEmail };
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
): Promise<{ userId: string; isNewUser: boolean; signInEmail: string } | GoogleNativeSessionResult> {
  const authEmail = resolveAuthEmailForGoogleUser(args.verified.googleUserId);
  const password = buildGoogleSupabasePassword(args.verified.googleUserId);
  const metadata = buildGoogleUserMetadata(args.verified);

  if (args.existingUserId) {
    return updateGoogleAuthUserById(adminSb, args.existingUserId, { verified: args.verified });
  }

  await reclaimGoogleNativeSyntheticAuthOrphan(adminSb, "", args.verified.googleUserId);

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
  return { userId: created.user.id, isNewUser: true, signInEmail: authEmail };
}

/** Slice 7-4 PLAN_I2 Identity column writer — verified Google token → provider* (soft). */
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
  const candidate = buildGoogleProviderCandidate(input.verified);
  const prelude = await resolveNativeProviderSessionPrelude(ctx.adminSb, candidate);
  if (!prelude.ok) {
    return {
      ok: false,
      errorCode: prelude.errorCode,
      message: prelude.message,
      status: prelude.status,
      conflict: prelude.conflict,
    };
  }
  const existingUserId = prelude.existingUserId;

  const upsert = await upsertGoogleAuthUser(ctx.adminSb, {
    existingUserId: existingUserId,
    verified: input.verified,
  });
  if ("ok" in upsert) return upsert;

  const { userId, isNewUser, signInEmail } = upsert;
  const password = buildGoogleSupabasePassword(googleUserId);

  const { data: signInData, error: signInError } = await ctx.routeSb.auth.signInWithPassword({
    email: signInEmail,
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

  if (userId !== signedUser.id) {
    const verifiedGmailForMismatch =
      input.verified.emailVerified && input.verified.email?.trim()
        ? input.verified.email.trim().toLowerCase()
        : null;
    if (verifiedGmailForMismatch) {
      const authByEmail = await findAuthUserByEmail(ctx.adminSb, verifiedGmailForMismatch);
      if (authByEmail?.id === signedUser.id) {
        /* profiles 매칭 id 와 auth.users Gmail 보유 id 가 어긋난 경우 — 세션 user 기준으로 진행 */
      } else {
        return {
          ok: false,
          errorCode: "provider_account_conflict",
          message: "Google session user does not match the linked account",
          status: 409,
        };
      }
    } else {
      return {
        ok: false,
        errorCode: "provider_account_conflict",
        message: "Google session user does not match the linked account",
        status: 409,
      };
    }
  }

  const withdrawalState = await revokeSessionForWithdrawnMember(
    ctx.routeSb,
    ctx.response,
    signedUser.id,
    ctx.adminSb,
  );
  if (withdrawalState === "withdrawn") {
    return {
      ok: false,
      errorCode: "account_withdrawn",
      message: "탈퇴한 계정입니다. 동일 계정으로 다시 이용하려면 관리자에게 문의해 주세요.",
      status: 403,
    };
  }

  const syntheticUser = syntheticUserForEnsure(signedUser.id, input.verified);
  const verifiedGmail =
    input.verified.emailVerified && input.verified.email?.trim()
      ? input.verified.email.trim().toLowerCase()
      : null;

  // Slice 7-2 PLAN_G2: reconcile before enrich; single ensureAuthProfileForLogin(true)
  // absorbs pending + member ensure (no pre-reconcile enrich=false facade).
  await reconcileGoogleNativeProviderProfileConflict(
    ctx.adminSb,
    signedUser.id,
    googleUserId,
    verifiedGmail,
  );

  let profileOutcome: EnsureUserProfileOutcome | null = null;
  try {
    const ensured = await ensureAuthProfileForLogin(ctx.adminSb, syntheticUser, {
      enrichMemberProfile: true,
    });
    profileOutcome = ensured.ensureUserProfileOutcome;
  } catch {
    /* 클라 ensure 폴백 */
  }
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

  try {
    await ensureProviderAuthIdentityRow(ctx.adminSb, signedUser.id, candidate);
  } catch {
    return {
      ok: false,
      errorCode: "provider_account_conflict",
      message: "Google provider_user_id conflicts with another profile",
      status: 409,
    };
  }

  const ensuredProfile = await ensureProfileForUserId(ctx.adminSb, signedUser.id);
  if (!ensuredProfile?.id) {
    return {
      ok: false,
      errorCode: "profile_ensure_failed",
      message: "프로필 동기화에 실패했습니다. 다시 로그인해 주세요.",
      status: 500,
    };
  }

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
    const resolved = await resolveCommonAuthDestination(ctx.adminSb, {
      userId: signedUser.id,
      next: safeNext,
      status,
    });
    redirectTo = resolved.destination || redirectTo;
  } catch {
    /* web callback 와 동일 — 조회 실패 시 약관 화면 (메인·deep link 직행 금지) */
    redirectTo = withNextSearchParam(DIBAY_SIGNUP_TERMS_PATH, safeNext);
    needsTermsAgreement = true;
    signupComplete = false;
  }

  if (isNewUser) {
    needsTermsAgreement = true;
    signupComplete = false;
    redirectTo = withNextSearchParam(DIBAY_SIGNUP_TERMS_PATH, safeNext);
  }

  const sessionMeta = buildRequestSessionMeta(ctx.request);
  const authEmail = resolveAuthEmailForGoogleUser(googleUserId);
  await syncActiveSessionForUser(signedUser.id, ctx.response, {
    sessionMeta,
    loginIdentifier: verifiedGmail ?? authEmail,
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
