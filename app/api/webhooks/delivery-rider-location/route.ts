import { NextRequest, NextResponse } from "next/server";
import { enforceWebhookRateLimit } from "@/lib/security/webhook-ip-rate-limit";
import { verifyDeliveryRiderLocationWebhookSecret } from "@/lib/payments/delivery-rider-location-webhook-secret";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadDeliveryRiderLocationEnabled } from "@/lib/delivery/delivery-ops-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  rider_id?: string;
  lat?: number;
  lng?: number;
  is_online?: boolean;
  last_active_at?: string;
};

export async function POST(req: NextRequest) {
  const rl = await enforceWebhookRateLimit(req, "delivery-rider-location");
  if (!rl.ok) return rl.response;

  if (
    !verifyDeliveryRiderLocationWebhookSecret(req.headers.get("x-delivery-rider-location-webhook-secret"))
  ) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const riderId = typeof body.rider_id === "string" ? body.rider_id.trim() : "";
  if (!riderId) return NextResponse.json({ ok: false, error: "missing_rider_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const enabled = await loadDeliveryRiderLocationEnabled(sb);
  if (!enabled) {
    // Separate 운영(예: 필리핀 파트너)에서 올 수 있으므로 200 OK로 ACK만 하고 DB 반영은 하지 않는다.
    return NextResponse.json({ ok: true, applied: false, reason: "rider_location_disabled" });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ ok: false, error: "invalid_lat_lng" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    current_lat: lat,
    current_lng: lng,
    last_active_at: typeof body.last_active_at === "string" && body.last_active_at.trim()
      ? body.last_active_at.trim()
      : new Date().toISOString(),
  };
  if (typeof body.is_online === "boolean") patch.is_online = body.is_online;

  const { error } = await sb.from("delivery_riders").update(patch).eq("id", riderId);
  if (error) {
    if (/delivery_riders/i.test(String(error.message)) && /does not exist/i.test(String(error.message))) {
      return NextResponse.json({ ok: false, error: "schema_missing_delivery_riders" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, applied: true });
}

