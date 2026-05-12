import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  getApprovedStoreBySlug,
  STORE_SELECT_SUMMARY,
} from "@/lib/stores/get-approved-store-by-slug";
import { parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
import { buildStoreDeliveryEtaLabel } from "@/lib/stores/store-delivery-eta-label";
import { fetchTwoWheelerRouteMetricsStoresToUser } from "@/lib/geo/google-routes-two-wheeler-matrix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 선택 배달지(본인 주소) ↔ 매장 좌표 기준: 조리·**Google Routes 오토바이(TWO_WHEELER, 실패 시 DRIVE) 경로** 소요·거리.
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const buyerId = await getRouteUserId();
  if (!buyerId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug || "").trim();
  if (!decoded) {
    return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const deliveryUserAddressId = String(searchParams.get("delivery_user_address_id") ?? "").trim();
  if (!deliveryUserAddressId) {
    return NextResponse.json({ ok: false, error: "delivery_user_address_id_required" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const storeRes = await getApprovedStoreBySlug(sb, decoded, STORE_SELECT_SUMMARY);
  if (storeRes.ok === false) {
    if (storeRes.reason === "db_error") {
      return NextResponse.json({ ok: false, error: storeRes.message }, { status: 500 });
    }
    return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  }

  const store = storeRes.store as {
    id?: string;
    lat?: number | null;
    lng?: number | null;
    delivery_available?: boolean | null;
    business_hours_json?: unknown;
  };

  if (!store.delivery_available) {
    return NextResponse.json({ ok: false, error: "delivery_not_available" }, { status: 400 });
  }

  const { data: row, error } = await sb
    .from("user_addresses")
    .select("user_id, latitude, longitude")
    .eq("id", deliveryUserAddressId)
    .maybeSingle();

  if (error || !row || String((row as { user_id?: string }).user_id ?? "") !== buyerId) {
    return NextResponse.json({ ok: false, error: "address_not_found" }, { status: 404 });
  }

  const ulat = Number((row as { latitude?: unknown }).latitude);
  const ulng = Number((row as { longitude?: unknown }).longitude);
  const slat = store.lat != null ? Number(store.lat) : NaN;
  const slng = store.lng != null ? Number(store.lng) : NaN;
  const extras = parseCommerceExtrasFromHoursJson(store.business_hours_json);
  const coordsOk =
    Number.isFinite(ulat) && Number.isFinite(ulng) && Number.isFinite(slat) && Number.isFinite(slng);

  if (!coordsOk) {
    return NextResponse.json({
      ok: true,
      prepMinutes: extras.prepMinutes,
      rideMinutes: null,
      routeDistanceMeters: null,
      routeDistanceKm: null,
      etaLabel: buildStoreDeliveryEtaLabel(extras, null),
    });
  }

  const [leg] = await fetchTwoWheelerRouteMetricsStoresToUser([{ lat: slat, lng: slng }], {
    lat: ulat,
    lng: ulng,
  });
  const rideMinutes = leg?.rideMinutes ?? null;
  const routeDistanceMeters = leg?.routeDistanceMeters ?? null;
  const routeDistanceKm =
    routeDistanceMeters != null && Number.isFinite(routeDistanceMeters)
      ? routeDistanceMeters / 1000
      : null;
  const etaLabel = buildStoreDeliveryEtaLabel(extras, rideMinutes);

  return NextResponse.json({
    ok: true,
    prepMinutes: extras.prepMinutes,
    rideMinutes,
    routeDistanceMeters,
    routeDistanceKm,
    etaLabel,
  });
}
