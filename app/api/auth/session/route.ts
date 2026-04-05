/**
 * GET /api/auth/session — (main) 앱 셸·SessionLostRedirect 와 동일하게 Supabase 세션만 인정.
 * Route Handler 에서 `cookies()` 만 쓰면 토큰 갱신 시 Set-Cookie 가 누락되어
 * 주기적 세션 체크가 401 → 자동 로그아웃으로 이어질 수 있어,
 * Request + mutable NextResponse 패턴으로 갱신 쿠키를 응답에 실음 (@supabase/ssr 권장).
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export const dynamic = "force-dynamic";

function mergeAuthCookies(from: NextResponse, to: NextResponse): void {
  for (const c of from.cookies.getAll()) {
    to.cookies.set(c);
  }
}

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
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
    const res = NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
    mergeAuthCookies(cookieCarrier, res);
    return res;
  }

  const res = NextResponse.json({ ok: true, authenticated: true });
  mergeAuthCookies(cookieCarrier, res);
  return res;
}
