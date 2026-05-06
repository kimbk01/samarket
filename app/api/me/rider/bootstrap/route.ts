import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getDeliveryRiderForUser } from "@/lib/stores/store-order-delivery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function utcDayStartIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

export async function GET() {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const riderGate = await getDeliveryRiderForUser(sb, userId);
  if (!riderGate.ok) {
    return NextResponse.json({ ok: false, error: riderGate.error }, { status: riderGate.httpStatus });
  }

  const rider = riderGate.rider;
  const dayStart = utcDayStartIso();

  const { data: rows, error: qErr } = await sb
    .from("store_order_deliveries")
    .select("delivery_status, delivered_at, updated_at")
    .eq("rider_id", rider.id)
    .order("updated_at", { ascending: false })
    .limit(400);

  if (qErr) {
    return NextResponse.json({ ok: false, error: qErr.message }, { status: 500 });
  }

  let queue = 0;
  let active = 0;
  let deliveredToday = 0;

  for (const r of rows ?? []) {
    const st = String((r as { delivery_status?: string }).delivery_status ?? "");
    if (st === "rider_assigned") queue += 1;
    if (st === "pickup_in_progress" || st === "delivering") active += 1;
    if (st === "delivered") {
      const da = (r as { delivered_at?: string | null }).delivered_at;
      if (da && da >= dayStart) deliveredToday += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    rider,
    counts: {
      queue,
      active,
      delivered_today: deliveredToday,
    },
  });
}
