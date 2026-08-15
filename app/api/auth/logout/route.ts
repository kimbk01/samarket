import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { clearActiveSessionCookie, readActiveSessionIdCookie } from "@/lib/auth/active-session";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import { requireAuth } from "@/lib/auth/server-guards";
import { invalidateUserSessionRegistry } from "@/lib/auth/user-session-registry";
import { parseJsonBody } from "@/lib/http/api-route";
import { deactivateBoundDeviceByTokenProof } from "@/lib/push/dispatch/deactivate-bound-device-by-token-proof";
import { deactivateAllUserDevicesForLogout } from "@/lib/push/dispatch/deactivate-failed-token";
import { resolvePushEnvironment } from "@/lib/push/push-environment";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CookieToSet = { name: string; value: string; options: CookieOptions };

type LogoutBody = {
  device_id?: unknown;
  push_token?: unknown;
  push_provider?: unknown;
};

async function cleanupTrustedDeviceBindingFromLogoutBody(
  body: LogoutBody | null | undefined,
): Promise<string | null> {
  const deviceId = typeof body?.device_id === "string" ? body.device_id.trim() : "";
  const pushToken = typeof body?.push_token === "string" ? body.push_token.trim() : "";
  const pushProvider =
    typeof body?.push_provider === "string" ? body.push_provider.trim().toLowerCase() : "fcm";
  if (!deviceId || !pushToken) return null;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return "server_misconfigured";

  try {
    const result = await deactivateBoundDeviceByTokenProof(sb, {
      deviceId,
      pushToken,
      pushProvider: pushProvider || "fcm",
      environment: resolvePushEnvironment(),
    });
    if (!result.ok) {
      console.warn("[auth/logout] already_guest_device_unbind_miss", {
        deviceId,
        error: result.error,
      });
      return result.error;
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "logout_device_unbind_failed";
    console.warn("[auth/logout] already_guest_device_unbind_failed", { deviceId, error: message });
    return message;
  }
}

function requestSupabaseAuthCookieNames(request: NextRequest): string[] {
  return request.cookies
    .getAll()
    .filter(
      ({ name }) =>
        (name.startsWith("sb-") && (name.includes("auth-token") || name.includes("code-verifier"))) ||
        name === "supabase.auth.token" ||
        name.startsWith("supabase.auth.token.")
    )
    .map(({ name }) => name);
}

function mergeAuthCookies(from: NextResponse, to: NextResponse): void {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
}

function applyNoStoreHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  return response;
}

async function buildLogoutClearCookieResponse(
  request: NextRequest,
  body: Record<string, unknown>,
  status: number,
  cookieSecure: boolean
): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  let cookieCarrier = NextResponse.next({
    request: { headers: request.headers },
  });

  if (url && anon) {
    const supabase = createServerClient(url, anon, {
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        secure: cookieSecure,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          cookieCarrier = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieCarrier.cookies.set(name, value, options);
          });
        },
      },
    });

    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* client may have already local signOut */
    }
  }

  const response = NextResponse.json(body, { status });
  mergeAuthCookies(cookieCarrier, response);

  for (const name of requestSupabaseAuthCookieNames(request)) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
      secure: cookieSecure,
    });
  }

  await clearActiveSessionCookie(response, cookieSecure);
  return applyNoStoreHeaders(response);
}

/**
 * 현재 기기 로그아웃 — user_sessions 현재 row 만 invalidate.
 * Supabase global signOut 금지 (다른 기기 세션 유지).
 */
export async function POST(request: NextRequest) {
  const cookieSecure = cookieSecureFromNextRequest(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anon) {
    return buildLogoutClearCookieResponse(
      request,
      { ok: false, error: "supabase_unconfigured" },
      503,
      cookieSecure
    );
  }

  let cookieCarrier = NextResponse.next({
    request: { headers: request.headers },
  });

  const routeSb = createServerClient(url, anon, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: cookieSecure,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        cookieCarrier = NextResponse.next({
          request: { headers: request.headers },
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieCarrier.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await routeSb.auth.getUser();

  const parsed = await parseJsonBody<LogoutBody>(request);
  const logoutBody = parsed.ok ? parsed.value : {};
  const deviceId = typeof logoutBody.device_id === "string" ? logoutBody.device_id.trim() : "";
  const pushToken = typeof logoutBody.push_token === "string" ? logoutBody.push_token.trim() : "";
  const pushProvider =
    typeof logoutBody.push_provider === "string" ? logoutBody.push_provider.trim().toLowerCase() : "";

  if (userError || !user?.id) {
    // AUTH ALREADY GUEST — still unbind this install when trusted token proof is present.
    const unbindWarning = await cleanupTrustedDeviceBindingFromLogoutBody(logoutBody);
    return buildLogoutClearCookieResponse(
      request,
      {
        ok: true,
        already_logged_out: true,
        device_unbind_warning: unbindWarning,
      },
      200,
      cookieSecure,
    );
  }

  const auth = await requireAuth();
  if (!auth.ok) {
    const unbindWarning = await cleanupTrustedDeviceBindingFromLogoutBody(logoutBody);
    return buildLogoutClearCookieResponse(
      request,
      {
        ok: true,
        already_logged_out: true,
        device_unbind_warning: unbindWarning,
      },
      200,
      cookieSecure,
    );
  }

  const sb = tryCreateSupabaseServiceClient();
  const currentSessionId = await readActiveSessionIdCookie();
  let registryError: string | null = null;
  let deviceDeactivateError: string | null = null;

  if (sb && auth.userId) {
    try {
      await deactivateAllUserDevicesForLogout(sb, auth.userId, deviceId || null);
      if (deviceId && pushToken) {
        await deactivateBoundDeviceByTokenProof(sb, {
          deviceId,
          pushToken,
          pushProvider: pushProvider || "fcm",
          environment: resolvePushEnvironment(),
        });
      }
    } catch (error) {
      deviceDeactivateError =
        error instanceof Error ? error.message : "logout_device_deactivate_failed";
      console.warn("[auth/logout] device_deactivate_failed", {
        userId: auth.userId,
        deviceId: deviceId || null,
        error: deviceDeactivateError,
      });
    }
  }

  if (sb && currentSessionId) {
    try {
      await invalidateUserSessionRegistry(sb, auth.userId, currentSessionId, "user_logout");
    } catch (error) {
      registryError =
        error instanceof Error ? error.message : "logout_session_cleanup_failed";
    }
  }

  if (registryError) {
    return buildLogoutClearCookieResponse(
      request,
      { ok: false, error: registryError },
      500,
      cookieSecure
    );
  }

  return buildLogoutClearCookieResponse(
    request,
    { ok: true, device_deactivate_warning: deviceDeactivateError },
    200,
    cookieSecure,
  );
}
