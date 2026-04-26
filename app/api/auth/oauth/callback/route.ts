import type { User } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { normalizeOAuthProvider } from "@/lib/auth/auth-providers";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { ensureAuthProfileRow } from "@/lib/auth/member-access";
import { hasStoreTermsConsent } from "@/lib/auth/store-member-policy";
import { buildRequestSessionMeta } from "@/lib/auth/request-device-info";
import { syncActiveSessionForUser } from "@/lib/auth/server-guards";
import { APP_LANGUAGE_COOKIE, normalizeAppLanguage } from "@/lib/i18n/config";
import { ensureProfileForUserId } from "@/lib/profile/ensure-profile-for-user-id";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNUP_NICKNAME_COOKIE = "samarket_signup_nickname";

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

  const {
    data: { session, user },
    error: exchangeError,
  } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !session || !user) {
    return redirectWithError(req, "callback_failed");
  }

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

  /**
   * OAuth 콜백 시점에 `profiles` INSERT 가 트리거 / 제약을 모두 통과하려면 service_role 이 필요하다.
   * 운영자 설정이 누락된 경우 사용자에게 즉시 원인을 노출 (조용히 실패 → 로그인 루프 방지).
   */
  const serviceSb = tryCreateSupabaseServiceClient();
  const profileSb = serviceSb ?? supabase;

  const providerId = resolveProviderId(user, provider);
  if (!providerId) return redirectWithError(req, "provider_id_missing");

  const usersRegistryPromise = (serviceSb ?? supabase)
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
    .select("id")
    .then(
      () => undefined,
      () => undefined
    );

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

  /**
   * 첫 INSERT 시도 (권장 경로). 실패하더라도 세션은 이미 발급되었으므로
   * 응답 쿠키(`response`)를 잃지 않고 mypage 로 진행한다.
   * mypage 서버 로더 + 클라이언트 `/api/auth/profile/ensure` 가
   * 동일한 3단(full → minimal → id-only) fallback 으로 한 번 더 보정한다.
   */
  let accessState: Awaited<ReturnType<typeof ensureAuthProfileRow>> | null = null;
  try {
    accessState = await ensureAuthProfileRow(profileSb, mergedUser);
  } catch (ensureError) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[oauth/callback] ensureAuthProfileRow failed (will retry on /mypage)", {
        message: (ensureError as Error)?.message,
        userId: user.id,
      });
    }
    if (serviceSb) {
      try {
        const fallback = await ensureProfileForUserId(serviceSb, user.id);
        if (fallback) {
          accessState = await ensureAuthProfileRow(serviceSb, mergedUser).catch(() => null);
        }
      } catch {
        // 다음 mypage 진입에서 다시 보정
      }
    }
  }

  if (accessState && !hasStoreTermsConsent({
    terms_accepted_at: accessState.termsAcceptedAt ?? null,
    terms_version: accessState.termsVersion ?? null,
    privacy_accepted_at: accessState.privacyAcceptedAt ?? null,
    privacy_version: accessState.privacyVersion ?? null,
  })) {
    const consentUrl = new URL("/auth/consent", req.url);
    consentUrl.searchParams.set("next", POST_LOGIN_PATH);
    response.headers.set("Location", consentUrl.toString());
  }

  /**
   * `public.users` 레지스트리는 보조 인덱스다.
   * 필수 프로필 보장과 병렬로 진행하되, 실패해도 로그인 자체를 막지 않는다.
   */
  await usersRegistryPromise;

  const sessionMeta = buildRequestSessionMeta(req);
  try {
    await syncActiveSessionForUser(user.id, response, {
      rotate: true,
      sessionMeta,
      loginIdentifier: user.email?.trim().toLowerCase() ?? null,
    });
  } catch {
    return redirectWithError(req, "session_sync_failed");
  }

  response.cookies.set(SIGNUP_NICKNAME_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(APP_LANGUAGE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
