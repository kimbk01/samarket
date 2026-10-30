/**
 * P0-R2/R3 — Central API mutation gate (action class).
 * Used from proxy for /api POST|PUT|PATCH|DELETE — not per-route status paste.
 *
 * P0-R3: authenticated PRODUCT_WRITE + lifecycle not established → DENY (fail-closed).
 * Anonymous → continue to route (401 from handler). Does not consume request body.
 * P2-4: auth 쿠키가 있는데 identity 해석이 throw/일시 오류 → 503 `auth_state_unavailable` (fail-closed).
 */

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import {
  assertMemberProductAction,
  resolveMemberActionClassForApiMutation,
} from "@/lib/auth/member-action-policy";
import {
  peekProxyAuthSessionCache,
  proxyAuthCookieFingerprint,
  setProxyAuthSessionCache,
} from "@/lib/auth/proxy-auth-session-cache";
import {
  isMemberLifecycleAuthorityFailClosed,
  MEMBER_ACCOUNT_STATE_UNAVAILABLE,
  resolveMemberLifecycleAuthority,
} from "@/lib/auth/resolve-member-lifecycle-authority";
import { resolveProxyAuthFromSupabase } from "@/lib/auth/resolve-proxy-auth-from-supabase";
import { resolveMemberConsentClassForApiMutation } from "@/lib/auth/member-consent-mutation-policy";
import { resolveMemberConsentAuthority } from "@/lib/auth/resolve-member-consent-authority";
import { loadMemberWriteGateSnapshot } from "@/lib/auth/load-member-write-gate-snapshot";
import { requestHasSupabaseSessionCookie } from "@/lib/auth/api-auth-cookie-presence";
import { requireSupabaseEnv } from "@/lib/env/runtime";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function jsonDenied(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: code,
      code,
      message,
      authenticated:
        code === "member_product_write_denied" ||
        code === "signup_incomplete" ||
        code === "consent_state_unavailable" ||
        code === MEMBER_ACCOUNT_STATE_UNAVAILABLE.code ||
        code === API_AUTH_STATE_UNAVAILABLE.code ||
        code === "account_blocked" ||
        code === "account_withdrawn",
    },
    { status }
  );
}

/** P2-4 — 세션 쿠키는 있으나 identity 를 확정하지 못함(일시 오류). 익명으로 취급하지 않는다. */
export const API_AUTH_STATE_UNAVAILABLE = {
  status: 503,
  code: "auth_state_unavailable",
  messageKo: "로그인 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
} as const;

export type ApiIdentityResolution = {
  userId: string | null;
  /** 네트워크·5xx 등 일시 오류로 user 미확정 (만료·무효 토큰은 false) */
  transientError: boolean;
};

/**
 * proxy /api 게이트 공용 identity 해석 — warm cache(12s) 우선, miss 시 getClaims(로컬 JWT)→getUser.
 * mutation·read 게이트가 같은 경로를 쓴다. throw 는 호출자가 처리.
 */
export async function resolveApiIdentity(request: NextRequest): Promise<ApiIdentityResolution> {
  const fp = proxyAuthCookieFingerprint(request);
  const warm = peekProxyAuthSessionCache(fp);
  if (warm?.trim()) return { userId: warm.trim(), transientError: false };

  const supabaseEnv = requireSupabaseEnv({ requireAnonKey: true });
  if (!supabaseEnv.ok) return { userId: null, transientError: false };

  const cookieSecure = cookieSecureFromNextRequest(request);
  const supabase = createServerClient(supabaseEnv.url, supabaseEnv.anonKey, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: cookieSecure,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        /* mutation gate does not refresh cookies */
      },
    },
  });
  const auth = await resolveProxyAuthFromSupabase(supabase);
  const uid = auth.userId?.trim() || null;
  if (uid) setProxyAuthSessionCache(fp, uid);
  return { userId: uid, transientError: !uid && auth.transientError };
}

