import { NextResponse } from "next/server";
import { clearActiveSessionCookie, readActiveSessionIdCookie } from "@/lib/auth/active-session";
import { getCurrentProfile, requireAuth } from "@/lib/auth/server-guards";
import { invalidateUserSessionRegistry } from "@/lib/auth/user-session-registry";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const routeSb = await createSupabaseRouteHandlerClient();
  if (!routeSb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const {
    data: { user },
    error: userError,
  } = await routeSb.auth.getUser();
  if (userError || !user?.id) {
    const response = NextResponse.json({ ok: true, already_logged_out: true });
    clearActiveSessionCookie(response);
    return response;
  }

  const auth = await requireAuth();
  if (!auth.ok) {
    const response = NextResponse.json({ ok: true, already_logged_out: true });
    clearActiveSessionCookie(response);
    return response;
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    try {
      await routeSb.auth.signOut();
    } catch {
      // ignore
    }
    const response = NextResponse.json({ ok: true, degraded: "service_role_unconfigured" });
    clearActiveSessionCookie(response);
    return response;
  }

  const profile = await getCurrentProfile(auth.userId);
  const currentSessionId = await readActiveSessionIdCookie();
  const activeSessionId = (profile?.active_session_id ?? "").trim();

  try {
    if (currentSessionId && activeSessionId === currentSessionId) {
      const { error: profileError } = await sb
        .from("profiles")
        .update({
          active_session_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", auth.userId)
        .eq("active_session_id", currentSessionId);
      if (profileError) {
        return NextResponse.json(
          { ok: false, error: profileError.message || "logout_profile_cleanup_failed" },
          { status: 500 }
        );
      }
    }

    if (currentSessionId) {
      await invalidateUserSessionRegistry(sb, auth.userId, currentSessionId, "user_logout");
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "logout_session_cleanup_failed",
      },
      { status: 500 }
    );
  }

  try {
    await routeSb.auth.signOut();
  } catch {
    // Client logout verification will run immediately after this route returns.
  }

  const response = NextResponse.json({ ok: true });
  clearActiveSessionCookie(response);
  return response;
}
