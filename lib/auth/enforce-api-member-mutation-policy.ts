/**
 * P0-R2/R3 — Central API mutation gate (action class).
 * Used from proxy for /api POST|PUT|PATCH|DELETE — not per-route status paste.
 *
 * P0-R3: authenticated PRODUCT_WRITE + lifecycle not established → DENY (fail-closed).
 * Anonymous → continue to route (401 from handler). Does not consume request body.
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
import { requireSupabaseEnv } from "@/lib/env/runtime";
import {
  evaluateTestAccess,
  isMiswiredNonProductionOnProductionDb,
  isTestRuntimeSurface,
} from "@/lib/config/test-access-control";

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
        code === MEMBER_ACCOUNT_STATE_UNAVAILABLE.code ||
        code === "account_blocked" ||
        code === "account_withdrawn" ||
        code === "test_access_denied" ||
        code === "miswired_production_database",
    },
    { status }
  );
}

async function resolveApiUserId(request: NextRequest): Promise<string | null> {
  const fp = proxyAuthCookieFingerprint(request);
  const warm = peekProxyAuthSessionCache(fp);
  if (warm?.trim()) return warm.trim();

  const supabaseEnv = requireSupabaseEnv({ requireAnonKey: true });
  if (!supabaseEnv.ok) return null;

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
  return uid;
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
  // P0 complement: Preview/local + Production DB must not mutate product data.
  if (isMiswiredNonProductionOnProductionDb()) {
    if (pathname.startsWith("/api/cron") || pathname.startsWith("/api/webhooks")) {
      return null;
    }
    return jsonDenied(
      503,
      "miswired_production_database",
      "비운영 배포가 운영 DB에 연결되어 쓰기가 차단되었습니다."
    );
  }

  const action = resolveMemberActionClassForApiMutation(pathname);
  if (action === "NON_MEMBER" || action === "EXEMPT" || action === "IDENTITY") {
    return null;
  }

  // PRODUCT_WRITE: enforce only when member identity resolves.
  // Unauthenticated → route handler returns 401 (public/anonymous not lifecycle-gated).
  let userId: string | null = null;
  try {
    userId = await resolveApiUserId(request);
  } catch {
    // Auth resolution itself failed — not an established member PRODUCT_WRITE session.
    return null;
  }
  if (!userId) return null;

  if (isTestRuntimeSurface()) {
    const access = evaluateTestAccess({ userId });
    if (access.required && !access.allowed) {
      return jsonDenied(
        403,
        "test_access_denied",
        "TEST 환경은 승인된 테스터만 이용할 수 있습니다."
      );
    }
  }

  // Always re-read DB — process-local lifecycle cache is not cross-isolate coherent
  // after admin moderation (FIRST DIVERGENCE: stale ACTIVE allowed PATCH /api/me/profile).
  const authority = await resolveMemberLifecycleAuthority(userId, { bypassCache: true });

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
  if (decision.ok) return null;
  return jsonDenied(decision.status, decision.code, decision.messageKo);
}
