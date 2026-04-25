export const SUPPORTED_AUTH_PROVIDERS = [
  "google",
  "kakao",
  "naver",
  "apple",
  "facebook",
] as const;

export type OAuthProvider = (typeof SUPPORTED_AUTH_PROVIDERS)[number];

export type AuthProviderRow = {
  id: string;
  provider: OAuthProvider;
  enabled: boolean;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  scope: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type AuthProviderPublic = Omit<AuthProviderRow, "client_secret">;

const SUPPORTED_PROVIDER_SET = new Set<string>(SUPPORTED_AUTH_PROVIDERS);

export function isSupportedOAuthProvider(value: string): value is OAuthProvider {
  return SUPPORTED_PROVIDER_SET.has(value);
}

export function normalizeOAuthProvider(value: unknown): OAuthProvider | null {
  if (typeof value !== "string") return null;
  const provider = value.trim().toLowerCase();
  if (!isSupportedOAuthProvider(provider)) return null;
  return provider;
}

export function getOAuthProviderLabel(provider: OAuthProvider): string {
  if (provider === "google") return "Google";
  if (provider === "kakao") return "Kakao";
  if (provider === "naver") return "Naver";
  if (provider === "apple") return "Apple";
  return "Facebook";
}

export function sortAuthProviders<T extends { sort_order: number; provider: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order || a.provider.localeCompare(b.provider));
}

export function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function hasRequiredOAuthKeys(row: Pick<AuthProviderRow, "client_id" | "client_secret" | "redirect_uri">): boolean {
  return (
    isNonEmptyText(row.client_id) &&
    isNonEmptyText(row.client_secret) &&
    isNonEmptyText(row.redirect_uri)
  );
}

export function buildRedirectWhitelist(requestOrigin?: string): string[] {
  const fromEnv = (process.env.AUTH_REDIRECT_URI_WHITELIST ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  const origin = requestOrigin
    ? requestOrigin.trim().replace(/\/+$/, "")
    : process.env.NEXT_PUBLIC_SITE_URL
      ? process.env.NEXT_PUBLIC_SITE_URL.trim().replace(/\/+$/, "")
      : "";
  const projectFallbackOrigins = ["https://samarket.vercel.app"];
  const fallback = [
    origin ? `${origin}/api/auth/oauth/callback` : "",
    origin ? `${origin}/api/auth/google/callback` : "",
    ...projectFallbackOrigins.flatMap((base) => [
      `${base}/api/auth/oauth/callback`,
      `${base}/api/auth/google/callback`,
    ]),
  ]
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(fallback));
}

function normalizeRedirectUrl(urlText: string): string | null {
  try {
    const parsed = new URL(urlText.trim());
    const normalizedPath = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return null;
  }
}

export function validateRedirectUriWithWhitelist(redirectUri: string, requestOrigin?: string): boolean {
  const whitelist = buildRedirectWhitelist(requestOrigin);
  if (whitelist.length === 0) return false;
  const targetRaw = redirectUri.trim();
  if (!targetRaw) return false;
  if (whitelist.includes(targetRaw)) return true;
  const normalizedTarget = normalizeRedirectUrl(targetRaw);
  if (!normalizedTarget) return false;
  return whitelist.some((allowed) => {
    if (allowed === targetRaw) return true;
    const normalizedAllowed = normalizeRedirectUrl(allowed);
    return normalizedAllowed === normalizedTarget;
  });
}
