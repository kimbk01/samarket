import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const { data, error } = await svc
    .from("notification_events")
    .select("id,category,title,body,display_payload,created_at")
    .eq("user_id", userId)
    .eq("unread", true)
    .is("read_at", null)
    .in("category", ["admin_marketing_banner", "admin_notice"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: true, banner: null });

  const payload =
    data.display_payload && typeof data.display_payload === "object"
      ? (data.display_payload as Record<string, unknown>)
      : null;
  const routeUrl = typeof payload?.routeUrl === "string" ? payload.routeUrl.trim() : "";

  return NextResponse.json({
    ok: true,
    banner: {
      id: String(data.id),
      category: String(data.category),
      title: String(data.title ?? ""),
      body: String(data.body ?? ""),
      routeUrl: routeUrl || "/community",
      createdAt: String(data.created_at ?? ""),
    },
  });
}
