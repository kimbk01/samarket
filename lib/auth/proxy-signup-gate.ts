import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import {
  deriveDibaySignupStatus,
  isDibaySignupComplete,
  isDibaySignupGateExcludedPath,
  resolveDibaySignupRoute,
} from "@/lib/auth/dibay-signup-status";
import { shouldBlockUnauthenticatedHtmlRequest } from "@/lib/auth/guest-browse-access-policy";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { resolveRequiredConsentVersions } from "@/lib/legal/resolve-required-consent-versions";
import { hasActiveAdminMembershipOrLegacyRole } from "@/lib/admin/admin-membership";

const SIGNUP_GATE_PROFILE_SELECT =
  "id, dibay_id, dibay_id_locked, username, username_confirmed, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version, onboarding_completed_at, onboarding_status, role";

function normalizeGatePathname(pathname: string): string {
  return (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
}

/**
 * Next.js / browser prefetch — do not spend profiles on speculative RSC.
 * Real document navigations still run the gate.
 */
export function isHtmlPrefetchRequest(request: NextRequest): boolean {
  const purpose = (request.headers.get("purpose") ?? request.headers.get("sec-purpose") ?? "")
    .trim()
    .toLowerCase();
  if (purpose === "prefetch") return true;
  if (request.headers.get("next-router-prefetch") === "1") return true;
  return false;
}

export type ProxySignupGateResult =
  | { action: "pass"; rememberComplete: true }
  | { action: "pass"; rememberComplete: false }
  | { action: "redirect"; path: string };

/**
 * 인증 쿠키는 있으나 가입 미완료 사용자가 private HTML 경로에 접근할 때 온보딩으로 보낸다.
 * 공개 browse·인증 플로우·프로필 setup 경로는 제외한다.
 *
 * B4 / D-2: `rememberComplete: true` 일 때만 호출측이 proxy 신원 캐시에 완료를 기억한다.
 */
export async function resolveProxySignupGateRedirect(
  sb: SupabaseClient,
  userId: string,
  pathname: string
): Promise<ProxySignupGateResult> {
  if (isDibaySignupGateExcludedPath(pathname)) {
    return { action: "pass", rememberComplete: false };
  }
  if (!shouldBlockUnauthenticatedHtmlRequest(pathname)) {
    return { action: "pass", rememberComplete: false };
  }

  const { data, error } = await sb
    .from("profiles")
    .select(SIGNUP_GATE_PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) {
    return { action: "pass", rememberComplete: false };
  }

  const required = await resolveRequiredConsentVersions();
  let signup = deriveDibaySignupStatus(data, { hasSession: true, requiredConsent: required });
  if (isDibaySignupComplete(signup)) {
    return { action: "pass", rememberComplete: true };
  }

  // P2-3: 미완료일 때만 membership verdict 확인 (완료 회원 hot path 비용 0) —
  // getOnboardingStatus / resolveMemberConsentAuthority 와 같은 관리자 판정.
  const privilegedAdmin = await hasActiveAdminMembershipOrLegacyRole(sb, userId).catch(() => false);
  if (privilegedAdmin) {
    signup = deriveDibaySignupStatus(data, { hasSession: true, privilegedAdmin, requiredConsent: required });
    if (isDibaySignupComplete(signup)) {
      return { action: "pass", rememberComplete: true };
    }
  }

  const redirectPath = resolveDibaySignupRoute(signup, sanitizeNextPath(pathname));
  const targetPathname = normalizeGatePathname(redirectPath);
  const currentPathname = normalizeGatePathname(pathname);
  if (targetPathname === currentPathname) {
    return { action: "pass", rememberComplete: false };
  }

  return { action: "redirect", path: redirectPath };
}
