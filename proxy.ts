import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { isAdminRequireAuthEnabled } from "@/lib/auth/admin-policy";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import { requireSupabaseEnv } from "@/lib/env/runtime";

/**
 * 앱 UI(HTML·RSC) — 미로그인 시 /login 으로만 진입 가능.
 * (탭 전환·뒤로가기·PWA 백그라운드는 로그아웃이 아님; 세션 만료/명시 로그아웃 후에는 여기서 매 요청 재검증)
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

/**
 * 미인증 시 `/login` 으로 보낸다.
 * 원래 가려던 *내부* 경로가 안전(`sanitizeNextPath`)하면 `?next=` 로 보존해
 * `/auth/callback` 또는 로그인 성공 후 그 경로로 복귀하게 한다.
 *
 * 보존하지 않는 경우(루프·외부 송출 위험): `/login`, `/auth/callback`, `/auth/consent`, `/api/*`, `//`, 외부 URL 등.
 */
function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = request.nextUrl.clone();
  const originalPathWithSearch = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const safeNext = sanitizeNextPath(originalPathWithSearch);
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  if (safeNext) {
    loginUrl.searchParams.set("next", safeNext);
  }
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
    pathname === "/manifest.webmanifest" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|avif|wav|mp3|mp4|ico|webmanifest|json|xml|txt|map|woff2?|ttf|otf|eot)$/i.test(
      pathname
    )
  ) {
    return NextResponse.next();
  }
  // Next.js App Router metadata routes (확장자 없음): `app/icon.tsx`·`app/apple-icon.tsx`·`app/opengraph-image.tsx` 등.
  // 이들은 `/icon`, `/apple-icon`, `/opengraph-image[/...]` 처럼 노출되며 페이지가 아니라 이미지 응답이다.
  // 인증 게이트에서 빼야 비로그인 상태에서도 정상 로딩되고, 잘못된 `?next=%2Ficon` 도 만들지 않는다.
  if (
    /^\/(?:icon|apple-icon|opengraph-image|twitter-image)(?:\/|$|-)/i.test(pathname) ||
    /^\/(?:icon|apple-icon|opengraph-image|twitter-image)$/i.test(pathname)
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
   * 세션 검증: `getUser()` + fail-open 정책.
   *
   * 프록시는 HTML 페이지 게이트일 뿐 — 실제 데이터 보호는 API Route Handler 가 담당.
   * 일시 실패(메모리 부족·네트워크·동시 refresh token rotation race)에도 `/login` 으로
   * 튕기면 폼 데이터 손실·루프가 발생하므로, **쿠키가 존재하는 한 일시 실패는 통과**시킨다.
   *
   * - user 확인 성공 → 통과 (쿠키 갱신 포함)
   * - user null + error 없음 → 진짜 미인증 → `/login`
   * - user null + error 있음 → 일시 실패 → 통과 (API 가 401 로 처리)
   * - 예외 → 일시 실패 → 통과
   */
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (user?.id) {
      return preventAuthPageCache(response);
    }

    if (!error) {
      return redirectToLogin(request);
    }

    return preventAuthPageCache(response);
  } catch {
    return preventAuthPageCache(response);
  }
}

export const config = {
  matcher: [
    "/((?!api(?:/|$)|_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|icon(?:[/-]|$)|apple-icon(?:[/-]|$)|opengraph-image(?:[/-]|$)|twitter-image(?:[/-]|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|wav|mp3|mp4|ico|webmanifest|json|xml|txt|map|woff|woff2|ttf|otf|eot)$).*)",
  ],
};
