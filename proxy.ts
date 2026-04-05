import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { KASAMA_DEV_UID_COOKIE, KASAMA_DEV_UID_PUB_COOKIE } from "@/lib/auth/dev-session-cookie";
import { allowKasamaDevSession } from "@/lib/config/deploy-surface";
import { isUuidLikeString } from "@/lib/shared/uuid-string";

/**
 * 앱 UI(HTML·RSC) — 미로그인 시 /login 으로만 진입 가능.
 * - /api/* 는 matcher 에서 제외 (각 Route Handler가 인증 처리).
 * - Next.js 16+: `proxy.ts` + `export function proxy` — 세션 쿠키 갱신 포함.
 */

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname === "/signup" || pathname.startsWith("/signup/")) return true;
  if (pathname.startsWith("/auth/")) return true;
  return false;
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

function requestHasKasamaDevAuthCookies(request: NextRequest): boolean {
  const primary = request.cookies.get(KASAMA_DEV_UID_COOKIE)?.value?.trim();
  if (primary && isUuidLikeString(primary)) return true;
  const mirrored = request.cookies.get(KASAMA_DEV_UID_PUB_COOKIE)?.value?.trim();
  return Boolean(mirrored && isUuidLikeString(mirrored));
}

/** HTML 문서가 브라우저(웨일 등) 디스크 캐시에 오래 머물며 “예전처럼 로그인 없이 보임”으로 보이는 일 완화 */
function preventAuthPageCache(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  res.headers.set("Vary", "Cookie");
  return res;
}

function redirectToLogin(request: NextRequest, pathname: string): NextResponse {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  /** 원 경로(딥링크 복귀용). 로그인 성공 후 이동은 `POST_LOGIN_PATH` 고정 — `lib/auth/post-login-path.ts` */
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return preventAuthPageCache(NextResponse.redirect(loginUrl));
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname === "/test-signup" || pathname.startsWith("/test-signup/")) {
    const u = request.nextUrl.clone();
    u.pathname = "/signup";
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

  if (allowKasamaDevSession() && requestHasKasamaDevAuthCookies(request)) {
    return preventAuthPageCache(NextResponse.next());
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anon) {
    return redirectToLogin(request, pathname);
  }

  if (!requestHasSupabaseAuthCookies(request)) {
    return redirectToLogin(request, pathname);
  }

  let response = NextResponse.next({ request });

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
   * 쿠키만 보면 위변조 가능하므로 getSession() 대신 getUser()로 매 요청 검증.
   * (RSC `app/(main)/layout` 도 getUser() — 이중 호출이나 보안·세션 갱신 일관성이 우선.)
   */
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user?.id) {
      return redirectToLogin(request, pathname);
    }
    return preventAuthPageCache(response);
  } catch {
    /** 네트워크·JWT 파싱 등 실패 시 열어 두지 않고 로그인으로 (fail-closed) */
    return redirectToLogin(request, pathname);
  }
}

export const config = {
  matcher: [
    "/((?!api(?:/|$)|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wav|mp3)$).*)",
  ],
};
