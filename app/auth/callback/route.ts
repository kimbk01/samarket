import type { User } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { ensureAuthProfileRow } from "@/lib/auth/member-access";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const dynamic = "force-dynamic";

const SIGNUP_NICKNAME_COOKIE = "samarket_signup_nickname";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next")?.trim() || POST_LOGIN_PATH;
  const redirectUrl = new URL(next.startsWith("/") ? next : POST_LOGIN_PATH, req.url);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    redirectUrl.searchParams.set("auth_error", "supabase_unconfigured");
    const res = NextResponse.redirect(redirectUrl);
    res.cookies.set(SIGNUP_NICKNAME_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  const cookieRaw = req.cookies.get(SIGNUP_NICKNAME_COOKIE)?.value;

  /**
   * exchangeCodeForSession 이 Set-Cookie 를 쓰므로, 같은 redirect 응답에 붙여야 함.
   * (마지막에 새 `NextResponse.redirect`를 만들면 세션 쿠키가 유실되어 프록시가 /login 으로 보냄.)
   */
  let response = NextResponse.redirect(redirectUrl);
  const cookieSecure = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  const supabase = createServerClient(url, anon, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: cookieSecure,
    },
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]
      ) {
        for (const { name, value, options } of cookiesToSet) {
          try {
            response.cookies.set(name, value, options);
          } catch {
            /* ignore malformed cookie options */
          }
        }
      },
    },
  });

  let exchangedOk = false;
  if (code) {
    try {
      await supabase.auth.exchangeCodeForSession(code);
      exchangedOk = true;
    } catch {
      redirectUrl.searchParams.set("auth_error", "callback_failed");
      response = NextResponse.redirect(redirectUrl);
    }
  }

  if (exchangedOk && cookieRaw) {
    let decoded = cookieRaw;
    try {
      decoded = decodeURIComponent(cookieRaw.trim());
    } catch {
      decoded = cookieRaw.trim();
    }
    const nick = decoded.trim().slice(0, 20);
    if (nick) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const serviceSb = tryCreateSupabaseServiceClient();
      if (user && serviceSb) {
        const baseMeta =
          user.user_metadata && typeof user.user_metadata === "object"
            ? { ...(user.user_metadata as Record<string, unknown>) }
            : {};
        baseMeta.nickname = nick;
        const mergedUser = { ...user, user_metadata: baseMeta } as User;
        try {
          await ensureAuthProfileRow(serviceSb, mergedUser);
        } catch {
          /* 프로필 보장 실패 시 클라이언트 ensure 에 맡김 */
        }
      }
    }
  }

  response.cookies.set(SIGNUP_NICKNAME_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
