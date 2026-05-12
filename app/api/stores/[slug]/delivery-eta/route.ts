import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  getApprovedStoreBySlug,
  STORE_DELIVERY_ETA_SELECT,
} from "@/lib/stores/get-approved-store-by-slug";
import { parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
import { buildStoreDeliveryEtaLabel } from "@/lib/stores/store-delivery-eta-label";
import { fetchTwoWheelerRouteMetricsStoresToUser } from "@/lib/geo/google-routes-two-wheeler-matrix";
import {
  parseFiniteLatitude,
  parseFiniteLongitude,
} from "@/lib/geo/parse-finite-geographic-coord";
import { devConsoleWarn } from "@/lib/dev/dev-console-warn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INCLUDE_COORD_DEBUG_JSON = process.env.NODE_ENV === "development";

function coordDebugFlags(args: {
  storeLat: unknown;
  storeLng: unknown;
  userLat: unknown;
  userLng: unknown;
}): { missingStoreCoords: boolean; missingUserCoords: boolean } {
  const sOk =
    parseFiniteLatitude(args.storeLat) != null && parseFiniteLongitude(args.storeLng) != null;
  const uOk =
    parseFiniteLatitude(args.userLat) != null && parseFiniteLongitude(args.userLng) != null;
  return { missingStoreCoords: !sOk, missingUserCoords: !uOk };
}

function maybeCoordDebug(
  flags: { missingStoreCoords: boolean; missingUserCoords: boolean }
): { debug: typeof flags } | Record<string, never> {
  if (!INCLUDE_COORD_DEBUG_JSON) return {};
  return { debug: flags };
}

/**
 * 선택 배달지(본인 주소) ↔ 매장 좌표 기준: 조리·**Google Routes 오토바이(TWO_WHEELER, 실패 시 DRIVE) 경로** 소요·거리.
 *
 * 좌표 출처:
 * - 매장: `stores` 행 — **`lat`**, **`lng`** (`getApprovedStoreBySlug` + `STORE_DELIVERY_ETA_SELECT`).
 * - 배달지: `user_addresses` 행 — **`latitude`**, **`longitude`**
 *   (`id` = 쿼리 파라미터 `delivery_user_address_id`, 본인 소유 행만).
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

  const storeRes = await getApprovedStoreBySlug(sb, decoded, STORE_DELIVERY_ETA_SELECT);
  if (storeRes.ok === false) {
    if (storeRes.reason === "db_error") {
      return NextResponse.json({ ok: false, error: storeRes.message }, { status: 500 });
    }
    return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  }

  const store = storeRes.store as {
    id?: string;
    lat?: unknown;
    lng?: unknown;
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

  const addrRow = row as { latitude?: unknown; longitude?: unknown };
  const rawUlat = addrRow.latitude;
  const rawUlng = addrRow.longitude;
  const rawSlat = store.lat;
  const rawSlng = store.lng;

  const debugFlags = coordDebugFlags({
    storeLat: rawSlat,
    storeLng: rawSlng,
    userLat: rawUlat,
    userLng: rawUlng,
  });

  if (debugFlags.missingStoreCoords) {
    devConsoleWarn(
      "[delivery-eta] missing store coordinates — set `stores.lat` / `stores.lng` (WGS84)",
      { slug: decoded, storeId: store.id ?? null }
    );
  }
  if (debugFlags.missingUserCoords) {
    devConsoleWarn(
      "[delivery-eta] missing user address coordinates — set `user_addresses.latitude` / `longitude`",
      { delivery_user_address_id: deliveryUserAddressId }
    );
  }

  const ulat = parseFiniteLatitude(rawUlat);
  const ulng = parseFiniteLongitude(rawUlng);
  const slat = parseFiniteLatitude(rawSlat);
  const slng = parseFiniteLongitude(rawSlng);
  const extras = parseCommerceExtrasFromHoursJson(store.business_hours_json);
  const coordsOk = ulat != null && ulng != null && slat != null && slng != null;

  if (!coordsOk) {
    devConsoleWarn(
      "[delivery-eta] skipping Google Routes (incomplete coordinates) → ok:true, rideMinutes:null, routeDistanceKm:null",
      { slug: decoded, storeId: store.id ?? null, ...debugFlags }
    );
    return NextResponse.json({
      ok: true,
      prepMinutes: extras.prepMinutes,
      rideMinutes: null,
      routeDistanceMeters: null,
      routeDistanceKm: null,
      etaLabel: buildStoreDeliveryEtaLabel(extras, null),
      ...maybeCoordDebug(debugFlags),
    });
  }

  const origin = { lat: slat, lng: slng };
  const dest = { lat: ulat, lng: ulng };

  const [leg] = await fetchTwoWheelerRouteMetricsStoresToUser([origin], dest);
  const rideMinutes = leg?.rideMinutes ?? null;
  const routeDistanceMeters = leg?.routeDistanceMeters ?? null;
  const routeDistanceKm =
    routeDistanceMeters != null && Number.isFinite(routeDistanceMeters)
      ? routeDistanceMeters / 1000
      : null;
  const etaLabel = buildStoreDeliveryEtaLabel(extras, rideMinutes);

  if (rideMinutes == null && routeDistanceMeters == null) {
    devConsoleWarn(
      "[delivery-eta] Routes matrix returned null leg (coordinates were valid). Check GOOGLE_MAPS_ROUTES_API_KEY, Routes API billing, and server key restrictions.",
      { slug: decoded, storeId: store.id ?? null }
    );
  }

  return NextResponse.json({
    ok: true,
    prepMinutes: extras.prepMinutes,
    rideMinutes,
    routeDistanceMeters,
    routeDistanceKm,
    etaLabel,
  });
}
