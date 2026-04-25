/**
 * GET /api/auth/session — (main) 앱 셸·SessionLostRedirect 와 동일하게 Supabase 세션만 인정.
 * Route Handler 에서 `cookies()` 만 쓰면 토큰 갱신 시 Set-Cookie 가 누락되어
 * 주기적 세션 체크가 401 로 보일 수 있어,
 * Request + mutable NextResponse 패턴으로 갱신 쿠키를 응답에 실음 (@supabase/ssr 권장).
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { jsonErrorWithRequest, jsonOkWithRequest } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CookieToSet = { name: string; value: string; options: CookieOptions };

function requestHasSupabaseAuthCookies(request: NextRequest): boolean {
  for (const { name } of request.cookies.getAll()) {
    if (name.startsWith("sb-") && (name.includes("auth-token") || name.includes("code-verifier"))) {
      return true;
    }
    if (name === "supabase.auth.token" || name.startsWith("supabase.auth.token.")) {
      return true;
    }
  }
  return false;
}

function mergeAuthCookies(from: NextResponse, to: NextResponse): void {
  for (const c of from.cookies.getAll()) {
    to.cookies.set(c);
  }
}

export async function GET(request: NextRequest) {
  if (!requestHasSupabaseAuthCookies(request)) {
    return jsonErrorWithRequest(request, "로그인이 필요합니다.", 401, { authenticated: false });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    return jsonErrorWithRequest(request, "인증 설정이 준비되지 않았습니다.", 503, { authenticated: false });
  }

  let cookieCarrier = NextResponse.next({
    request: { headers: request.headers },
  });

  const cookieSecure = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  const supabase = createServerClient(url, anon, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: cookieSecure,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        cookieCarrier = NextResponse.next({
          request: { headers: request.headers },
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieCarrier.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    const res = jsonErrorWithRequest(request, "로그인이 필요합니다.", 401, { authenticated: false });
    mergeAuthCookies(cookieCarrier, res);
    return res;
  }

  const session = await validateActiveSession(user.id);
  if (!session.ok) {
    mergeAuthCookies(cookieCarrier, session.response);
    return session.response;
  }

  const res = jsonOkWithRequest(request, { authenticated: true });
  mergeAuthCookies(cookieCarrier, res);
  return res;
}
