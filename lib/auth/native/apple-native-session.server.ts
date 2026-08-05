import { createHash } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import {
  buildAppleNativeAuthEmail,
  isAppleNativeExchangeSessionEnabled,
  isApplePrivateRelayEmail,
} from "@/lib/auth/native/apple-auth-env.server";
import type { AppleVerifiedIdentityToken } from "@/lib/auth/native/apple-token-verify.server";
import { deriveNativeExchangeGateFlags } from "@/lib/auth/native/native-provider-contract";
import {
  buildAppleProviderCandidate,
  ensureProviderAuthIdentityRow,
  resolveNativeProviderSessionPrelude,
} from "@/lib/auth/provider-identity/native-session-bridge.server";
import type { ProviderEmailConflictDetail } from "@/lib/auth/provider-identity/types";
import { ensureAuthProfileForLogin } from "@/lib/auth/completion/ensure-auth-profile-for-login.server";
import { findAuthUserByEmail } from "@/lib/auth/naver-oauth";
import { revokeSessionForWithdrawnMember } from "@/lib/auth/withdrawn-account-guard";
import { getOnboardingStatus } from "@/lib/auth/get-onboarding-status";
import { DIBAY_SIGNUP_TERMS_PATH } from "@/lib/auth/dibay-signup-status";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { resolveCommonAuthDestination } from "@/lib/auth/completion/resolve-common-auth-destination.server";
import type { EnsureUserProfileOutcome } from "@/lib/auth/ensure-user-profile";
import { sanitizeNextPath, withNextSearchParam } from "@/lib/auth/safe-next-path";
import { buildRequestSessionMeta } from "@/lib/auth/request-device-info";
import { syncActiveSessionForUser } from "@/lib/auth/server-guards";

export function buildAppleSupabasePassword(sub: string): string {
  const seed =
    process.env.APPLE_NATIVE_PASSWORD_SEED?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || "dibay-apple-native";
  const digest = createHash("sha256").update(`${seed}:apple:${sub}`).digest("base64url");
  return `Ap#${digest.slice(0, 48)}!`;
}

export type AppleNativeSessionContext = {
  adminSb: SupabaseClient;
  routeSb: SupabaseClient;
  request: NextRequest;
  response: NextResponse;
};

export type AppleNativeSessionResult =
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

function buildAppleUserMetadata(
  verified: AppleVerifiedIdentityToken,
  userIdentifier?: string | null,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    provider: "apple",
    apple_sub: verified.sub,
  };
  const uid = String(userIdentifier ?? "").trim();
  if (uid) metadata.apple_user_identifier = uid;
  if (verified.email && !verified.isPrivateRelayEmail) {
    metadata.email = verified.email;
  }
  return metadata;
}

function resolveAuthEmailForAppleUser(verified: AppleVerifiedIdentityToken): string {
  /** email 병합 금지 — Auth email 은 sub 기반 synthetic 고정 */
  return buildAppleNativeAuthEmail(verified.sub);
}

function resolveProfileEmailHint(verified: AppleVerifiedIdentityToken): string | null {
  if (!verified.email || verified.isPrivateRelayEmail) return null;
  return verified.email;
}

