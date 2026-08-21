import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import {
  evaluateStoreDeliveryServiceability,
  loadDeliveryServiceabilityRuntimeContext,
} from "@/lib/delivery/load-delivery-serviceability-runtime";
import { getUserAddressDefaults } from "@/lib/addresses/user-address-service";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Store detail / cart — same SSOT as browse + order gate.
 * GET /api/stores/[slug]/delivery-serviceability
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug || "").trim();
  if (!decoded) {
    return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: store, error } = await sb
    .from("stores")
    .select("id, slug, lat, lng, delivery_available, approval_status, is_visible")
    .eq("slug", decoded)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!store?.id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const userId = await getRouteUserId();
  let customerLat: number | null = null;
  let customerLng: number | null = null;
  let addressId: string | null = null;
  if (userId) {
    try {
      const defaults = await getUserAddressDefaults(sb, userId);
      const master = defaults.master;
      if (master) {
        addressId = master.id;
        const la = master.latitude;
        const ln = master.longitude;
        if (typeof la === "number" && Number.isFinite(la)) customerLat = la;
        if (typeof ln === "number" && Number.isFinite(ln)) customerLng = ln;
      }
    } catch {
      /* ignore — treat as missing customer coords */
    }
  }

  const ctx = await loadDeliveryServiceabilityRuntimeContext(sb);
  const svc = evaluateStoreDeliveryServiceability({
    ctx,
    storeId: String(store.id),
    customerLat,
    customerLng,
    storeLat: store.lat,
    storeLng: store.lng,
  });

  return NextResponse.json({
    ok: true,
    storeId: store.id,
    slug: store.slug,
    deliveryAvailable: store.delivery_available === true,
    addressId,
    customerLat,
    customerLng,
    storeLat: store.lat,
    storeLng: store.lng,
    policyEnabled: ctx.policy.enabled,
    eligible: svc.eligible,
    applies: svc.applies,
    distanceKm: svc.distanceKm,
    maxKm: svc.maxKm,
    reason: svc.reason,
    policySource: svc.policySource,
  });
}
