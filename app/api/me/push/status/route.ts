import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getVapidPublicKeyForServer } from "@/lib/push/web-push-config";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = await createSupabaseRouteHandlerClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const { count, error } = await sb
    .from("web_push_subscriptions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", auth.userId);

  if (error) {
    if (error.message?.includes("does not exist") || error.code === "42P01") {
      return NextResponse.json({
        ok: true,
        vapid_configured: Boolean(getVapidPublicKeyForServer()),
        web_push_enabled: process.env.WEB_PUSH_ENABLED === "1",
        subscription_count: 0,
        table_missing: true,
      });
    }
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    vapid_configured: Boolean(getVapidPublicKeyForServer()),
    web_push_enabled: process.env.WEB_PUSH_ENABLED === "1",
    subscription_count: count ?? 0,
    table_missing: false,
  });
}