async function upsertAppleAuthUser(
  adminSb: SupabaseClient,
  args: {
    existingUserId: string | null;
    verified: AppleVerifiedIdentityToken;
    userIdentifier?: string | null;
  },
): Promise<{ userId: string; isNewUser: boolean } | AppleNativeSessionResult> {
  const authEmail = resolveAuthEmailForAppleUser(args.verified);
  const password = buildAppleSupabasePassword(args.verified.sub);
  const metadata = buildAppleUserMetadata(args.verified, args.userIdentifier);

  if (args.existingUserId) {
    const { data: existingUserData, error: getUserError } = await adminSb.auth.admin.getUserById(
      args.existingUserId,
    );
    if (getUserError || !existingUserData.user) {
      return {
        ok: false,
        errorCode: "provider_account_conflict",
        message: "Apple account profile exists but auth user is missing",
        status: 409,
      };
    }
    const { error: updateError } = await adminSb.auth.admin.updateUserById(args.existingUserId, {
      password,
      email: authEmail,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (updateError) {
      return {
        ok: false,
        errorCode: "provider_account_conflict",
        message: updateError.message || "Failed to update Apple auth user",
        status: 409,
      };
    }
    return { userId: args.existingUserId, isNewUser: false };
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
      return upsertAppleAuthUser(adminSb, {
        existingUserId: recovered.id,
        verified: args.verified,
        userIdentifier: args.userIdentifier,
      });
    }
    return {
      ok: false,
      errorCode: "provider_account_conflict",
      message: createError?.message || "Failed to create Apple auth user",
      status: 409,
    };
  }
  return { userId: created.user.id, isNewUser: true };
}

async function persistAppleProfileIdentity(
  adminSb: SupabaseClient,
  userId: string,
  verified: AppleVerifiedIdentityToken,
): Promise<void> {
  const patch: Record<string, unknown> = {
    provider: "apple",
    auth_provider: "apple",
    provider_user_id: verified.sub,
    updated_at: new Date().toISOString(),
  };
  const profileEmail = resolveProfileEmailHint(verified);
  if (profileEmail) {
    patch.auth_login_email = profileEmail;
  }
  await adminSb.from("profiles").update(patch).eq("id", userId).then(() => undefined, () => undefined);
}

function syntheticUserForEnsure(userId: string, verified: AppleVerifiedIdentityToken): User {
  const authEmail = resolveAuthEmailForAppleUser(verified);
  return {
    id: userId,
    email: authEmail,
    app_metadata: { provider: "apple" },
    user_metadata: buildAppleUserMetadata(verified),
    aud: "authenticated",
    created_at: new Date().toISOString(),
    identities: [
      {
        id: verified.sub,
        user_id: userId,
        provider: "apple",
        identity_id: verified.sub,
        identity_data: { sub: verified.sub, provider: "apple" },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
      },
    ],
  } as unknown as User;
}

/**
 * Supabase session — Admin API user upsert + route handler signInWithPassword (Naver 패턴).
 * signInWithIdToken 은 현재 @supabase/auth-js 에 없음.
 */
export async function establishAppleNativeSession(
  ctx: AppleNativeSessionContext,
  input: {
    verified: AppleVerifiedIdentityToken;
    userIdentifier?: string | null;
    next?: string | null;
  },
): Promise<AppleNativeSessionResult> {
  if (!isAppleNativeExchangeSessionEnabled()) {
    return {
      ok: false,
      errorCode: "native_exchange_not_implemented",
      message: "Apple native session exchange is disabled — set AUTH_APPLE_NATIVE_EXCHANGE_ENABLED=true",
      status: 501,
    };
  }

  const sub = input.verified.sub;
  const userIdentifier = String(input.userIdentifier ?? "").trim();
  if (userIdentifier && userIdentifier !== sub) {
    return {
      ok: false,
      errorCode: "apple_token_verify_failed",
      message: "Apple user identifier does not match verified token sub",
      status: 401,
    };
  }

  const safeNext = sanitizeNextPath(input.next ?? null);
  const candidate = buildAppleProviderCandidate(input.verified, userIdentifier);
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
  const existingProfileId = prelude.existingUserId;

  const upsert = await upsertAppleAuthUser(ctx.adminSb, {
    existingUserId: existingProfileId,
    verified: input.verified,
    userIdentifier,
  });
  if ("ok" in upsert) return upsert;

  const { userId, isNewUser } = upsert as { userId: string; isNewUser: boolean };
  const authEmail = resolveAuthEmailForAppleUser(input.verified);
  const password = buildAppleSupabasePassword(sub);

  const { data: signInData, error: signInError } = await ctx.routeSb.auth.signInWithPassword({
    email: authEmail,
    password,
  });
  if (signInError || !signInData.user) {
    return {
      ok: false,
      errorCode: "native_exchange_not_implemented",
      message: signInError?.message || "Apple native Supabase session creation failed",
      status: 501,
    };
  }

  const signedUser = signInData.user;

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
        message: "Apple provider_user_id conflicts with another profile",
        status: 409,
      };
    }
  }

  await persistAppleProfileIdentity(ctx.adminSb, signedUser.id, input.verified);

  try {
    await ensureProviderAuthIdentityRow(ctx.adminSb, signedUser.id, candidate);
  } catch {
    return {
      ok: false,
      errorCode: "provider_account_conflict",
      message: "Apple provider_user_id conflicts with another profile",
      status: 409,
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
