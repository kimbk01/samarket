import type { User } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { ensureUserProfile } from "@/lib/auth/ensure-user-profile";
import { getOnboardingStatus } from "@/lib/auth/get-onboarding-status";
import { resolvePostLoginRoute } from "@/lib/auth/resolve-post-login-route";
import { buildRequestSessionMeta } from "@/lib/auth/request-device-info";
import { syncActiveSessionForUser } from "@/lib/auth/server-guards";
import { APP_LANGUAGE_COOKIE, normalizeAppLanguage } from "@/lib/i18n/config";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const dynamic = "force-dynamic";

const SIGNUP_NICKNAME_COOKIE = "samarket_signup_nickname";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const safeNext = sanitizeNextPath(req.nextUrl.searchParams.get("next"));
  const oauthError = req.nextUrl.searchParams.get("error");
  const next = safeNext ?? POST_LOGIN_PATH;
  const redirectUrl = new URL(next, req.url);
  const loginUrl = new URL("/login", req.url);
  if (safeNext) {
    loginUrl.searchParams.set("next", safeNext);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    loginUrl.searchParams.set("auth_error", "supabase_unconfigured");
    const res = NextResponse.redirect(loginUrl);
    res.cookies.set(SIGNUP_NICKNAME_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  const cookieRaw = req.cookies.get(SIGNUP_NICKNAME_COOKIE)?.value;
  const localeCookieRaw = req.cookies.get(APP_LANGUAGE_COOKIE)?.value;

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
  if (oauthError) {
    loginUrl.searchParams.set("auth_error", "callback_failed");
    response = NextResponse.redirect(loginUrl);
  } else if (code) {
    try {
      await supabase.auth.exchangeCodeForSession(code);
      exchangedOk = true;
    } catch {
      loginUrl.searchParams.set("auth_error", "callback_failed");
      response = NextResponse.redirect(loginUrl);
    }
  } else {
    loginUrl.searchParams.set("auth_error", "missing_code");
    response = NextResponse.redirect(loginUrl);
  }

  if (exchangedOk) {
    let nick = "";
    if (cookieRaw) {
      let decoded = cookieRaw;
      try {
        decoded = decodeURIComponent(cookieRaw.trim());
      } catch {
        decoded = cookieRaw.trim();
      }
      nick = decoded.trim().slice(0, 20);
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const serviceSb = tryCreateSupabaseServiceClient();
    if (user) {
      const baseMeta =
        user.user_metadata && typeof user.user_metadata === "object"
          ? { ...(user.user_metadata as Record<string, unknown>) }
          : {};
      if (nick) {
        baseMeta.nickname = nick;
      }
      if (localeCookieRaw) {
        baseMeta.preferred_language = normalizeAppLanguage(localeCookieRaw);
      }
      const mergedUser = { ...user, user_metadata: baseMeta } as User;
      try {
        /**
         * SNS 로그인 회원 식별·중복 방지 단일 진입점:
         * - profiles 가 있으면 update 만, 없을 때만 1회 insert
         * - provider+provider_user_id 충돌 시 duplicateWarning 만 표면화 (자동 병합 금지)
         */
        const outcome = await ensureUserProfile(serviceSb ?? supabase, mergedUser);
        if (outcome.duplicateWarning && process.env.NODE_ENV !== "production") {
          console.warn("[auth/callback] duplicate profile candidate detected", {
            userId: mergedUser.id,
            candidates: outcome.duplicateCandidates,
          });
        }
      } catch {
        /* 프로필 보장 실패 시 클라이언트 ensure 에 맡김 */
      }

      // 온보딩 상태 단일 조회 → 동의/프로필/주소 분기 결정 (스펙 1)
      let onboardingTarget: string | null = null;
      try {
        const status = await getOnboardingStatus(serviceSb ?? supabase, user.id);
        onboardingTarget = resolvePostLoginRoute({
          hasSession: true,
          status,
          next: safeNext,
        });
      } catch {
        /* 상태 조회 실패 시 기본 next 로 진행 (콜백을 막지 않음) */
      }
      if (onboardingTarget) {
        const onboardingUrl = new URL(onboardingTarget, req.url);
        response.headers.set("Location", onboardingUrl.toString());
      }

      const sessionMeta = buildRequestSessionMeta(req);
      await syncActiveSessionForUser(user.id, response, {
        rotate: true,
        sessionMeta,
        loginIdentifier: user.email?.trim().toLowerCase() ?? null,
      });
    }
  }

  response.cookies.set(SIGNUP_NICKNAME_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(APP_LANGUAGE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
