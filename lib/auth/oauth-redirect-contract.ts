import { NATIVE_OAUTH_CALLBACK_URL } from "@/lib/auth/capacitor-oauth-return";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

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

/**
 * native 환경에서 redirectTo 가 dibay scheme 인지 검증한다.
 * native인데 HTTPS redirect면 launch 전 FAIL-fast 대상.
 */
export function assertNativeOAuthRedirectExpected(redirectTo: string): {
  ok: boolean;
  reason: OAuthRedirectMismatchReason;
  isNative: boolean;
} {
  const isNative = isCapacitorNativePlatform();
  if (!isNative) {
    return { ok: true, reason: null, isNative: false };
  }

  if (isNativeSchemeRedirect(redirectTo)) {
    return { ok: true, reason: null, isNative: true };
  }

  if (isHttpsRedirect(redirectTo)) {
    return { ok: false, reason: "native_https_redirect", isNative: true };
  }

  return { ok: false, reason: "native_https_redirect", isNative: true };
}

/**
 * 요청한 redirectTo 와 Supabase authorize URL 내부 redirect_to 가 일치하는지 검증.
 * native에서 dibay 요청 + authorize URL이 https → Supabase whitelist 폴백.
 */
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

/**
 * native 환경에서 Supabase authorize URL 의 redirect_to 가 반드시 있어야 한다.
 * web/PWA 는 기존 흐름 유지(검사 스킵).
 */
export function assertNativeAuthorizeRedirectToPresent(authorizeRedirectTo: string | null): {
  ok: boolean;
  reason: OAuthRedirectMismatchReason;
} {
  if (!isCapacitorNativePlatform()) {
    return { ok: true, reason: null };
  }

  const extracted = authorizeRedirectTo?.trim() ?? "";
  if (!extracted) {
    return { ok: false, reason: "redirect_to_missing" };
  }

  return { ok: true, reason: null };
}
