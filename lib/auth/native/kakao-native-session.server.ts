import { createHash } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import {
  buildKakaoNativeAuthEmail,
  isKakaoNativeExchangeSessionEnabled,
} from "@/lib/auth/native/kakao-auth-env.server";
import { shouldPreserveAdminManagedPassword } from "@/lib/auth/manual-member-login-credential";
import type { KakaoVerifiedIdentity } from "@/lib/auth/native/kakao-token-verify.server";
import { deriveNativeExchangeGateFlags } from "@/lib/auth/native/native-provider-contract";
import {
  buildKakaoProviderCandidate,
  ensureProviderAuthIdentityRow,
  resolveNativeProviderSessionPrelude,
} from "@/lib/auth/provider-identity/native-session-bridge.server";
import type { ProviderEmailConflictClientDetail } from "@/lib/auth/provider-identity/types";
import {
  buildDibayNativeAppMetadata,
  canAdoptRecoveredNativeAuthUser,
  mintNativeOwnerSessionViaMagicLink,
  nativeProviderOwnsAuthCredentials,
  isProfileIdentitySet,
  resolveNativePasswordSeed,
} from "@/lib/auth/native/native-owner-session.server";
import { ensureAuthProfileForLogin } from "@/lib/auth/completion/ensure-auth-profile-for-login.server";
import { findAuthUserByEmail } from "@/lib/auth/naver-oauth";
import {
  resolveMemberWithdrawalGuard,
  revokeSessionForWithdrawnMember,
} from "@/lib/auth/withdrawn-account-guard";
import { getOnboardingStatus } from "@/lib/auth/get-onboarding-status";
import { DIBAY_SIGNUP_TERMS_PATH } from "@/lib/auth/dibay-signup-status";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { resolveCommonAuthDestination } from "@/lib/auth/completion/resolve-common-auth-destination.server";
import type { EnsureUserProfileOutcome } from "@/lib/auth/ensure-user-profile";
import { sanitizeNextPath, withNextSearchParam } from "@/lib/auth/safe-next-path";
import { buildRequestSessionMeta } from "@/lib/auth/request-device-info";
import { syncActiveSessionForUser } from "@/lib/auth/server-guards";

export function buildKakaoSupabasePassword(kakaoUserId: string): string {
  // OA-13 — 하드코딩 seed fallback 제거 (env 없으면 throw).
  const seed = resolveNativePasswordSeed(process.env.KAKAO_NATIVE_PASSWORD_SEED);
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
      conflict?: ProviderEmailConflictClientDetail & { stashToken: string };
    };

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

/** 세션 발급 방식 — synthetic(같은 provider) = 파생 비밀번호, 그 외 owner = magiclink (자격증명 무변경). */
type KakaoSessionPlan =
  | { mode: "password"; email: string; password: string }
  | { mode: "magiclink"; email: string };

type KakaoAuthUserPrepared = { userId: string; isNewUser: boolean; plan: KakaoSessionPlan };

const KAKAO_WITHDRAWN_RESULT: KakaoNativeSessionResult = {
  ok: false,
  errorCode: "account_withdrawn",
  message: "탈퇴한 계정입니다. 동일 계정으로 다시 이용하려면 관리자에게 문의해 주세요.",
  status: 403,
};

function kakaoAppMetadata(): Record<string, unknown> {
  return { provider: "kakao", providers: ["kakao"], ...buildDibayNativeAppMetadata("kakao") };
}

/**
 * P1-7 — 기존 auth user: 탈퇴 확인을 **모든 변경 전에** 수행.
 * email/password/metadata 갱신은 Kakao synthetic(또는 email 없음) 계정일 때만.
 */
async function prepareExistingKakaoAuthUser(
  adminSb: SupabaseClient,
  userId: string,
  verified: KakaoVerifiedIdentity,
): Promise<KakaoAuthUserPrepared | KakaoNativeSessionResult> {
  const { data: existingUserData, error: getUserError } = await adminSb.auth.admin.getUserById(userId);
  if (getUserError || !existingUserData.user) {
    return {
      ok: false,
      errorCode: "provider_account_conflict",
      message: "Kakao account profile exists but auth user is missing",
      status: 409,
    };
  }

  if ((await resolveMemberWithdrawalGuard(adminSb, userId)) === "withdrawn") {
    return KAKAO_WITHDRAWN_RESULT;
  }

  const currentEmail = String(existingUserData.user.email ?? "").trim();
  const preservePassword = await shouldPreserveAdminManagedPassword(adminSb, userId);
  if (!nativeProviderOwnsAuthCredentials("kakao", currentEmail) || preservePassword) {
    if (!currentEmail) {
      return {
        ok: false,
        errorCode: "kakao_native_session_failed",
        message: "Kakao owner account has no sign-in email",
        status: 500,
      };
    }
    return { userId, isNewUser: false, plan: { mode: "magiclink", email: currentEmail } };
  }

  const authEmail = resolveAuthEmailForKakaoUser(verified.kakaoUserId);
  const password = buildKakaoSupabasePassword(verified.kakaoUserId);
  const { error: updateError } = await adminSb.auth.admin.updateUserById(userId, {
    password,
    email: authEmail,
    email_confirm: true,
    user_metadata: buildKakaoUserMetadata(verified),
    app_metadata: kakaoAppMetadata(),
  });
  if (updateError) {
    return {
      ok: false,
      errorCode: "provider_account_conflict",
      message: updateError.message || "Failed to update Kakao auth user",
      status: 409,
    };
  }
  return { userId, isNewUser: false, plan: { mode: "password", email: authEmail, password } };
}

