import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { clearActiveSessionCookie, readActiveSessionIdCookie } from "@/lib/auth/active-session";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import { requireAuth } from "@/lib/auth/server-guards";
import { invalidateUserSessionRegistry } from "@/lib/auth/user-session-registry";
import { parseJsonBody } from "@/lib/http/api-route";
import { deactivateAllUserDevicesForLogout } from "@/lib/push/dispatch/deactivate-failed-token";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CookieToSet = { name: string; value: string; options: CookieOptions };

type LogoutBody = {
  device_id?: unknown;
};

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

  if (userError || !user?.id) {
    return buildLogoutClearCookieResponse(request, { ok: true, already_logged_out: true }, 200, cookieSecure);
  }

  const auth = await requireAuth();
  if (!auth.ok) {
    return buildLogoutClearCookieResponse(request, { ok: true, already_logged_out: true }, 200, cookieSecure);
  }

  const sb = tryCreateSupabaseServiceClient();
  const currentSessionId = await readActiveSessionIdCookie();
  let registryError: string | null = null;
  let deviceDeactivateError: string | null = null;

  const parsed = await parseJsonBody<LogoutBody>(request);
  const deviceId =
    parsed.ok && typeof parsed.value.device_id === "string" ? parsed.value.device_id.trim() : "";

  if (sb && auth.userId) {
    try {
      await deactivateAllUserDevicesForLogout(sb, auth.userId, deviceId || null);
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
