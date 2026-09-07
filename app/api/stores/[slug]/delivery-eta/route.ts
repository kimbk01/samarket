import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  getApprovedStoreBySlug,
  STORE_DELIVERY_ETA_SELECT,
} from "@/lib/stores/get-approved-store-by-slug";
import { parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
import {
  buildStoreDeliveryEtaLabel,
  buildStoreDeliveryEtaLabelWithManualRide,
} from "@/lib/stores/store-delivery-eta-label";
import { loadDeliveryRideTimeSource } from "@/lib/delivery/delivery-ops-settings";
import {
  parseFiniteLatitude,
  parseFiniteLongitude,
} from "@/lib/geo/parse-finite-geographic-coord";
import { devConsoleWarn } from "@/lib/dev/dev-console-warn";
import { fetchDeliveryRouteSingleLeg } from "@/lib/geo/google-routes-single-leg";
import {
  getGoogleRoutesComputeLegRequestSegment,
  isGoogleRoutesApiGloballyDisabled,
} from "@/lib/geo/google-routes-client";
import { haversineKm } from "@/lib/geo/haversine-km";
import { detectAcceptLanguageAppLanguage } from "@/lib/i18n/language-preference";
import {
  isSameDeliveryAddressForList,
  loadOwnerDefaultAddressByUserId,
  normalizeDeliveryAddressIdentity,
  resolveEffectiveStoreRouteAddress,
  type StoreListDeliveryOrigin,
} from "@/lib/stores/store-list-delivery-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 동일 매장·저장 주소·좌표에 대한 메모리 캐시 (Routes 왕복 감소) */
const DELIVERY_ETA_SERVER_CACHE_TTL_MS = 15 * 60 * 1000;
const deliveryEtaOkCache = new Map<string, { expiresAt: number; body: Record<string, unknown> }>();
const deliveryEtaOkInflight = new Map<string, Promise<Record<string, unknown>>>();

function roundCoordKey(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

type EtaOkBody = {
  ok: true;
  prepMinutes: number | null;
  straightDistanceKm: number | null;
  straightDistanceMeters: number | null;
  rideMinutes: number | null;
  routeDistanceMeters: number | null;
  routeDistanceKm: number | null;
  travelModeUsed: string | null;
  fallbackUsed: boolean;
  etaLabel: string;
  disabled?: boolean;
  /** 좌표 누락·비활성 등 — Google 호출 없음일 때 구분 */
  reason?: string | null;
};

/** 스키마 정렬: camelCase + 하위 호환 snake_case alias */
function deliveryEtaOkJson(body: EtaOkBody & Record<string, unknown>): Record<string, unknown> {
  return {
    ...body,
    travel_mode_used: body.travelModeUsed,
    fallback_used: body.fallbackUsed,
  };
}

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
 *   (`id` = 쿼리 파라미터 `delivery_user_address_id`, 본인 소유 **active master** 행만 — CUT 6).
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const buyerId = await getRouteUserId();
  if (!buyerId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const uiLang = detectAcceptLanguageAppLanguage(req.headers.get("accept-language"));

  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug || "").trim();
  if (!decoded) {
    return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const deliveryUserAddressId = String(searchParams.get("delivery_user_address_id") ?? "").trim();
  const explicitLat = parseFiniteLatitude(searchParams.get("lat"));
  const explicitLng = parseFiniteLongitude(searchParams.get("lng"));
  if (!deliveryUserAddressId && (explicitLat == null || explicitLng == null)) {
    return NextResponse.json({ ok: false, error: "delivery_user_address_id_or_lat_lng_required" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const [storeRes, rideTimeSource] = await Promise.all([
    getApprovedStoreBySlug(sb, decoded, STORE_DELIVERY_ETA_SELECT),
    loadDeliveryRideTimeSource(sb),
  ]);
  if (storeRes.ok === false) {
    if (storeRes.reason === "db_error") {
      return NextResponse.json({ ok: false, error: storeRes.message }, { status: 500 });
    }
    return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  }

  const store = storeRes.store as {
    id?: string;
    owner_user_id?: unknown;
    place_id?: unknown;
    formatted_address?: unknown;
    detail_address?: unknown;
    address_line1?: unknown;
    address_line2?: unknown;
    lat?: unknown;
    lng?: unknown;
    delivery_available?: boolean | null;
    business_hours_json?: unknown;
  };
  const ownerDefaults = await loadOwnerDefaultAddressByUserId(sb, [String(store.owner_user_id ?? "")]);
  const effectiveStore = resolveEffectiveStoreRouteAddress(
    store,
    ownerDefaults.get(String(store.owner_user_id ?? "").trim()),
  );

  if (!store.delivery_available) {
    return NextResponse.json({ ok: false, error: "delivery_not_available" }, { status: 400 });
  }

  let rawUlat: unknown = explicitLat;
  let rawUlng: unknown = explicitLng;
  if (deliveryUserAddressId) {
    const { data: row, error } = await sb
      .from("user_addresses")
      .select(
        "id, user_id, is_active, is_default_master, place_id, formatted_address, road_address, full_address, detail_address, unit_floor_room, latitude, longitude"
      )
      .eq("id", deliveryUserAddressId)
      .maybeSingle();

    if (error || !row || String((row as { user_id?: string }).user_id ?? "") !== buyerId) {
      return NextResponse.json({ ok: false, error: "address_not_found" }, { status: 404 });
    }
    const meta = row as {
      is_active?: boolean | null;
      is_default_master?: boolean | null;
    };
    /** CUT 6 OPTION A — checkout destination = master only (parity with order create). */
    if (meta.is_active === false || meta.is_default_master !== true) {
      return NextResponse.json({ ok: false, error: "delivery_user_address_not_master" }, { status: 400 });
    }
    const addrRow = row as {
      id?: unknown;
      place_id?: unknown;
      formatted_address?: unknown;
      road_address?: unknown;
      full_address?: unknown;
      detail_address?: unknown;
      unit_floor_room?: unknown;
      latitude?: unknown;
      longitude?: unknown;
    };
    rawUlat = addrRow.latitude;
    rawUlng = addrRow.longitude;
    const sameOrigin: StoreListDeliveryOrigin = {
      source: "saved_address",
      userId: buyerId,
      addressId: String(addrRow.id ?? "").trim() || deliveryUserAddressId,
      placeId: String(addrRow.place_id ?? "").trim() || null,
      lat: parseFiniteLatitude(rawUlat),
      lng: parseFiniteLongitude(rawUlng),
      addressIdentity: normalizeDeliveryAddressIdentity(
        addrRow.formatted_address,
        addrRow.road_address,
        addrRow.full_address,
        addrRow.detail_address,
        addrRow.unit_floor_room,
      ),
      cacheKeyPart: "",
    };
    if (isSameDeliveryAddressForList(sameOrigin, effectiveStore)) {
      const extras = parseCommerceExtrasFromHoursJson(store.business_hours_json);
      if (rideTimeSource === "store") {
        return NextResponse.json(
          deliveryEtaOkJson({
            ok: true,
            prepMinutes: extras.prepMinutes,
            straightDistanceKm: 0,
            straightDistanceMeters: 0,
            rideMinutes: null,
            routeDistanceMeters: null,
            routeDistanceKm: null,
            travelModeUsed: null,
            fallbackUsed: true,
            etaLabel: buildStoreDeliveryEtaLabelWithManualRide(
              extras,
              extras.deliveryRideDisplayManual,
              uiLang
            ),
            reason: "same_address",
          }),
        );
      }
      return NextResponse.json(
        deliveryEtaOkJson({
          ok: true,
          prepMinutes: extras.prepMinutes,
          straightDistanceKm: 0,
          straightDistanceMeters: 0,
          rideMinutes: 0,
          routeDistanceMeters: 0,
          routeDistanceKm: 0,
          travelModeUsed: null,
          fallbackUsed: false,
          etaLabel: buildStoreDeliveryEtaLabel(extras, 0, uiLang),
          reason: "same_address",
        }),
      );
    }
  }

  const rawSlat = effectiveStore.lat;
  const rawSlng = effectiveStore.lng;

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
  const straightDistanceKm = coordsOk ? haversineKm(slat!, slng!, ulat, ulng) : null;
  const straightDistanceMeters =
    straightDistanceKm != null && Number.isFinite(straightDistanceKm)
      ? Math.round(straightDistanceKm * 1000)
      : null;

  if (!coordsOk) {
    devConsoleWarn(
      "[delivery-eta] skipping Google Routes (incomplete coordinates) → ok:true, rideMinutes:null, routeDistanceKm:null",
      { slug: decoded, storeId: store.id ?? null, ...debugFlags }
    );
    return NextResponse.json(
      deliveryEtaOkJson({
        ok: true,
        prepMinutes: extras.prepMinutes,
        straightDistanceKm,
        straightDistanceMeters,
        rideMinutes: null,
        routeDistanceMeters: null,
        routeDistanceKm: null,
        travelModeUsed: null,
        fallbackUsed: true,
        etaLabel: buildStoreDeliveryEtaLabel(extras, null, uiLang),
        reason: "missing_coords",
        ...maybeCoordDebug(debugFlags),
      }),
    );
  }

  if (rideTimeSource === "store") {
    return NextResponse.json(
      deliveryEtaOkJson({
        ok: true,
        prepMinutes: extras.prepMinutes,
        straightDistanceKm,
        straightDistanceMeters,
        rideMinutes: null,
        routeDistanceMeters: null,
        routeDistanceKm: null,
        travelModeUsed: null,
        fallbackUsed: true,
        etaLabel: buildStoreDeliveryEtaLabelWithManualRide(
          extras,
          extras.deliveryRideDisplayManual,
          uiLang
        ),
        reason: "ride_time_source_store",
        ...maybeCoordDebug(debugFlags),
      }),
    );
  }

  const origin = { lat: slat, lng: slng };
  const dest = { lat: ulat, lng: ulng };

  if (straightDistanceMeters != null && straightDistanceMeters <= 30) {
    return NextResponse.json(
      deliveryEtaOkJson({
        ok: true,
        prepMinutes: extras.prepMinutes,
        straightDistanceKm: 0,
        straightDistanceMeters: 0,
        rideMinutes: 0,
        routeDistanceMeters: 0,
        routeDistanceKm: 0,
        travelModeUsed: null,
        fallbackUsed: false,
        etaLabel: buildStoreDeliveryEtaLabel(extras, 0, uiLang),
        reason: "near_origin",
      }),
    );
  }

  const routesSeg = getGoogleRoutesComputeLegRequestSegment();
  const cacheKey =
    store.id
      ? deliveryUserAddressId.trim().length > 0
        ? `eta:${buyerId}:${String(store.id)}:addr:${deliveryUserAddressId}:${roundCoordKey(slat!)}:${roundCoordKey(slng!)}:${roundCoordKey(ulat)}:${roundCoordKey(ulng)}:${routesSeg}`
        : `eta:${buyerId}:${String(store.id)}:ll:${roundCoordKey(slat!)}:${roundCoordKey(slng!)}:${roundCoordKey(ulat)}:${roundCoordKey(ulng)}:${routesSeg}`
      : null;
  if (cacheKey) {
    const hit = deliveryEtaOkCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      return NextResponse.json(hit.body);
    }
    const infl = deliveryEtaOkInflight.get(cacheKey);
    if (infl) {
      const body = await infl;
      return NextResponse.json(body);
    }
  }

  const computePayload = async (): Promise<Record<string, unknown>> => {
    const leg = await fetchDeliveryRouteSingleLeg(origin, dest, {
      source: "delivery-eta",
      reason: deliveryUserAddressId.trim().length > 0 ? "saved_address" : "explicit_lat_lng",
      pathname: "/api/stores/[slug]/delivery-eta",
      component: "delivery-eta-route",
      triggeredBy: deliveryUserAddressId.trim().length > 0 ? "saved_address_eta_request" : "explicit_lat_lng_eta_request",
    });
    const rideMinutes = leg.rideMinutes ?? null;
    const routeDistanceMeters = leg.routeDistanceMeters ?? null;
    const routeDistanceKm =
      routeDistanceMeters != null && Number.isFinite(routeDistanceMeters)
        ? routeDistanceMeters / 1000
        : null;
    const etaLabel = buildStoreDeliveryEtaLabel(extras, rideMinutes, uiLang);

    if (rideMinutes == null && routeDistanceMeters == null) {
      devConsoleWarn(
        "[delivery-eta] Routes computeRoutes returned empty leg (coordinates were valid). Check GOOGLE_MAPS_SERVER_API_KEY / GOOGLE_MAPS_ROUTES_API_KEY, Routes API billing, and server key restrictions.",
        { slug: decoded, storeId: store.id ?? null, routesDisabled: isGoogleRoutesApiGloballyDisabled() }
      );
    }

    let reason: string | null = null;
    if (leg.skipReason === "disabled_by_env") reason = "google_routes_disabled";
    else if (leg.skipReason === "missing_api_key") reason = "missing_routes_api_key";
    else if (leg.skipReason === "invalid_coords") reason = "invalid_coords";
    else if (leg.skipReason === "near_origin") reason = "near_origin";
    else if (rideMinutes == null && routeDistanceMeters == null) reason = "routes_empty";

    return deliveryEtaOkJson({
      ok: true,
      prepMinutes: extras.prepMinutes,
      straightDistanceKm,
      straightDistanceMeters,
      rideMinutes,
      routeDistanceMeters,
      routeDistanceKm,
      travelModeUsed: leg.travelModeUsed,
      fallbackUsed: leg.fallbackUsed,
      etaLabel,
      disabled: leg.skipReason === "disabled_by_env" ? true : undefined,
      reason,
    });
  };

  let payload: Record<string, unknown>;
  if (cacheKey) {
    const p = computePayload();
    deliveryEtaOkInflight.set(cacheKey, p);
    try {
      payload = await p;
    } finally {
      deliveryEtaOkInflight.delete(cacheKey);
    }
    deliveryEtaOkCache.set(cacheKey, { expiresAt: Date.now() + DELIVERY_ETA_SERVER_CACHE_TTL_MS, body: payload });
  } else {
    payload = await computePayload();
  }
  return NextResponse.json(payload);
}
