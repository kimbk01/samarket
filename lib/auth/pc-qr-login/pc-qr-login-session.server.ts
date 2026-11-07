import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import { resolveCommonAuthDestination } from "@/lib/auth/completion/resolve-common-auth-destination.server";
import { DIBAY_SIGNUP_TERMS_PATH } from "@/lib/auth/dibay-signup-status";
import { getOnboardingStatus } from "@/lib/auth/get-onboarding-status";
import { resolveLoginDeniedForMemberAccount } from "@/lib/auth/member-account-state";
import { mintNativeOwnerSessionViaMagicLink } from "@/lib/auth/native/native-owner-session.server";
import { deriveNativeExchangeGateFlags } from "@/lib/auth/native/native-provider-contract";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { buildRequestSessionMeta } from "@/lib/auth/request-device-info";
import { sanitizeNextPath, withNextSearchParam } from "@/lib/auth/safe-next-path";
import { syncActiveSessionForUser } from "@/lib/auth/server-guards";
import { revokeSessionForWithdrawnMember } from "@/lib/auth/withdrawn-account-guard";

export type PcQrLoginSessionResult =
  | {
      ok: true;
      userId: string;
      redirectTo: string;
      signupComplete: boolean;
      needsTermsAgreement: boolean;
      needsProfileCompletion: boolean;
    }
  | { ok: false; errorCode: string };

/**
 * PC QR 로그인 — 휴대폰이 승인한 **기존 회원**의 세션을 PC 에 만든다.
 * 새 세션 방식을 만들지 않는다: 네이티브 로그인과 같은 `mintNativeOwnerSessionViaMagicLink`(메일 발송 없음) +
 * 같은 로그인 뒤 처리(탈퇴 회수 → 약관·도착지 `resolveCommonAuthDestination` → `syncActiveSessionForUser`).
 * 차단·탈퇴 회원은 세션을 만들기 전에 거부한다 (`member-account-state.ts` — 정지는 로그인 허용).
 *
 * `cookieCarrier` 에 쓴 쿠키(활성 세션 번호 등)는 라우트가 최종 응답으로 옮긴다.
 */
export async function establishPcQrLoginSession(input: {
  adminSb: SupabaseClient;
  routeSb: SupabaseClient;
  userId: string;
  request: NextRequest;
  cookieCarrier: NextResponse;
  next: string | null;
}): Promise<PcQrLoginSessionResult> {
  const { adminSb, routeSb, userId, request, cookieCarrier } = input;
  const safeNext = sanitizeNextPath(input.next);

  const { data: profile, error: profileError } = await adminSb
    .from("profiles")
    .select("status, deleted_at")
    .eq("id", userId)
    .maybeSingle();
  if (profileError || !profile) return { ok: false, errorCode: "account_state_unavailable" };
  const denied = resolveLoginDeniedForMemberAccount(profile as { status?: string | null; deleted_at?: string | null });
  if (denied) return { ok: false, errorCode: denied.code };

  const { data: authUser, error: authUserError } = await adminSb.auth.admin.getUserById(userId);
  const email = String(authUser?.user?.email ?? "").trim();
  if (authUserError || !email) return { ok: false, errorCode: "pc_qr_login_session_failed" };

  try {
    await mintNativeOwnerSessionViaMagicLink(adminSb, routeSb, userId, email);
  } catch {
    return { ok: false, errorCode: "pc_qr_login_session_failed" };
  }

  const withdrawal = await revokeSessionForWithdrawnMember(routeSb, cookieCarrier, userId, adminSb);
  if (withdrawal === "withdrawn") return { ok: false, errorCode: "account_withdrawn" };

  let redirectTo = safeNext ?? POST_LOGIN_PATH;
  let signupComplete = false;
  let needsTermsAgreement = true;
  let needsProfileCompletion = true;
  try {
    const status = await getOnboardingStatus(adminSb, userId);
    signupComplete = status.signupComplete;
    const flags = deriveNativeExchangeGateFlags({
      consentComplete: status.consentComplete,
      dibayIdComplete: status.dibayIdComplete,
      profileComplete: status.profileComplete,
      signupComplete: status.signupComplete,
    });
    needsTermsAgreement = flags.needsTermsAgreement;
    needsProfileCompletion = flags.needsProfileCompletion;
    const resolved = await resolveCommonAuthDestination(adminSb, { userId, next: safeNext, status });
    redirectTo = resolved.destination || redirectTo;
  } catch {
    // 네이티브 로그인과 같은 규칙 — 조회 실패 시 약관 화면 (메인·deep link 직행 금지)
    redirectTo = withNextSearchParam(DIBAY_SIGNUP_TERMS_PATH, safeNext);
    needsTermsAgreement = true;
    signupComplete = false;
  }

  await syncActiveSessionForUser(userId, cookieCarrier, {
    sessionMeta: buildRequestSessionMeta(request),
    loginIdentifier: email,
    request,
  }).catch(() => undefined);

  return { ok: true, userId, redirectTo, signupComplete, needsTermsAgreement, needsProfileCompletion };
}
