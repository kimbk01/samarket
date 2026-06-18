"use client";

import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import { isPhoneVerificationRequiredApiPayload } from "@/lib/auth/phone-verification-required-detect";

export type MessengerHomeAuthRouterLike = { push: (href: string) => void };

/** 메신저 홈 액션 API 실패 시 로그인·전화 인증 게이트면 스낵바 대신 전역 시트/이동. */
export function tryRedirectMessengerHomeAuthBlocked(
  router: MessengerHomeAuthRouterLike,
  res: Response,
  json: { error?: unknown; code?: unknown },
  opts: { nextPath: string; loginRequiredMessage: string }
): boolean {
  if (isPhoneVerificationRequiredApiPayload(json)) {
    return redirectForBlockedAction(router, "PHONE_VERIFICATION_REQUIRED", opts.nextPath);
  }
  const apiErr =
    typeof json.error === "string" && json.error.trim() ? json.error.trim() : "";
  const authHint = res.status === 401 ? opts.loginRequiredMessage : "";
  return redirectForBlockedAction(router, apiErr || authHint || undefined, opts.nextPath);
}