async function upsertKakaoAuthUser(
  adminSb: SupabaseClient,
  args: {
    existingUserId: string | null;
    verified: KakaoVerifiedIdentity;
  },
): Promise<KakaoAuthUserPrepared | KakaoNativeSessionResult> {
  if (args.existingUserId) {
    return prepareExistingKakaoAuthUser(adminSb, args.existingUserId, args.verified);
  }

  const authEmail = resolveAuthEmailForKakaoUser(args.verified.kakaoUserId);
  const password = buildKakaoSupabasePassword(args.verified.kakaoUserId);
  const { data: created, error: createError } = await adminSb.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: buildKakaoUserMetadata(args.verified),
    app_metadata: kakaoAppMetadata(),
  });
  if (createError || !created.user) {
    const recovered = await findAuthUserByEmail(adminSb, authEmail);
    if (recovered?.id) {
      // OA-10 — DIBAY 가 만든 Kakao synthetic 계정만 채택 (외부 선점 계정 거부).
      if (!canAdoptRecoveredNativeAuthUser("kakao", recovered, args.verified.kakaoUserId)) {
        console.warn("[auth/kakao-native]", JSON.stringify({ event: "native_synthetic_adopt_refused" }));
        return {
          ok: false,
          errorCode: "provider_account_conflict",
          message: "Kakao sign-in account is reserved by another registration",
          status: 409,
        };
      }
      return prepareExistingKakaoAuthUser(adminSb, recovered.id, args.verified);
    }
    return {
      ok: false,
      errorCode: "provider_account_conflict",
      message: createError?.message || "Failed to create Kakao auth user",
      status: 409,
    };
  }
  return { userId: created.user.id, isNewUser: true, plan: { mode: "password", email: authEmail, password } };
}

/**
 * Slice 7-4 PLAN_I2 Identity column writer — verified Kakao credential → provider* (soft).
 * P1-7 — 최초 기록만: provider_user_id 가 이미 있으면(다른 provider 가입 회원 포함) 건드리지 않는다.
 */
async function persistKakaoProfileIdentity(
  adminSb: SupabaseClient,
  userId: string,
  verified: KakaoVerifiedIdentity,
): Promise<void> {
  if (await isProfileIdentitySet(adminSb, userId)) return;
  const patch: Record<string, unknown> = {
    provider: "kakao",
    auth_provider: "kakao",
    provider_user_id: verified.kakaoUserId,
    updated_at: new Date().toISOString(),
  };
  if (verified.email && verified.hasEmailFromProfile) {
    patch.auth_login_email = verified.email;
  }
  const { error } = await adminSb.from("profiles").update(patch).eq("id", userId);
  if (error) {
    throw new Error(error.message || "Failed to persist Kakao profile identity metadata");
  }
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
  const candidate = buildKakaoProviderCandidate(input.verified);
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

  const upsert = await upsertKakaoAuthUser(ctx.adminSb, {
    existingUserId: existingProfileId,
    verified: input.verified,
  });
  if ("ok" in upsert) return upsert;

  const { userId, isNewUser, plan } = upsert;
  const authEmail = resolveAuthEmailForKakaoUser(kakaoUserId);

  let signedUser: User;
  try {
    if (plan.mode === "password") {
      const { data: signInData, error: signInError } = await ctx.routeSb.auth.signInWithPassword({
        email: plan.email,
        password: plan.password,
      });
      if (signInError || !signInData.user) {
        throw new Error(signInError?.message || "Kakao native Supabase session creation failed");
      }
      signedUser = signInData.user;
    } else {
      signedUser = await mintNativeOwnerSessionViaMagicLink(ctx.adminSb, ctx.routeSb, userId, plan.email);
    }
  } catch (err) {
    return {
      ok: false,
      errorCode: "kakao_native_session_failed",
      message: err instanceof Error ? err.message : "Kakao native Supabase session creation failed",
      status: 500,
    };
  }

  const withdrawalState = await revokeSessionForWithdrawnMember(
    ctx.routeSb,
    ctx.response,
    signedUser.id,
    ctx.adminSb,
  );
  if (withdrawalState === "withdrawn") {
    return KAKAO_WITHDRAWN_RESULT;
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
        message: "Kakao provider_user_id conflicts with another profile",
        status: 409,
      };
    }
  }

  try {
    await persistKakaoProfileIdentity(ctx.adminSb, signedUser.id, input.verified);
  } catch (err) {
    return {
      ok: false,
      errorCode: "profile_identity_persist_failed",
      message: err instanceof Error ? err.message : "Failed to persist Kakao profile identity",
      status: 500,
    };
  }

  try {
    await ensureProviderAuthIdentityRow(ctx.adminSb, signedUser.id, candidate);
  } catch {
    return {
      ok: false,
      errorCode: "provider_account_conflict",
      message: "Kakao provider_user_id conflicts with another profile",
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
