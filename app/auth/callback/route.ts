import type { User } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import { DIBAY_SIGNUP_TERMS_PATH } from "@/lib/auth/dibay-signup-status";
import { ensureUserProfile } from "@/lib/auth/ensure-user-profile";
import { getOnboardingStatus } from "@/lib/auth/get-onboarding-status";
import { upsertOAuthProfileFromUser } from "@/lib/auth/oauth-profile-upsert";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { resolvePostLoginRoute } from "@/lib/auth/resolve-post-login-route";
import { buildRequestSessionMeta } from "@/lib/auth/request-device-info";
import { syncActiveSessionForUser } from "@/lib/auth/server-guards";
import { sanitizeNextPath, withNextSearchParam } from "@/lib/auth/safe-next-path";
import { APP_LANGUAGE_COOKIE, parseExplicitAppLanguage } from "@/lib/i18n/config";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { revokeSessionForWithdrawnMember } from "@/lib/auth/withdrawn-account-guard";
import {
  enforceWebOAuthProviderPolicy,
  persistOAuthProviderIdentity,
} from "@/lib/auth/provider-identity/web-oauth-policy.server";

export const dynamic = "force-dynamic";

const SIGNUP_NICKNAME_COOKIE = "samarket_signup_nickname";

function buildProviderCallbackRedirect(req: NextRequest): NextResponse | null {
  const provider = String(req.nextUrl.searchParams.get("provider") ?? "").trim().toLowerCase();
  if (provider !== "naver") return null;

  const callbackUrl = new URL("/api/auth/naver/callback", req.url);
  for (const [key, value] of req.nextUrl.searchParams.entries()) {
    callbackUrl.searchParams.set(key, value);
  }
  return NextResponse.redirect(callbackUrl);
}

export async function GET(req: NextRequest) {
  const providerCallbackRedirect = buildProviderCallbackRedirect(req);
  if (providerCallbackRedirect) return providerCallbackRedirect;

  const code = req.nextUrl.searchParams.get("code");
  const safeNext = sanitizeNextPath(req.nextUrl.searchParams.get("next"));
  const oauthError = req.nextUrl.searchParams.get("error");
  const oauthErrorDescription = req.nextUrl.searchParams.get("error_description");
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

  let response = NextResponse.redirect(redirectUrl);
  const cookieSecure = cookieSecureFromNextRequest(req);
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
    const detail = String(oauthErrorDescription ?? oauthError).trim();
    if (detail) loginUrl.searchParams.set("auth_error_detail", detail.slice(0, 300));
    response = NextResponse.redirect(loginUrl);
  } else if (code) {
    try {
      await supabase.auth.exchangeCodeForSession(code);
      exchangedOk = true;
    } catch {
      loginUrl.searchParams.set("auth_error", "callback_failed");
      loginUrl.searchParams.set("auth_error_detail", "exchange_code_for_session_failed");
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
    const writeSb = serviceSb ?? supabase;
    if (user) {
      const baseMeta =
        user.user_metadata && typeof user.user_metadata === "object"
          ? { ...(user.user_metadata as Record<string, unknown>) }
          : {};
      if (nick) {
        baseMeta.nickname = nick;
      }
      if (localeCookieRaw) {
        const explicitLocale = parseExplicitAppLanguage(localeCookieRaw);
        if (explicitLocale) {
          baseMeta.preferred_language = explicitLocale;
        }
      }
      const mergedUser = { ...user, user_metadata: baseMeta } as User;

      const withdrawalState = await revokeSessionForWithdrawnMember(
        supabase,
        response,
        user.id,
        writeSb,
      );
      if (withdrawalState === "withdrawn") {
        loginUrl.searchParams.set("auth_error", "account_withdrawn");
        loginUrl.searchParams.set(
          "auth_error_detail",
          "withdrawn_member_cannot_sign_in",
        );
        response = NextResponse.redirect(loginUrl);
        return response;
      }

      const providerPolicy = await enforceWebOAuthProviderPolicy(writeSb, mergedUser);
      if (!providerPolicy.ok) {
        await supabase.auth.signOut();
        loginUrl.searchParams.set("auth_error", providerPolicy.errorCode);
        loginUrl.searchParams.set("auth_error_detail", providerPolicy.message.slice(0, 300));
        if (providerPolicy.conflict) {
          loginUrl.searchParams.set("auth_stash", providerPolicy.conflict.stashToken);
          loginUrl.searchParams.set("auth_conflict_email", providerPolicy.conflict.email);
          loginUrl.searchParams.set(
            "auth_conflict_attempted",
            providerPolicy.conflict.attemptedProvider,
          );
          loginUrl.searchParams.set(
            "auth_conflict_existing",
            providerPolicy.conflict.existingProviders.join(","),
          );
        }
        response = NextResponse.redirect(loginUrl);
        return response;
      }

      try {
        await upsertOAuthProfileFromUser(writeSb, mergedUser, {
          nicknameOverride: nick || null,
        });
        if (providerPolicy.candidate) {
          await persistOAuthProviderIdentity(writeSb, mergedUser.id, providerPolicy.candidate);
        }
      } catch {
        /* 클라이언트 ensure 에 맡김 */
      }

      let onboardingTarget = withNextSearchParam(DIBAY_SIGNUP_TERMS_PATH, safeNext);
      try {
        const status = await getOnboardingStatus(writeSb, user.id);
        if (status.signupComplete) {
          try {
            const outcome = await ensureUserProfile(writeSb, mergedUser);
            if (outcome.duplicateWarning && process.env.NODE_ENV !== "production") {
              console.warn("[auth/callback] duplicate profile candidate detected", {
                userId: mergedUser.id,
                candidates: outcome.duplicateCandidates,
              });
            }
          } catch {
            /* provider identity 보강 실패는 로그인을 막지 않음 */
          }
        }
        onboardingTarget = resolvePostLoginRoute({
          hasSession: true,
          status,
          next: safeNext,
        });
      } catch {
        /* 상태 조회 실패 시 약관 화면으로 — 메인 직행 금지 */
      }
      const onboardingUrl = new URL(onboardingTarget, req.url);
      response.headers.set("Location", onboardingUrl.toString());

      const sessionMeta = buildRequestSessionMeta(req);
      await syncActiveSessionForUser(user.id, response, {
        sessionMeta,
        loginIdentifier: user.email?.trim().toLowerCase() ?? null,
        request: req,
      });
    }
  }

  response.cookies.set(SIGNUP_NICKNAME_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(APP_LANGUAGE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
