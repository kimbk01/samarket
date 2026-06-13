import { createServerClient } from "@supabase/ssr";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";

export const SUPABASE_OAUTH_PROVIDER_SET = new Set(["google", "kakao", "apple"]);
export const NATIVE_OAUTH_CALLBACK_URL = "dibay://auth/callback";
export const WEB_OAUTH_CALLBACK_ORIGIN = "https://samarket.vercel.app";
const KAKAO_SCOPE = "profile_nickname profile_image";

export type SupabaseOAuthProvider = "google" | "kakao" | "apple";

export type OAuthCookieStore = {
  getAll(): { name: string; value: string }[];
  setAll(
    cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[],
  ): void;
};

export type SupabaseOAuthStartSuccess = {
  ok: true;
  authorizeUrl: string;
  provider: SupabaseOAuthProvider;
  redirectTo: string;
};

export type SupabaseOAuthStartFailure = {
  ok: false;
  errorCode: string;
  message: string;
  status: number;
};

export type SupabaseOAuthStartResult = SupabaseOAuthStartSuccess | SupabaseOAuthStartFailure;

export function normalizeSupabaseOAuthProvider(value: string | null | undefined): SupabaseOAuthProvider | null {
  const provider = value?.trim().toLowerCase() ?? "";
  return SUPABASE_OAUTH_PROVIDER_SET.has(provider)
    ? (provider as SupabaseOAuthProvider)
    : null;
}

export function buildOAuthRedirectTo(
  provider: SupabaseOAuthProvider,
  native: boolean,
  next: string | null,
): string {
  const callback = native
    ? new URL(NATIVE_OAUTH_CALLBACK_URL)
    : new URL("/auth/callback", WEB_OAUTH_CALLBACK_ORIGIN);
  callback.searchParams.set("provider", provider);
  if (next) {
    callback.searchParams.set("next", next);
  }
  return callback.toString();
}

function kakaoProviderOptions(provider: SupabaseOAuthProvider) {
  return provider === "kakao" ? { queryParams: { scope: KAKAO_SCOPE } } : {};
}

function createOAuthSupabaseClient(cookieStore: OAuthCookieStore, secureCookies: boolean) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) return null;

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: secureCookies,
    },
    cookies: cookieStore,
  });
}

export async function runSupabaseOAuthStart(input: {
  provider: SupabaseOAuthProvider;
  native: boolean;
  next: string | null | undefined;
  cookieStore: OAuthCookieStore;
  secureCookies: boolean;
}): Promise<SupabaseOAuthStartResult> {
  const safeNext = sanitizeNextPath(input.next);
  const redirectTo = buildOAuthRedirectTo(input.provider, input.native, safeNext);
  const supabase = createOAuthSupabaseClient(input.cookieStore, input.secureCookies);
  if (!supabase) {
    return {
      ok: false,
      errorCode: "supabase_unconfigured",
      message: "Supabase OAuth is not configured.",
      status: 503,
    };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: input.provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      ...kakaoProviderOptions(input.provider),
    },
  });

  if (error) {
    return {
      ok: false,
      errorCode: "oauth_start_failed",
      message: error.message || "OAuth start failed.",
      status: 400,
    };
  }

  const authorizeUrl = data?.url?.trim();
  if (!authorizeUrl) {
    return {
      ok: false,
      errorCode: "missing_authorize_url",
      message: "Supabase did not return an authorize URL.",
      status: 400,
    };
  }

  return {
    ok: true,
    authorizeUrl,
    provider: input.provider,
    redirectTo,
  };
}
