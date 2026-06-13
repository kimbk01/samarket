import { NATIVE_OAUTH_CALLBACK_URL } from "@/lib/auth/oauth/config";

export type OAuthRedirectMismatchReason =
  | "native_https_redirect"
  | "supabase_whitelist_fallback"
  | "redirect_to_missing"
  | null;

function normalizeRedirectOrigin(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/$/, "") || ""}`;
  } catch {
    return trimmed.split("?")[0]?.replace(/\/$/, "") ?? null;
  }
}

function isNativeSchemeRedirect(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    return new URL(trimmed).protocol === "dibay:";
  } catch {
    return trimmed.startsWith("dibay://");
  }
}

function isHttpsRedirect(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    return new URL(trimmed).protocol === "https:" || new URL(trimmed).protocol === "http:";
  } catch {
    return trimmed.startsWith("https://") || trimmed.startsWith("http://");
  }
}

export function assertNativeOAuthRedirectExpected(
  redirectTo: string,
  isNative: boolean,
): {
  ok: boolean;
  reason: OAuthRedirectMismatchReason;
} {
  if (!isNative) {
    return { ok: true, reason: null };
  }

  if (isNativeSchemeRedirect(redirectTo)) {
    return { ok: true, reason: null };
  }

  if (isHttpsRedirect(redirectTo)) {
    return { ok: false, reason: "native_https_redirect" };
  }

  return { ok: false, reason: "native_https_redirect" };
}

export function detectRedirectToMismatch(
  requestedRedirectTo: string,
  authorizeRedirectTo: string | null,
): { mismatch: boolean; reason: OAuthRedirectMismatchReason } {
  const requested = requestedRedirectTo.trim();
  const extracted = authorizeRedirectTo?.trim() ?? "";
  if (!requested || !extracted) {
    return { mismatch: false, reason: null };
  }

  const requestedOrigin = normalizeRedirectOrigin(requested);
  const extractedOrigin = normalizeRedirectOrigin(extracted);
  if (requestedOrigin && extractedOrigin && requestedOrigin === extractedOrigin) {
    return { mismatch: false, reason: null };
  }

  const nativeRequested = isNativeSchemeRedirect(requested);
  const httpsExtracted = isHttpsRedirect(extracted);

  if (nativeRequested && httpsExtracted) {
    return { mismatch: true, reason: "supabase_whitelist_fallback" };
  }

  if (requested !== extracted) {
    return { mismatch: true, reason: "supabase_whitelist_fallback" };
  }

  return { mismatch: false, reason: null };
}

export function isNativeOAuthCallbackUrl(url: string): boolean {
  const normalized = normalizeRedirectOrigin(url);
  const nativeBase = normalizeRedirectOrigin(NATIVE_OAUTH_CALLBACK_URL);
  return normalized === nativeBase;
}

export function assertNativeAuthorizeRedirectToPresent(
  authorizeRedirectTo: string | null,
  isNative: boolean,
): {
  ok: boolean;
  reason: OAuthRedirectMismatchReason;
} {
  if (!isNative) {
    return { ok: true, reason: null };
  }

  const extracted = authorizeRedirectTo?.trim() ?? "";
  if (!extracted) {
    return { ok: false, reason: "redirect_to_missing" };
  }

  return { ok: true, reason: null };
}
