import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const { data, error } = await svc
    .from("user_devices")
    .select("id, platform, push_provider, is_active, last_seen_at, app_version, device_id")
    .eq("user_id", auth.userId)
    .order("last_seen_at", { ascending: false });

  if (error) {
    if (error.message?.includes("does not exist") || error.code === "42P01") {
      return NextResponse.json({ ok: true, devices: [], table_missing: true });
    }
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  const devices = (data ?? []).map((row) => ({
    id: row.id,
    platform: row.platform,
    push_provider: row.push_provider,
    is_active: row.is_active,
    last_seen_at: row.last_seen_at,
    app_version: row.app_version,
    device_id: row.device_id,
  }));

  const activeCount = devices.filter((d) => d.is_active).length;

  return NextResponse.json({
    ok: true,
    devices,
    active_count: activeCount,
    has_native: devices.some((d) => d.is_active && (d.push_provider === "fcm" || d.push_provider === "apns")),
    has_voip: devices.some((d) => d.is_active && d.push_provider === "voip_apns"),
  });
}
