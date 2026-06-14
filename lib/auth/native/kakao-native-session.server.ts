import { createHash } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import {
  buildKakaoNativeAuthEmail,
  isKakaoNativeExchangeSessionEnabled,
} from "@/lib/auth/native/kakao-auth-env.server";
import type { KakaoVerifiedIdentity } from "@/lib/auth/native/kakao-token-verify.server";
import { deriveNativeExchangeGateFlags } from "@/lib/auth/native/native-provider-contract";
import { findActiveProfileIdByProviderUserId } from "@/lib/auth/active-profile-lookup";
import { ensureUserProfile } from "@/lib/auth/ensure-user-profile";
import { findAuthUserByEmail } from "@/lib/auth/naver-oauth";
import { revokeSessionForWithdrawnMember } from "@/lib/auth/withdrawn-account-guard";
import { getOnboardingStatus } from "@/lib/auth/get-onboarding-status";
import { ensurePendingAuthProfileRow } from "@/lib/auth/member-access";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { resolvePostLoginRoute } from "@/lib/auth/resolve-post-login-route";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { buildRequestSessionMeta } from "@/lib/auth/request-device-info";
import { syncActiveSessionForUser } from "@/lib/auth/server-guards";

export function buildKakaoSupabasePassword(kakaoUserId: string): string {
  const seed =
    process.env.KAKAO_NATIVE_PASSWORD_SEED?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || "dibay-kakao-native";
  const digest = createHash("sha256").update(`${seed}:kakao:${kakaoUserId}`).digest("base64url");
  return `Kk#${digest.slice(0, 48)}!`;
}

export type KakaoNativeSessionContext = {
  adminSb: SupabaseClient;
  routeSb: SupabaseClient;
  request: NextRequest;
  response: NextResponse;
};

export type KakaoNativeSessionResult =
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

async function findProfileIdByKakaoUserId(
  adminSb: SupabaseClient,
  kakaoUserId: string,
): Promise<string | null> {
  return findActiveProfileIdByProviderUserId(adminSb, "kakao", kakaoUserId);
}

function buildKakaoUserMetadata(verified: KakaoVerifiedIdentity): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    provider: "kakao",
    kakao_id: verified.kakaoUserId,
  };
  if (verified.nickname) metadata.nickname = verified.nickname;
  if (verified.profileImageUrl) metadata.avatar_url = verified.profileImageUrl;
  /** email 단독 병합 금지 — metadata 힌트만, auth email 은 synthetic */
  if (verified.email && verified.hasEmailFromProfile) {
    metadata.kakao_email_hint = verified.email;
  }
  return metadata;
}

function resolveAuthEmailForKakaoUser(kakaoUserId: string): string {
  return buildKakaoNativeAuthEmail(kakaoUserId);
}

async function upsertKakaoAuthUser(
  adminSb: SupabaseClient,
  args: {
    existingUserId: string | null;
    verified: KakaoVerifiedIdentity;
  },
): Promise<{ userId: string; isNewUser: boolean } | KakaoNativeSessionResult> {
  const authEmail = resolveAuthEmailForKakaoUser(args.verified.kakaoUserId);
  const password = buildKakaoSupabasePassword(args.verified.kakaoUserId);
  const metadata = buildKakaoUserMetadata(args.verified);

  if (args.existingUserId) {
    const { data: existingUserData, error: getUserError } = await adminSb.auth.admin.getUserById(
      args.existingUserId,
    );
    if (getUserError || !existingUserData.user) {
      return {
        ok: false,
        errorCode: "provider_account_conflict",
        message: "Kakao account profile exists but auth user is missing",
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
        message: updateError.message || "Failed to update Kakao auth user",
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
      return upsertKakaoAuthUser(adminSb, {
        existingUserId: recovered.id,
        verified: args.verified,
      });
    }
    return {
      ok: false,
      errorCode: "provider_account_conflict",
      message: createError?.message || "Failed to create Kakao auth user",
      status: 409,
    };
  }
  return { userId: created.user.id, isNewUser: true };
}

async function persistKakaoProfileIdentity(
  adminSb: SupabaseClient,
  userId: string,
  verified: KakaoVerifiedIdentity,
): Promise<void> {
  const patch: Record<string, unknown> = {
    provider: "kakao",
    auth_provider: "kakao",
    provider_user_id: verified.kakaoUserId,
    updated_at: new Date().toISOString(),
  };
  if (verified.email && verified.hasEmailFromProfile) {
    patch.auth_login_email = verified.email;
  }
  await adminSb.from("profiles").update(patch).eq("id", userId).then(() => undefined, () => undefined);
}

function syntheticUserForEnsure(userId: string, verified: KakaoVerifiedIdentity): User {
  const authEmail = resolveAuthEmailForKakaoUser(verified.kakaoUserId);
  return {
    id: userId,
    email: authEmail,
    app_metadata: { provider: "kakao" },
    user_metadata: buildKakaoUserMetadata(verified),
    aud: "authenticated",
    created_at: new Date().toISOString(),
    identities: [
      {
        id: verified.kakaoUserId,
        user_id: userId,
        provider: "kakao",
        identity_id: verified.kakaoUserId,
        identity_data: { sub: verified.kakaoUserId, provider: "kakao" },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
      },
    ],
  } as unknown as User;
}

export async function establishKakaoNativeSession(
  ctx: KakaoNativeSessionContext,
  input: {
    verified: KakaoVerifiedIdentity;
    next?: string | null;
  },
): Promise<KakaoNativeSessionResult> {
  if (!isKakaoNativeExchangeSessionEnabled()) {
    return {
      ok: false,
      errorCode: "kakao_native_exchange_disabled",
      message: "Kakao native session exchange is disabled — set AUTH_KAKAO_NATIVE_EXCHANGE_ENABLED=true",
      status: 503,
    };
  }

  const kakaoUserId = input.verified.kakaoUserId;
  const safeNext = sanitizeNextPath(input.next ?? null);
  const existingProfileId = await findProfileIdByKakaoUserId(ctx.adminSb, kakaoUserId);

  const upsert = await upsertKakaoAuthUser(ctx.adminSb, {
    existingUserId: existingProfileId,
    verified: input.verified,
  });
  if ("ok" in upsert) return upsert;

  const { userId, isNewUser } = upsert;
  const authEmail = resolveAuthEmailForKakaoUser(kakaoUserId);
  const password = buildKakaoSupabasePassword(kakaoUserId);

  const { data: signInData, error: signInError } = await ctx.routeSb.auth.signInWithPassword({
    email: authEmail,
    password,
  });
  if (signInError || !signInData.user) {
    return {
      ok: false,
      errorCode: "kakao_native_session_failed",
      message: signInError?.message || "Kakao native Supabase session creation failed",
      status: 500,
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

  try {
    await ensurePendingAuthProfileRow(ctx.adminSb, syntheticUser, {
      authProvider: "kakao",
      nicknameCandidate: input.verified.nickname ?? null,
      avatarCandidate: input.verified.profileImageUrl ?? null,
      emailInternal: input.verified.hasEmailFromProfile ? input.verified.email ?? null : null,
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
        message: "Kakao provider_user_id conflicts with another profile",
        status: 409,
      };
    }
  }

  await persistKakaoProfileIdentity(ctx.adminSb, signedUser.id, input.verified);

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
