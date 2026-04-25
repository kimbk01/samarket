import { createHash, randomBytes } from "crypto";
import {
  isNonEmptyText,
  type AuthProviderRow,
  type OAuthProvider,
} from "@/lib/auth/auth-providers";

type OAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  id_token?: string;
};

export type OAuthUserProfile = {
  provider: OAuthProvider;
  provider_id: string;
  email: string;
  name: string;
  phone: string | null;
};

type OauthEndpoints = {
  authorize: string;
  token: string;
  userinfo?: string;
};

const ENDPOINTS: Record<OAuthProvider, OauthEndpoints> = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    userinfo: "https://www.googleapis.com/oauth2/v2/userinfo",
  },
  kakao: {
    authorize: "https://kauth.kakao.com/oauth/authorize",
    token: "https://kauth.kakao.com/oauth/token",
    userinfo: "https://kapi.kakao.com/v2/user/me",
  },
  naver: {
    authorize: "https://nid.naver.com/oauth2.0/authorize",
    token: "https://nid.naver.com/oauth2.0/token",
    userinfo: "https://openapi.naver.com/v1/nid/me",
  },
  apple: {
    authorize: "https://appleid.apple.com/auth/authorize",
    token: "https://appleid.apple.com/auth/token",
  },
  facebook: {
    authorize: "https://www.facebook.com/v17.0/dialog/oauth",
    token: "https://graph.facebook.com/v17.0/oauth/access_token",
    userinfo: "https://graph.facebook.com/me?fields=id,name,email",
  },
};

const OAUTH_STATE_COOKIE = "sam_oauth_state";
const OAUTH_STATE_TTL_SECONDS = 600;

function decodeJwtPayload(idToken: string): Record<string, unknown> | null {
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toQueryString(params: Record<string, string>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    search.set(key, value);
  }
  return search.toString();
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createOauthState(provider: OAuthProvider): { state: string; cookieValue: string } {
  const raw = randomBytes(20).toString("hex");
  const state = `${provider}.${raw}`;
  const cookieValue = `${provider}:${sha256Hex(state)}`;
  return { state, cookieValue };
}

export function getOauthStateCookieMeta() {
  return {
    name: OAUTH_STATE_COOKIE,
    maxAge: OAUTH_STATE_TTL_SECONDS,
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
  };
}

export function verifyOauthState(provider: OAuthProvider, state: string, cookieValue: string | undefined): boolean {
  if (!isNonEmptyText(cookieValue)) return false;
  const [cookieProvider, cookieHash] = cookieValue.split(":");
  if (cookieProvider !== provider || !isNonEmptyText(cookieHash)) return false;
  return sha256Hex(state) === cookieHash;
}

export function buildAuthorizeUrl(config: AuthProviderRow, state: string): string {
  const endpoint = ENDPOINTS[config.provider].authorize;
  const query = toQueryString({
    client_id: config.client_id.trim(),
    redirect_uri: config.redirect_uri.trim(),
    response_type: "code",
    scope: config.scope.trim(),
    state,
  });
  return `${endpoint}?${query}`;
}

export async function exchangeOAuthToken(params: {
  provider: OAuthProvider;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  state?: string;
}): Promise<OAuthTokenResponse> {
  const endpoint = ENDPOINTS[params.provider].token;
  const form = new URLSearchParams();
  form.set("grant_type", "authorization_code");
  form.set("client_id", params.clientId);
  form.set("client_secret", params.clientSecret);
  form.set("code", params.code);
  form.set("redirect_uri", params.redirectUri);
  if (params.provider === "naver" && params.state) {
    form.set("state", params.state);
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as
    | (OAuthTokenResponse & { error?: string; error_description?: string })
    | null;
  if (!res.ok || !json?.access_token) {
    throw new Error(json?.error_description || json?.error || "oauth_token_exchange_failed");
  }
  return json;
}

export async function fetchOAuthUserProfile(
  provider: OAuthProvider,
  token: OAuthTokenResponse
): Promise<OAuthUserProfile> {
  if (provider === "google") {
    const res = await fetch(ENDPOINTS.google.userinfo!, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as
      | { id?: string; email?: string; name?: string }
      | null;
    if (!res.ok || !isNonEmptyText(json?.id)) throw new Error("oauth_google_userinfo_failed");
    return {
      provider,
      provider_id: String(json.id),
      email: String(json?.email ?? ""),
      name: String(json?.name ?? ""),
      phone: null,
    };
  }
  if (provider === "kakao") {
    const res = await fetch(ENDPOINTS.kakao.userinfo!, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as
      | {
          id?: number | string;
          kakao_account?: { email?: string; phone_number?: string; profile?: { nickname?: string } };
          properties?: { nickname?: string };
        }
      | null;
    if (!res.ok || !isNonEmptyText(String(json?.id ?? ""))) throw new Error("oauth_kakao_userinfo_failed");
    return {
      provider,
      provider_id: String(json?.id),
      email: String(json?.kakao_account?.email ?? ""),
      name: String(json?.kakao_account?.profile?.nickname ?? json?.properties?.nickname ?? ""),
      phone: json?.kakao_account?.phone_number ?? null,
    };
  }
  if (provider === "naver") {
    const res = await fetch(ENDPOINTS.naver.userinfo!, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as
      | { response?: { id?: string; email?: string; name?: string; mobile?: string } }
      | null;
    const response = json?.response;
    if (!res.ok || !isNonEmptyText(response?.id)) throw new Error("oauth_naver_userinfo_failed");
    return {
      provider,
      provider_id: String(response?.id),
      email: String(response?.email ?? ""),
      name: String(response?.name ?? ""),
      phone: response?.mobile ?? null,
    };
  }
  if (provider === "facebook") {
    const endpoint = `${ENDPOINTS.facebook.userinfo!}&access_token=${encodeURIComponent(token.access_token)}`;
    const res = await fetch(endpoint, { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as
      | { id?: string; email?: string; name?: string }
      | null;
    if (!res.ok || !isNonEmptyText(json?.id)) throw new Error("oauth_facebook_userinfo_failed");
    return {
      provider,
      provider_id: String(json.id),
      email: String(json?.email ?? ""),
      name: String(json?.name ?? ""),
      phone: null,
    };
  }
  const payload = token.id_token ? decodeJwtPayload(token.id_token) : null;
  if (!payload || !isNonEmptyText(payload.sub)) {
    throw new Error("oauth_apple_userinfo_failed");
  }
  return {
    provider,
    provider_id: String(payload.sub),
    email: String(payload.email ?? ""),
    name: String(payload.name ?? payload.email ?? ""),
    phone: null,
  };
}