function authStateUnavailable(): NextResponse {
  return jsonDenied(
    API_AUTH_STATE_UNAVAILABLE.status,
    API_AUTH_STATE_UNAVAILABLE.code,
    API_AUTH_STATE_UNAVAILABLE.messageKo
  );
}

/**
 * @returns null to continue to route handler; NextResponse to short-circuit deny.
 */
export async function enforceApiMemberMutationPolicy(
  request: NextRequest
): Promise<NextResponse | null> {
  const method = request.method.toUpperCase();
  if (!MUTATION_METHODS.has(method)) return null;

  const pathname = request.nextUrl.pathname;
  const action = resolveMemberActionClassForApiMutation(pathname);
  if (action === "NON_MEMBER" || action === "EXEMPT" || action === "IDENTITY") {
    return null;
  }

  // PRODUCT_WRITE: enforce only when member identity resolves.
  // Unauthenticated (세션 쿠키 없음 · 만료/무효 토큰) → route handler returns 401.
  // P2-4: 세션 쿠키가 있는데 해석이 throw/일시 오류 → 익명 통과 금지, 503 fail-closed.
  let identity: ApiIdentityResolution;
  try {
    identity = await resolveApiIdentity(request);
  } catch {
    return requestHasSupabaseSessionCookie(request) ? authStateUnavailable() : null;
  }
  const userId = identity.userId;
  if (!userId) {
    if (identity.transientError && requestHasSupabaseSessionCookie(request)) {
      return authStateUnavailable();
    }
    return null;
  }

  // Always re-read DB — process-local lifecycle cache is not cross-isolate coherent
  // after admin moderation (FIRST DIVERGENCE: stale ACTIVE allowed PATCH /api/me/profile).
  // 2-A: 회원 상태·동의 행·관리자 역할을 DB 함수 1회로 읽는다 (service client 없으면 기존 개별 조회).
  const snapshot = await loadMemberWriteGateSnapshot(userId);
  const authority = snapshot
    ? snapshot.lifecycle
    : await resolveMemberLifecycleAuthority(userId, { bypassCache: true });

  // P0-R3 Owner contract: no fail-open when lifecycle cannot be established.
  if (isMemberLifecycleAuthorityFailClosed(authority)) {
    return jsonDenied(
      MEMBER_ACCOUNT_STATE_UNAVAILABLE.status,
      MEMBER_ACCOUNT_STATE_UNAVAILABLE.code,
      MEMBER_ACCOUNT_STATE_UNAVAILABLE.messageKo
    );
  }

  if (authority.kind !== "RESOLVED") {
    // Exhaustiveness — treat any non-RESOLVED as unavailable.
    return jsonDenied(
      MEMBER_ACCOUNT_STATE_UNAVAILABLE.status,
      MEMBER_ACCOUNT_STATE_UNAVAILABLE.code,
      MEMBER_ACCOUNT_STATE_UNAVAILABLE.messageKo
    );
  }

  const decision = assertMemberProductAction(authority.profile, "PRODUCT_WRITE");
  if (!decision.ok) return jsonDenied(decision.status, decision.code, decision.messageKo);

  // B3: legal consent (CMS-required versions) for new member writes — explicit exemptions only.
  if (resolveMemberConsentClassForApiMutation(method, pathname) === "CONSENT_EXEMPT") return null;
  const consent = await resolveMemberConsentAuthority(userId, snapshot?.consent ?? undefined);
  if (consent.kind === "CONSENTED") return null;
  if (consent.kind === "UNAVAILABLE") {
    return jsonDenied(
      MEMBER_CONSENT_STATE_UNAVAILABLE.status,
      MEMBER_CONSENT_STATE_UNAVAILABLE.code,
      MEMBER_CONSENT_STATE_UNAVAILABLE.messageKo
    );
  }
  return jsonDenied(403, "signup_incomplete", "약관·개인정보 처리방침 동의 후 이용할 수 있습니다.");
}

/** Consent could not be established — fail closed (never treated as consented). */
export const MEMBER_CONSENT_STATE_UNAVAILABLE = {
  status: 503,
  code: "consent_state_unavailable",
  messageKo: "약관 동의 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
} as const;
