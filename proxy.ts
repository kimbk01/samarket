import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { isAdminRequireAuthEnabled } from "@/lib/auth/admin-policy";
import { requireSupabaseEnv } from "@/lib/env/runtime";

/**
 * 앱 UI(HTML·RSC) — 미로그인 시 /login 으로만 진입 가능.
 * - /api/* 는 matcher 에서 제외 (각 Route Handler가 인증 처리).
 * - Next.js 16+: `proxy.ts` + `export function proxy` — 세션 쿠키 갱신 포함.
 *
 * 주의: `getUser()` 생략·짧은 TTL 캐시로 HTML 만 통과시키면, 토큰 만료 직후에는
 * RSC·프록시는 캐시로 통과하고 `/api/me/profile` 만 401이 되어 “로그인 필요”와
 * 뒤로가기 시 이전 화면의 로그인 UI가 어긋날 수 있음 → 매 요청 `getUser()` 검증 유지.
 */

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname === "/signup" || pathname.startsWith("/signup/")) return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname === "/terms" || pathname.startsWith("/terms/")) return true;
  if (pathname === "/privacy" || pathname.startsWith("/privacy/")) return true;
  if (pathname === "/account/delete-request" || pathname.startsWith("/account/delete-request/")) return true;
  return false;
}

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function requestHasSupabaseAuthCookies(request: NextRequest): boolean {
  for (const { name } of request.cookies.getAll()) {
    // 현재: `sb-<ref>-auth-token` · 청크 `….auth-token.0` · PKCE `….auth-token-code-verifier`
    if (
      name.startsWith("sb-") &&
      (name.includes("auth-token") || name.includes("code-verifier"))
    ) {
      return true;
    }
    // @supabase/ssr·구버전 등 비표준 저장 키(청크: `…token.0`)
    if (name === "supabase.auth.token" || name.startsWith("supabase.auth.token.")) return true;
  }
  return false;
}

/** HTML 문서가 브라우저(웨일 등) 디스크 캐시에 오래 머물며 “예전처럼 로그인 없이 보임”으로 보이는 일 완화 */
function preventAuthPageCache(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  res.headers.set("Vary", "Cookie");
  return res;
}

/** 미인증 시 `/login` 만 사용. `?next=` 는 세션 만료 후 로그인 실패·루프를 유발해 붙이지 않음 — 성공 후 경로는 `POST_LOGIN_PATH` */
function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return preventAuthPageCache(NextResponse.redirect(loginUrl));
}

function respondServerMisconfigured(message: string): NextResponse {
  return preventAuthPageCache(
    new NextResponse(message, {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    })
  );
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname === "/test-signup" || pathname.startsWith("/test-signup/")) {
    const u = request.nextUrl.clone();
    u.pathname = "/login";
    u.search = "";
    return NextResponse.redirect(u, 308);
  }

  if (pathname.startsWith("/_next/")) {
    return NextResponse.next();
  }
  if (
    pathname === "/favicon.ico" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|wav|mp3|ico)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return preventAuthPageCache(NextResponse.next());
  }

  const supabaseEnv = requireSupabaseEnv({ requireAnonKey: true });
  if (!supabaseEnv.ok) {
    return respondServerMisconfigured(
      `${supabaseEnv.error}\n로그인 인증을 초기화할 수 없어 요청을 처리하지 못했습니다.`
    );
  }

  if (!requestHasSupabaseAuthCookies(request)) {
    return redirectToLogin(request);
  }

  let response = NextResponse.next({ request });

  const cookieSecure = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
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
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  /**
   * 세션 검증: `getClaims()` — 비대칭 JWT(Elliptic/RSA)면 JWKS 로컬 검증으로 Auth 서버 왕복을 줄일 수 있음.
   * 대칭 HS 알고리즘 프로젝트는 내부적으로 getUser()로 동일하게 검증(동작·보안 수준 유지).
   * @see https://supabase.com/docs/reference/javascript/auth-getclaims
   */
  try {
    const { data, error } = await supabase.auth.getClaims();
    const sub =
      data?.claims && typeof data.claims === "object" && "sub" in data.claims
        ? String((data.claims as { sub?: unknown }).sub ?? "").trim()
        : "";
    if (error || !sub) {
      return redirectToLogin(request);
    }
    return preventAuthPageCache(response);
  } catch {
    /** 네트워크·JWT 파싱 등 실패 시 열어 두지 않고 로그인으로 (fail-closed) */
    return redirectToLogin(request);
  }
}

export const config = {
  matcher: [
    "/((?!api(?:/|$)|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wav|mp3)$).*)",
  ],
};
