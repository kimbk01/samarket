import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import {
  evaluateStoreDeliveryServiceArea,
  loadDeliveryServiceabilityRuntimeContext,
} from "@/lib/delivery/load-delivery-serviceability-runtime";
import { loadStoreSelectedDeliveryLguIds } from "@/lib/delivery/service-area/store-delivery-service-areas";
import { resolveMemberCanonicalLguId } from "@/lib/delivery/service-area/resolve-member-canonical-lgu";
import { isDeliveryRoutableMasterAddress } from "@/lib/addresses/delivery-routable-address";
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
    .select(
      "id, slug, lat, lng, delivery_radius_km, delivery_available, approval_status, is_visible, delivery_service_area_authority"
    )
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
  let memberLguId: string | null = null;
  if (userId) {
    try {
      const defaults = await getUserAddressDefaults(sb, userId);
      const master = defaults.master;
      if (master && isDeliveryRoutableMasterAddress(master)) {
        addressId = master.id;
        const la = master.latitude;
        const ln = master.longitude;
        if (typeof la === "number" && Number.isFinite(la)) customerLat = la;
        if (typeof ln === "number" && Number.isFinite(ln)) customerLng = ln;
        memberLguId = resolveMemberCanonicalLguId({
          canonicalLguId: (master as { canonicalLguId?: string | null }).canonicalLguId,
          cityMunicipality: master.cityMunicipality,
          province: master.province,
        });
      } else if (master?.id) {
        addressId = master.id;
        memberLguId = resolveMemberCanonicalLguId({
          canonicalLguId: (master as { canonicalLguId?: string | null }).canonicalLguId,
          cityMunicipality: master.cityMunicipality,
          province: master.province,
        });
      }
    } catch {
      /* ignore — treat as missing customer coords */
    }
  }

  const authorityMode = (store as { delivery_service_area_authority?: unknown })
    .delivery_service_area_authority;
  const selectedLguIds =
    String(authorityMode ?? "").toLowerCase() === "v2_lgu"
      ? await loadStoreSelectedDeliveryLguIds(sb, String(store.id))
      : [];

  const ctx = await loadDeliveryServiceabilityRuntimeContext(sb);
  const svc = evaluateStoreDeliveryServiceArea({
    ctx,
    storeId: String(store.id),
    storeDeliveryRadiusKm: (store as { delivery_radius_km?: unknown }).delivery_radius_km,
    customerLat,
    customerLng,
    storeLat: store.lat,
    storeLng: store.lng,
    authorityMode,
    selectedLguIds,
    memberLguId,
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
    referenceDistanceKm: svc.referenceDistanceKm,
    reason: svc.reason,
    policySource: svc.policySource,
    authorityMode: svc.authorityMode,
    memberLguId: svc.memberLguId,
    matchedLguId: svc.matchedLguId,
  });
}
