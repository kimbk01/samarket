import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { invalidateDiscoveryAfterStoreWrite } from "@/lib/stores/discovery/invalidate-discovery-after-store-write";
import { clearStoreHomeFeedServerCache } from "@/lib/stores/store-home-feed-server-cache";
import { resolveStoreHomeLguId } from "@/lib/delivery/service-area/candidate-discovery";
import { buildDeliveryServiceAreaEditorPayload } from "@/lib/delivery/service-area/build-service-area-editor-payload";
import {
  loadStoreDeliveryServiceAreas,
  replaceStoreDeliveryServiceAreas,
} from "@/lib/delivery/service-area/store-delivery-service-areas";
import { searchPlatformPhLgu } from "@/lib/geo/ph-lgu/platform-ph-lgu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadStoreGeo(sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>, storeId: string) {
  const { data, error } = await sb
    .from("stores")
    .select("id, city, region, lat, lng, delivery_radius_km, delivery_service_area_authority")
    .eq("id", storeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * GET — Owner regional service-area editor payload (candidates + selected + authority).
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { storeId: rawId } = await context.params;
  const storeId = decodeURIComponent(rawId || "").trim();
  if (!storeId) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const owned = await getStoreIfOwner(sb, userId, storeId);
  if (!owned) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  try {
    const store = await loadStoreGeo(sb, storeId);
    if (!store) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const selected = await loadStoreDeliveryServiceAreas(sb, storeId);
    return NextResponse.json({ ok: true, ...buildDeliveryServiceAreaEditorPayload(store, selected) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "load_failed" },
      { status: 500 }
    );
  }
}

/**
 * PUT — replace selected LGUs; optionally activate V2 authority (confirm cutover).
 * Body: { geoIdentities: string[], activateV2?: boolean }
 */
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { storeId: rawId } = await context.params;
  const storeId = decodeURIComponent(rawId || "").trim();
  if (!storeId) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const owned = await getStoreIfOwner(sb, userId, storeId);
  if (!owned) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  let body: { geoIdentities?: unknown; activateV2?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const idsRaw = Array.isArray(body.geoIdentities) ? body.geoIdentities : null;
  if (!idsRaw) {
    return NextResponse.json({ ok: false, error: "geo_identities_required" }, { status: 400 });
  }

  try {
    const store = await loadStoreGeo(sb, storeId);
    if (!store) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const storeHomeLguId = resolveStoreHomeLguId({
      cityMunicipality: store.city,
      province: store.region,
      storeLat: store.lat != null ? Number(store.lat) : null,
      storeLng: store.lng != null ? Number(store.lng) : null,
    });
    const activateV2 = body.activateV2 === true;
    const result = await replaceStoreDeliveryServiceAreas(sb, {
      storeId,
      source: "owner",
      activateV2,
      storeHomeLguId,
      areas: idsRaw.map((id) => ({ geoIdentity: String(id ?? "") })),
    });

    invalidateDiscoveryAfterStoreWrite(sb, storeId, {
      delivery_service_area_authority: result.authority,
    });
    clearStoreHomeFeedServerCache();

    const selected = await loadStoreDeliveryServiceAreas(sb, storeId);
    return NextResponse.json({
      ok: true,
      authority: result.authority,
      ...buildDeliveryServiceAreaEditorPayload(
        {
          ...store,
          delivery_service_area_authority: result.authority,
        },
        selected
      ),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "save_failed" },
      { status: 500 }
    );
  }
}

/**
 * POST — search national LGU catalog for 「다른 지역 추가」.
 * Body: { q: string }
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { storeId: rawId } = await context.params;
  const storeId = decodeURIComponent(rawId || "").trim();
  if (!storeId) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const owned = await getStoreIfOwner(sb, userId, storeId);
  if (!owned) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  let body: { q?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const q = String(body.q ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ ok: true, results: [] });
  }
  const results = searchPlatformPhLgu(q).slice(0, 20).map((r) => ({
    geoIdentity: r.canonicalId,
    displayName: r.displayName,
    provinceName: r.provinceName,
    regionName: r.regionName,
  }));
  return NextResponse.json({ ok: true, results });
}
