import { type NextRequest, NextResponse } from "next/server";
import { clearActiveSessionCookie, readActiveSessionIdCookie } from "@/lib/auth/active-session";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import { getCurrentProfile, requireAuth } from "@/lib/auth/server-guards";
import { invalidateAllUserSessionRegistry } from "@/lib/auth/user-session-registry";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 모든 기기 로그아웃 — registry 전체 revoke + Supabase global signOut.
 */
export async function POST(request: NextRequest) {
  const cookieSecure = cookieSecureFromNextRequest(request);
  const routeSb = await createSupabaseRouteHandlerClient();
  if (!routeSb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const auth = await requireAuth();
  if (!auth.ok) {
    const response = NextResponse.json({ ok: true, already_logged_out: true });
    await clearActiveSessionCookie(response, cookieSecure);
    return response;
  }

  const sb = tryCreateSupabaseServiceClient();
  const currentSessionId = await readActiveSessionIdCookie();

  if (sb) {
    try {
      await invalidateAllUserSessionRegistry(sb, auth.userId, "global_signout");
      const profile = await getCurrentProfile(auth.userId);
      const activeSessionId = (profile?.active_session_id ?? "").trim();
      if (activeSessionId) {
        await sb
          .from("profiles")
          .update({
            active_session_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", auth.userId);
      }
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "logout_all_cleanup_failed",
        },
        { status: 500 }
      );
    }
  } else if (currentSessionId) {
    /* degraded */
  }

  try {
    await routeSb.auth.signOut({ scope: "global" });
  } catch {
    /* client may have already global signOut */
  }

  const response = NextResponse.json({ ok: true });
  await clearActiveSessionCookie(response, cookieSecure);
  return response;
}
