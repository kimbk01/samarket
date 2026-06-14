import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const perm = await requireAdminPermission("users");
  if (!perm.ok) return perm.response;

  const userId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
  if (!userId) {
    return NextResponse.json({ ok: false, error: "user_id_required" }, { status: 400 });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const { data: devices, error: devErr } = await svc
    .from("user_devices")
    .select("id, user_id, platform, device_id, push_provider, is_active, last_seen_at, app_version, created_at, updated_at")
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: false });

  if (devErr) {
    if (devErr.message?.includes("does not exist") || devErr.code === "42P01") {
      return NextResponse.json({ ok: true, devices: [], deliveries: [], table_missing: true });
    }
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  const { data: deliveries, error: delErr } = await svc
    .from("notification_deliveries")
    .select("id, device_id, event_type, status, provider_response, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (delErr && !delErr.message?.includes("does not exist")) {
    return NextResponse.json({ ok: false, error: "delivery_query_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    devices: (devices ?? []).map((d) => ({
      ...d,
      push_token_preview: null,
    })),
    deliveries: deliveries ?? [],
  });
}
