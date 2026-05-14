import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  DELIVERY_OPS_SETTING_KEYS,
  invalidateDeliveryRideTimeSourceCache,
  normalizeDeliveryRideTimeSource,
  type DeliveryRideTimeSource,
} from "@/lib/delivery/delivery-ops-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readBoolSetting(row: { value_json?: unknown } | null | undefined): boolean {
  const v = row?.value_json as { value?: unknown } | null | undefined;
  return v?.value === true;
}

export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { data, error } = await sb
    .from("admin_settings")
    .select("key, value_json")
    .in("key", [DELIVERY_OPS_SETTING_KEYS.riderLocationEnabled, DELIVERY_OPS_SETTING_KEYS.rideTimeSource]);
  if (error) {
    if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as { key?: string; value_json?: unknown }[];
  const riderRow = rows.find((r) => r.key === DELIVERY_OPS_SETTING_KEYS.riderLocationEnabled);
  const rideRow = rows.find((r) => r.key === DELIVERY_OPS_SETTING_KEYS.rideTimeSource);
  const rideJson = rideRow?.value_json as { value?: unknown } | null | undefined;
  const ride_time_source: DeliveryRideTimeSource = normalizeDeliveryRideTimeSource(rideJson?.value);

  return NextResponse.json({
    ok: true,
    rider_location_enabled: readBoolSetting(riderRow ?? null),
    ride_time_source,
  });
}

type PutBody = {
  rider_location_enabled?: boolean | null;
  ride_time_source?: DeliveryRideTimeSource | null;
};

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
  const hasRider = "rider_location_enabled" in body;
  const hasRide = "ride_time_source" in body;
  if (!hasRider && !hasRide) {
    return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const afterJson: Record<string, unknown> = {};

  if (hasRider) {
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
        if (error.message?.includes("admin_settings") && error.message?.includes("does not exist")) {
          return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
        }
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
    }
    afterJson.rider_location_enabled = enable;
  }

  if (hasRide) {
    const src = normalizeDeliveryRideTimeSource(body.ride_time_source);
    if (body.ride_time_source === null) {
      const { error } = await sb.from("admin_settings").delete().eq("key", DELIVERY_OPS_SETTING_KEYS.rideTimeSource);
      if (error && !error.message?.includes("does not exist")) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      afterJson.ride_time_source = "store";
    } else {
      const { error } = await sb.from("admin_settings").upsert(
        {
          key: DELIVERY_OPS_SETTING_KEYS.rideTimeSource,
          value_json: { value: src },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
      if (error) {
        if (error.message?.includes("admin_settings") && error.message?.includes("does not exist")) {
          return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
        }
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      afterJson.ride_time_source = src;
    }
  }

  if (hasRide) {
    invalidateDeliveryRideTimeSourceCache();
  }

  const actorId = await getRouteUserId();
  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actorId,
    target_type: "delivery_ops_settings",
    target_id: "global",
    action: "delivery_ops_settings.update",
    after_json: afterJson,
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  const { data: data2, error: err2 } = await sb
    .from("admin_settings")
    .select("key, value_json")
    .in("key", [DELIVERY_OPS_SETTING_KEYS.riderLocationEnabled, DELIVERY_OPS_SETTING_KEYS.rideTimeSource]);
  if (err2) {
    return NextResponse.json({ ok: true, ...afterJson }, { status: 200 });
  }
  const rows2 = (data2 ?? []) as { key?: string; value_json?: unknown }[];
  const riderRow2 = rows2.find((r) => r.key === DELIVERY_OPS_SETTING_KEYS.riderLocationEnabled);
  const rideRow2 = rows2.find((r) => r.key === DELIVERY_OPS_SETTING_KEYS.rideTimeSource);
  const rideJson2 = rideRow2?.value_json as { value?: unknown } | null | undefined;

  return NextResponse.json({
    ok: true,
    rider_location_enabled: readBoolSetting(riderRow2 ?? null),
    ride_time_source: normalizeDeliveryRideTimeSource(rideJson2?.value),
  });
}
