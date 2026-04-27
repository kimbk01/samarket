import { NextRequest, NextResponse } from "next/server";
import { ensureUserProfile } from "@/lib/auth/ensure-user-profile";
import { getOnboardingStatus } from "@/lib/auth/get-onboarding-status";
import {
  buildNaverSupabasePassword,
  fetchNaverProfile,
  findAuthUserByEmail,
  NAVER_OAUTH_STATE_COOKIE,
  parseNaverState,
  requestNaverToken,
} from "@/lib/auth/naver-oauth";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { buildRequestSessionMeta } from "@/lib/auth/request-device-info";
import { resolvePostLoginRoute } from "@/lib/auth/resolve-post-login-route";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { syncActiveSessionForUser } from "@/lib/auth/server-guards";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildLoginErrorRedirect(req: NextRequest, args: { next: string | null; code: string; detail?: string }) {
  const url = new URL("/login", req.url);
  if (args.next) url.searchParams.set("next", args.next);
  url.searchParams.set("auth_error", args.code);
  const detail = String(args.detail ?? "").trim();
  if (detail) url.searchParams.set("auth_error_detail", detail.slice(0, 300));
  const res = NextResponse.redirect(url);
  res.cookies.set(NAVER_OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  const code = String(req.nextUrl.searchParams.get("code") ?? "").trim();
  const state = String(req.nextUrl.searchParams.get("state") ?? "").trim();
  const oauthError = String(req.nextUrl.searchParams.get("error") ?? "").trim();
  const oauthErrorDescription = String(req.nextUrl.searchParams.get("error_description") ?? "").trim();
  const parsedState = parseNaverState(state);
  const safeNext = sanitizeNextPath(parsedState?.next ?? req.nextUrl.searchParams.get("next"));

  if (oauthError) {
    return buildLoginErrorRedirect(req, {
      next: safeNext,
      code: "callback_failed",
      detail: oauthErrorDescription || oauthError,
    });
  }
  if (!code || !state || !parsedState) {
    return buildLoginErrorRedirect(req, { next: safeNext, code: "missing_code" });
  }
  const stateCookie = req.cookies.get(NAVER_OAUTH_STATE_COOKIE)?.value ?? "";
  if (!stateCookie || stateCookie !== state) {
    return buildLoginErrorRedirect(req, { next: safeNext, code: "callback_failed", detail: "invalid_state" });
  }

  const clientId = process.env.NAVER_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return buildLoginErrorRedirect(req, { next: safeNext, code: "supabase_unconfigured", detail: "naver_oauth_env_missing" });
  }
  const adminSb = tryCreateSupabaseServiceClient();
  if (!adminSb) {
    return buildLoginErrorRedirect(req, { next: safeNext, code: "supabase_unconfigured", detail: "supabase_service_role_missing" });
  }
  const routeSb = await createSupabaseRouteHandlerClient();
  if (!routeSb) {
    return buildLoginErrorRedirect(req, { next: safeNext, code: "supabase_unconfigured", detail: "supabase_anon_missing" });
  }

  try {
    const token = await requestNaverToken({
      clientId,
      clientSecret,
      code,
      state,
    });
    const profile = await fetchNaverProfile(token.accessToken);
    const password = buildNaverSupabasePassword(profile.email);
    const existing = await findAuthUserByEmail(adminSb, profile.email);
    const metadata = {
      provider: "naver",
      naver_id: profile.id,
      name: profile.name || profile.nickname || "",
      nickname: profile.nickname || "",
      avatar_url: profile.profileImage,
    };

    if (existing) {
      const { error: updateError } = await adminSb.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (updateError) {
        return buildLoginErrorRedirect(req, {
          next: safeNext,
          code: "callback_failed",
          detail: `supabase_user_update_failed:${updateError.message}`,
        });
      }
    } else {
      const { error: createError } = await adminSb.auth.admin.createUser({
        email: profile.email,
        password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (createError) {
        return buildLoginErrorRedirect(req, {
          next: safeNext,
          code: "callback_failed",
          detail: `supabase_user_create_failed:${createError.message}`,
        });
      }
    }

    const { data: signInData, error: signInError } = await routeSb.auth.signInWithPassword({
      email: profile.email,
      password,
    });
    if (signInError || !signInData.user) {
      return buildLoginErrorRedirect(req, {
        next: safeNext,
        code: "callback_failed",
        detail: signInError?.message || "sign_in_with_password_failed",
      });
    }

    const signedUser = signInData.user;
    await ensureUserProfile(adminSb, signedUser).catch(() => null);
    await adminSb
      .from("profiles")
      .update({
        provider: "naver",
        auth_provider: "naver",
        provider_user_id: profile.id,
        auth_login_email: profile.email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", signedUser.id);

    let destination = safeNext ?? POST_LOGIN_PATH;
    try {
      const status = await getOnboardingStatus(adminSb, signedUser.id);
      destination =
        resolvePostLoginRoute({
          hasSession: true,
          status,
          next: safeNext,
        }) ?? destination;
    } catch {
      /* fallback to safe next path */
    }
    const redirectUrl = new URL(destination, req.url);
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(NAVER_OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    const sessionMeta = buildRequestSessionMeta(req);
    await syncActiveSessionForUser(signedUser.id, response, {
      rotate: true,
      sessionMeta,
      loginIdentifier: profile.email,
    });
    return response;
  } catch (error) {
    return buildLoginErrorRedirect(req, {
      next: safeNext,
      code: "callback_failed",
      detail: error instanceof Error ? error.message : "naver_oauth_failed",
    });
  }
}
