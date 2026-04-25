import type { User } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { normalizeOAuthProvider } from "@/lib/auth/auth-providers";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { ensureAuthProfileRow } from "@/lib/auth/member-access";
import { buildRequestSessionMeta } from "@/lib/auth/request-device-info";
import { syncActiveSessionForUser } from "@/lib/auth/server-guards";
import { APP_LANGUAGE_COOKIE, normalizeAppLanguage } from "@/lib/i18n/config";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNUP_NICKNAME_COOKIE = "samarket_signup_nickname";
const ENSURE_PROFILE_SOFT_TIMEOUT_MS = 180;

function redirectWithError(req: NextRequest, code: string): NextResponse {
  const url = new URL("/login", req.url);
  url.searchParams.set("auth_error", code);
  return NextResponse.redirect(url);
}

function normalizeProviderFromMeta(input: unknown) {
  const raw = String(input ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return null;
  if (raw === "custom:naver" || raw === "naver") return "naver";
  if (raw === "google" || raw === "kakao" || raw === "apple" || raw === "facebook") return raw;
  return null;
}

function resolveProviderId(user: User, provider: string): string | null {
  const identities = Array.isArray(user.identities)
    ? (user.identities as unknown as Array<Record<string, unknown>>)
    : [];
  for (const identity of identities) {
    const idProvider = String(identity.provider ?? "")
      .trim()
      .toLowerCase();
    const normalized =
      idProvider === "custom:naver"
        ? "naver"
        : idProvider;
    if (normalized !== provider) continue;
    const fromIdentityData = (identity.identity_data as Record<string, unknown> | null)?.sub;
    const candidate = String(fromIdentityData ?? identity.id ?? identity.user_id ?? "")
      .trim();
    if (candidate) return candidate;
  }
  return user.id?.trim() || null;
}

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return redirectWithError(req, "supabase_unconfigured");
  const code = String(req.nextUrl.searchParams.get("code") ?? "").trim();
  if (!code) return redirectWithError(req, "missing_code");
  const cookieRaw = req.cookies.get(SIGNUP_NICKNAME_COOKIE)?.value;
  const localeCookieRaw = req.cookies.get(APP_LANGUAGE_COOKIE)?.value;

  const response = NextResponse.redirect(new URL(POST_LOGIN_PATH, req.url));
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
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
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

  try {
    await supabase.auth.exchangeCodeForSession(code);
  } catch {
    return redirectWithError(req, "callback_failed");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirectWithError(req, "user_not_found");

  const providerFromQuery = normalizeOAuthProvider(req.nextUrl.searchParams.get("provider"));
  const providerFromMeta =
    normalizeProviderFromMeta(user.app_metadata?.provider) ??
    normalizeProviderFromMeta((user.user_metadata as Record<string, unknown> | null)?.provider) ??
    normalizeProviderFromMeta((user.user_metadata as Record<string, unknown> | null)?.auth_provider);
  if (providerFromQuery && providerFromMeta && providerFromQuery !== providerFromMeta) {
    return redirectWithError(req, "provider_mismatch");
  }
  const provider = providerFromQuery ?? providerFromMeta;
  if (!provider) return redirectWithError(req, "invalid_provider");

  const serviceSb = tryCreateSupabaseServiceClient();
  if (!serviceSb) return redirectWithError(req, "supabase_service_unconfigured");

  const providerId = resolveProviderId(user, provider);
  if (!providerId) return redirectWithError(req, "provider_id_missing");

  try {
    await serviceSb
      .from("users")
      .upsert(
        {
          provider,
          provider_id: providerId,
          email: user.email?.trim() ?? "",
          name:
            String((user.user_metadata as Record<string, unknown> | null)?.name ?? "").trim() ||
            String((user.user_metadata as Record<string, unknown> | null)?.full_name ?? "").trim() ||
            String((user.user_metadata as Record<string, unknown> | null)?.nickname ?? "").trim() ||
            user.email?.split("@")[0] ||
            "user",
          phone: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider,provider_id" }
      )
      .select("id");
  } catch {
    return redirectWithError(req, "user_upsert_failed");
  }

  try {
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
    const baseMeta =
      user.user_metadata && typeof user.user_metadata === "object"
        ? { ...(user.user_metadata as Record<string, unknown>) }
        : {};
    if (nick) baseMeta.nickname = nick;
    if (localeCookieRaw) baseMeta.preferred_language = normalizeAppLanguage(localeCookieRaw);
    const mergedUser = { ...user, user_metadata: baseMeta } as User;
    await Promise.race([
      ensureAuthProfileRow(serviceSb, mergedUser),
      new Promise<void>((resolve) => setTimeout(resolve, ENSURE_PROFILE_SOFT_TIMEOUT_MS)),
    ]);
    const sessionMeta = buildRequestSessionMeta(req);
    await syncActiveSessionForUser(user.id, response, {
      rotate: true,
      sessionMeta,
      loginIdentifier: user.email?.trim().toLowerCase() ?? null,
    });
  } catch {
    /* keep oauth success even if profile/session sync has drift */
  }

  response.cookies.set(SIGNUP_NICKNAME_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(APP_LANGUAGE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
