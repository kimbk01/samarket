import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveDibaySignupStatus,
  isDibaySignupComplete,
  isDibaySignupGateExcludedPath,
  resolveDibaySignupRoute,
} from "@/lib/auth/dibay-signup-status";
import { shouldBlockUnauthenticatedHtmlRequest } from "@/lib/auth/guest-browse-access-policy";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";

const SIGNUP_GATE_PROFILE_SELECT =
  "id, dibay_id, dibay_id_locked, username, username_confirmed, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version, onboarding_completed_at, onboarding_status, role";

function normalizeGatePathname(pathname: string): string {
  return (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
}

/**
 * 인증 쿠키는 있으나 가입 미완료 사용자가 private HTML 경로에 접근할 때 온보딩으로 보낸다.
 * 공개 browse·인증 플로우·프로필 setup 경로는 제외한다.
 */
export async function resolveProxySignupGateRedirect(
  sb: SupabaseClient,
  userId: string,
  pathname: string
): Promise<string | null> {
  if (isDibaySignupGateExcludedPath(pathname)) return null;
  if (!shouldBlockUnauthenticatedHtmlRequest(pathname)) return null;

  const { data, error } = await sb
    .from("profiles")
    .select(SIGNUP_GATE_PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;

  const signup = deriveDibaySignupStatus(data, { hasSession: true });
  if (isDibaySignupComplete(signup)) return null;

  const redirectPath = resolveDibaySignupRoute(signup, sanitizeNextPath(pathname));
  const targetPathname = normalizeGatePathname(redirectPath);
  const currentPathname = normalizeGatePathname(pathname);
  if (targetPathname === currentPathname) return null;

  return redirectPath;
}
