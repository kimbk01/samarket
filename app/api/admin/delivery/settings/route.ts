import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { DELIVERY_OPS_SETTING_KEYS } from "@/lib/delivery/delivery-ops-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", DELIVERY_OPS_SETTING_KEYS.riderLocationEnabled)
    .maybeSingle();
  if (error) {
    if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const raw = (data as { value_json?: unknown } | null)?.value_json as { value?: unknown } | null;
  return NextResponse.json({ ok: true, rider_location_enabled: raw?.value === true });
}

type PutBody = { rider_location_enabled?: boolean | null };

export async function PUT(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!("rider_location_enabled" in body)) {
    return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const v = body.rider_location_enabled;
  const enable = v === true;
  if (v === null) {
    const { error } = await sb.from("admin_settings").delete().eq("key", DELIVERY_OPS_SETTING_KEYS.riderLocationEnabled);
    if (error && !error.message?.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await sb.from("admin_settings").upsert(
      {
        key: DELIVERY_OPS_SETTING_KEYS.riderLocationEnabled,
        value_json: { value: enable },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    if (error) {
      if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
        return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  const actorId = await getRouteUserId();
  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actorId,
    target_type: "delivery_ops_settings",
    target_id: "global",
    action: "delivery_ops_settings.update",
    after_json: { rider_location_enabled: enable },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json({ ok: true, rider_location_enabled: enable });
}

