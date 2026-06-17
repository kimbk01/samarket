import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const AUTH_ROUTE_SUPABASE_SOFT_TIMEOUT_MS = 2_000;
export const PROFILE_ROUTE_SUPABASE_SOFT_TIMEOUT_MS = 2_500;

const AUTH_SESSION_RATE_LIMIT = {
  limit: 24,
  windowMs: 5_000,
  retryAfterSec: 5,
} as const;

const PROFILE_LITE_RATE_LIMIT = {
  limit: 24,
  windowMs: 5_000,
  retryAfterSec: 5,
} as const;

export function isSupabaseAuthCookieName(name: string): boolean {
  if (name.startsWith("sb-") && (name.includes("auth-token") || name.includes("code-verifier"))) {
    return true;
  }
  if (name === "supabase.auth.token" || name.startsWith("supabase.auth.token.")) {
    return true;
  }
  return false;
}

export function cookieHeaderHasSupabaseAuthCookies(cookieHeader: string): boolean {
  const raw = cookieHeader.trim();
  if (!raw) return false;
  for (const part of raw.split(";")) {
    const name = part.trim().split("=")[0]?.trim() ?? "";
    if (name && isSupabaseAuthCookieName(name)) return true;
  }
  return false;
}

export function requestHasSupabaseAuthCookies(request: NextRequest): boolean {
  for (const { name } of request.cookies.getAll()) {
    if (isSupabaseAuthCookieName(name)) return true;
  }
  return false;
}

function logAuthRoute(tag: string, payload: Record<string, unknown>): void {
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  console.info(tag, JSON.stringify({ at: Date.now(), ...payload }));
}

export function logAuthSessionRoute(event: string, payload: Record<string, unknown> = {}): void {
  logAuthRoute(`[auth-session-route] ${event}`, payload);
}

export function logProfileLiteRoute(event: string, payload: Record<string, unknown> = {}): void {
  logAuthRoute(`[profile-lite] ${event}`, payload);
}

export function buildMissingAuthCookie401Response(
  extra: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      authenticated: false,
      reason: "missing_auth_cookie",
      ...extra,
    },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export function buildAuthRouteSoftTimeoutResponse(
  route: string,
  phase: string,
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      softFail: true,
      reason: "soft_timeout",
      route,
      phase,
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "5",
      },
    },
  );
}

export function buildAuthRouteRateLimitedResponse(retryAfterSec = AUTH_SESSION_RATE_LIMIT.retryAfterSec): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      reason: "rate_limited",
      authenticated: false,
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfterSec),
      },
    },
  );
}

export async function enforceAuthSessionRouteRateLimit(
  request: NextRequest,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const key = `auth-session:${getRateLimitKey(request)}`;
  const rl = await enforceRateLimit({
    key,
    limit: AUTH_SESSION_RATE_LIMIT.limit,
    windowMs: AUTH_SESSION_RATE_LIMIT.windowMs,
    message: "세션 확인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    code: "auth_session_rate_limited",
  });
  if (!rl.ok) {
    return { ok: false, response: buildAuthRouteRateLimitedResponse(AUTH_SESSION_RATE_LIMIT.retryAfterSec) };
  }
  return { ok: true };
}

export async function enforceProfileLiteRouteRateLimit(
  request: NextRequest,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const key = `profile-lite:${getRateLimitKey(request)}`;
  const rl = await enforceRateLimit({
    key,
    limit: PROFILE_LITE_RATE_LIMIT.limit,
    windowMs: PROFILE_LITE_RATE_LIMIT.windowMs,
    message: "프로필 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    code: "profile_lite_rate_limited",
  });
  if (!rl.ok) {
    return { ok: false, response: buildAuthRouteRateLimitedResponse(PROFILE_LITE_RATE_LIMIT.retryAfterSec) };
  }
  return { ok: true };
}

export type SoftTimeoutResult<T> =
  | { ok: true; value: T }
  | { ok: false; softTimeout: true };

export async function withAuthRouteSoftTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<SoftTimeoutResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`soft_timeout:${label}`));
        }, timeoutMs);
      }),
    ]);
    return { ok: true, value };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("soft_timeout:")) {
      return { ok: false, softTimeout: true };
    }
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
