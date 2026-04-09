import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { KASAMA_DEV_UID_COOKIE, KASAMA_DEV_UID_PUB_COOKIE } from "@/lib/auth/dev-session-cookie";
import { allowKasamaDevSession } from "@/lib/config/deploy-surface";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { isUuidLikeString } from "@/lib/shared/uuid-string";

type ProxyAuthCacheStore = Map<string, number>;

declare global {
  // eslint-disable-next-line no-var
  var __samarketProxyAuthCache: ProxyAuthCacheStore | undefined;
}

const PROXY_AUTH_CACHE_TTL_MS = 8_000;

function getProxyAuthCache(): ProxyAuthCacheStore {
  if (!globalThis.__samarketProxyAuthCache) {
    globalThis.__samarketProxyAuthCache = new Map<string, number>();
  }
  return globalThis.__samarketProxyAuthCache;
}

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

function getSupabaseAuthCookieCacheKey(request: NextRequest): string | null {
  const authCookies = request.cookies
    .getAll()
    .filter(
      ({ name }) =>
        (name.startsWith("sb-") && (name.includes("auth-token") || name.includes("code-verifier"))) ||
        name === "supabase.auth.token" ||
        name.startsWith("supabase.auth.token.")
    )
    .map(({ name, value }) => `${name}=${value}`)
    .sort();
  if (!authCookies.length) return null;
  return authCookies.join("|");
}

function pruneExpiredProxyAuthCache(cache: ProxyAuthCacheStore, now: number): void {
  for (const [cacheKey, expiresAt] of cache) {
    if (expiresAt <= now) cache.delete(cacheKey);
  }
}

function hasFreshProxyAuthVerification(request: NextRequest): boolean {
  const key = getSupabaseAuthCookieCacheKey(request);
  if (!key) return false;
  const now = Date.now();
  const cache = getProxyAuthCache();
  const expiresAt = cache.get(key);
  if (expiresAt != null && expiresAt <= now) {
    cache.delete(key);
  }
  if ((cache.get(key) ?? 0) > now) return true;
  /** 전체 순회는 HTML 요청마다 하지 않음(트래픽 시 CPU·락 비용). 맵이 커질 때만 확률적으로 만료 정리 */
  if (cache.size > 400 && Math.random() < 0.04) {
    pruneExpiredProxyAuthCache(cache, now);
  }
  return false;
}

function rememberProxyAuthVerification(request: NextRequest): void {
  const key = getSupabaseAuthCookieCacheKey(request);
  if (!key) return;
  getProxyAuthCache().set(key, Date.now() + PROXY_AUTH_CACHE_TTL_MS);
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

  const supabaseEnv = requireSupabaseEnv({ requireAnonKey: true });
  if (!supabaseEnv.ok) {
    return respondServerMisconfigured(
      `${supabaseEnv.error}\n로그인 인증을 초기화할 수 없어 요청을 처리하지 못했습니다.`
    );
  }

  if (!requestHasSupabaseAuthCookies(request)) {
    return redirectToLogin(request, pathname);
  }

  if (hasFreshProxyAuthVerification(request)) {
    return preventAuthPageCache(NextResponse.next({ request }));
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
    rememberProxyAuthVerification(request);
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
