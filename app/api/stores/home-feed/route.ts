import { NextResponse } from "next/server";
import { haversineKm } from "@/lib/geo/haversine-km";
import { devLogRoutesSkipped } from "@/lib/geo/google-routes-client";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import {
  resolveStoreDiscoveryEligibility,
  resolveStoreDiscoveryHomeDisplayStatus,
} from "@/lib/stores/store-discovery-eligibility";
import { sortStoreDiscoveryHomeFeedRows } from "@/lib/stores/store-discovery-browse-sort";
import { buildBrowseStoreCommerceSnapshot } from "@/lib/stores/browse-store-commerce-snapshot";
import { formatStoreBrowseDeliveryFeeLine, formatStoreBrowseDeliveryFeeStrikePhp, parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
import { buildBrowseStoreListEtaLabel } from "@/lib/stores/store-delivery-eta-label";
import { formatStoreLocationLine } from "@/lib/stores/store-location-label";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadDeliveryRideTimeSource } from "@/lib/delivery/delivery-ops-settings";
import {
  evaluateStoreDeliveryServiceability,
  loadDeliveryServiceabilityRuntimeContext,
} from "@/lib/delivery/load-delivery-serviceability-runtime";
import { resolvePublicPaymentMethodsLine } from "@/lib/stores/store-detail-meta";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  buildStoreHomeFeedCacheKey,
  getStoreHomeFeedCache,
  setStoreHomeFeedCache,
} from "@/lib/stores/store-home-feed-server-cache";
import {
  isSameDeliveryAddressForList,
  loadOwnerDefaultAddressByUserId,
  resolveStoreListDeliveryOrigin,
  resolveEffectiveStoreRouteAddress,
} from "@/lib/stores/store-list-delivery-origin";
import { detectAcceptLanguageAppLanguage } from "@/lib/i18n/language-preference";
import { resolveBrowseFeaturedMenuImageUrl } from "@/lib/stores/browse-featured-items-types";
import { loadStoreCompletedOrderCount30dMap } from "@/lib/stores/store-discovery-popular-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 사용자 좌표·ETA가 들어가므로 공유 캐시·CDN에 맡기지 않는다 */
const STORE_HOME_FEED_HTTP_CACHE_CONTROL = "private, no-store";

function parseSearchQ(raw: string | null): string | null {
  if (raw == null) return null;
  const t = raw
    .trim()
    .slice(0, 60)
    .replace(/[%_,]/g, "")
    .replace(/"/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length >= 2 ? t : null;
}

type RelOne = { slug: string; name: string };

function embedOne(v: RelOne | RelOne[] | null | undefined): RelOne | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type ProductMini = {
  id: string;
  store_id: string;
  title: string;
  price: number;
  thumbnail_url: string | null;
  is_featured: boolean | null;
  sort_order: number | null;
};

type FeedRow = {
  id: string;
  owner_user_id?: string | null;
  store_name: string;
  slug: string;
  region: string | null;
  city: string | null;
  district: string | null;
  place_id?: string | null;
  formatted_address?: string | null;
  detail_address?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  lat: number | null;
  lng: number | null;
  profile_image_url: string | null;
  description: string | null;
  is_open: boolean | null;
  point_commerce_blocked?: boolean | null;
  business_hours_json: unknown;
  created_at: string;
  rating_avg: number | null;
  review_count: number | null;
  delivery_available: boolean | null;
  pickup_available: boolean | null;
  visit_available: boolean | null;
  is_featured: boolean | null;
  store_categories?: RelOne | RelOne[] | null;
};

/**
 * 매장 탭 홈 피드 — 지역·거리 정렬 + 카드용 부가 필드
 */
export async function GET(req: Request) {
  const uiLang = detectAcceptLanguageAppLanguage(req.headers.get("accept-language"));
  const supabase = tryGetSupabaseForStores();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: true,
        stores: [] as StoreHomeFeedItem[],
        meta: { source: "supabase_unconfigured" as const },
      },
      { headers: { "Cache-Control": STORE_HOME_FEED_HTTP_CACHE_CONTROL } }
    );
  }

  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region")?.trim() || null;
  const district = searchParams.get("district")?.trim() || null;
  const searchQ = parseSearchQ(searchParams.get("q"));
  const [origin, deliveryRideTimeSource, serviceabilityCtx] = await Promise.all([
    resolveStoreListDeliveryOrigin(supabase, searchParams),
    loadDeliveryRideTimeSource(supabase),
    loadDeliveryServiceabilityRuntimeContext(supabase),
  ]);
  const userLat = origin.lat;
  const userLng = origin.lng;
  const cacheKey = buildStoreHomeFeedCacheKey({
    region,
    district,
    searchQ,
    userLat,
    userLng,
    originKey: origin.cacheKeyPart,
    deliveryRideTimeSource,
    distancePolicyKey: serviceabilityCtx.policy.enabled
      ? `on:${serviceabilityCtx.policy.defaultMaxKm ?? "none"}`
      : "off",
  });

  const cached = getStoreHomeFeedCache(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": STORE_HOME_FEED_HTTP_CACHE_CONTROL },
    });
  }

  try {
    let q = supabase
      .from("stores")
      .select(
        `
        id,
        owner_user_id,
        store_name,
        slug,
        region,
        city,
        district,
        place_id,
        formatted_address,
        detail_address,
        address_line1,
        address_line2,
        lat,
        lng,
        profile_image_url,
        description,
        is_open,
        point_commerce_blocked,
        business_hours_json,
        created_at,
        rating_avg,
        review_count,
        delivery_available,
        pickup_available,
        visit_available,
        is_featured,
        store_categories ( slug, name )
      `
      )
      .eq("approval_status", "approved")
      .eq("is_visible", true)
      .order("created_at", { ascending: false })
      .limit(120);

    // region/district는 정렬(districtRank·거리)에만 사용. 프로필 동네 표기와 DB region/district 문자열이
    // 조금만 달라도 ilike WHERE에 걸려 0건이 되는 문제를 피함 (browse API와 동일한 정책).
    if (searchQ) {
      const pat = `%${searchQ}%`;
      q = q.or(`store_name.ilike."${pat}",slug.ilike."${pat}"`);
    }

    const { data, error } = await q;

    if (error) {
      console.error("[api/stores/home-feed]", error);
      return NextResponse.json(
        { ok: false, stores: [], error: error.message },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    let rows: FeedRow[] = (data ?? []).map((r) => {
      const o = r as FeedRow & { store_categories?: RelOne | RelOne[] };
      return {
        ...o,
        store_categories: embedOne(o.store_categories),
      };
    });
    const ownerDefaults = await loadOwnerDefaultAddressByUserId(
      supabase,
      rows.map((r) => String(r.owner_user_id ?? "")),
    );
    const effectiveById = new Map(
      rows.map((r) => [
        r.id,
        resolveEffectiveStoreRouteAddress(r, ownerDefaults.get(String(r.owner_user_id ?? "").trim())),
      ]),
    );

    const eligibilityRankById = new Map<string, number>();
    const outOfRangeById = new Map<string, boolean>();
    const distById = new Map<string, number | null>();
    for (const r of rows) {
      const effective = effectiveById.get(r.id) ?? r;
      let outOfRange = false;
      let distanceKm: number | null = null;
      if (userLat != null && userLng != null) {
        const svc = evaluateStoreDeliveryServiceability({
          ctx: serviceabilityCtx,
          storeId: r.id,
          customerLat: userLat,
          customerLng: userLng,
          storeLat: effective.lat,
          storeLng: effective.lng,
        });
        outOfRange =
          svc.applies && (svc.reason === "out_of_range" || svc.reason === "missing_store_coords");
        distanceKm = svc.distanceKm ?? haversineKm(userLat, userLng, effective.lat, effective.lng);
      }
      outOfRangeById.set(r.id, outOfRange);
      distById.set(r.id, distanceKm);
      eligibilityRankById.set(
        r.id,
        resolveStoreDiscoveryEligibility({
          business_hours_json: r.business_hours_json,
          is_open: r.is_open,
          point_commerce_blocked: r.point_commerce_blocked,
          delivery_available: r.delivery_available,
          distanceOutOfRange: outOfRange,
        }).rank
      );
    }

    const allRowIds = rows.map((r) => r.id);
    const completedOrderCount30dById = await loadStoreCompletedOrderCount30dMap(supabase, allRowIds);

    rows = sortStoreDiscoveryHomeFeedRows(rows, {
      district,
      eligibilityRankById,
      distanceKmById: userLat != null && userLng != null ? distById : null,
      outOfRangeById: userLat != null && userLng != null ? outOfRangeById : null,
      hasGeo: userLat != null && userLng != null,
    });

    rows = rows.slice(0, 48);

    if (process.env.NODE_ENV === "development" && userLat != null && userLng != null && rows.length > 0) {
      devLogRoutesSkipped("list_screen_disabled", "api/stores/home-feed");
    }

    const ids = rows.map((r) => r.id);
    const featuredByStore = new Map<
      string,
      { productId: string; name: string; price: number; imageUrl: string | null }[]
    >();

    if (ids.length > 0) {
      const { data: prods, error: pErr } = await supabase
        .from("store_products")
        .select("id, store_id, title, price, thumbnail_url, is_featured, sort_order")
        .in("store_id", ids)
        .eq("product_status", "active");

      if (pErr) {
        console.error("[api/stores/home-feed] products", pErr);
      } else {
        const list = (prods ?? []) as ProductMini[];
        const grouped = new Map<string, ProductMini[]>();
        for (const p of list) {
          const arr = grouped.get(p.store_id) ?? [];
          arr.push(p);
          grouped.set(p.store_id, arr);
        }
        for (const [storeId, arr] of grouped) {
          const sorted = [...arr].sort((a, b) => {
            const f = Number(!!b.is_featured) - Number(!!a.is_featured);
            if (f !== 0) return f;
            return (a.sort_order ?? 0) - (b.sort_order ?? 0);
          });
          featuredByStore.set(
            storeId,
            sorted.slice(0, 3).map((x) => ({
              productId: String(x.id),
              name: x.title,
              price: Number(x.price),
              imageUrl: resolveBrowseFeaturedMenuImageUrl(x.thumbnail_url),
            }))
          );
        }
      }
    }

    const stores: StoreHomeFeedItem[] = rows.map((r) => {
      const cat = embedOne(r.store_categories as RelOne | RelOne[] | null | undefined);
      const rowOutOfRange = outOfRangeById.get(r.id) === true;
      const extras = parseCommerceExtrasFromHoursJson(r.business_hours_json);
      const commerce = buildBrowseStoreCommerceSnapshot(r.business_hours_json);
      const deliveryFeeLabel = formatStoreBrowseDeliveryFeeLine(
        extras,
        {
          deliveryAvailable: !!r.delivery_available,
        },
        uiLang
      );
      const deliveryFeeStrikePhp = formatStoreBrowseDeliveryFeeStrikePhp(extras, {
        deliveryAvailable: !!r.delivery_available,
      });
      const paymentMethodsLine = resolvePublicPaymentMethodsLine(r.business_hours_json);

      const minPhp = extras.minOrderPhp;
      const minOrderLabel =
        minPhp != null && Number.isFinite(minPhp) && minPhp > 0 ? `최소주문 ${formatMoneyPhp(minPhp)}` : null;

      let distanceKm: number | null = distById.get(r.id) ?? null;
      let distancePolicyApplied = false;
      let maxDeliveryDistanceKm: number | null = null;
      if (userLat != null && userLng != null) {
        const effective = effectiveById.get(r.id) ?? r;
        const svc = evaluateStoreDeliveryServiceability({
          ctx: serviceabilityCtx,
          storeId: r.id,
          customerLat: userLat,
          customerLng: userLng,
          storeLat: effective.lat,
          storeLng: effective.lng,
        });
        distanceKm = svc.distanceKm ?? haversineKm(userLat, userLng, effective.lat, effective.lng);
        distancePolicyApplied = svc.applies;
        maxDeliveryDistanceKm = svc.applies ? svc.maxKm : null;
      }

      const regionLabel = formatStoreLocationLine(r) ?? "위치 미등록";

      const effective = effectiveById.get(r.id) ?? r;
      const isSameAddress = isSameDeliveryAddressForList(origin, effective);
      const displayDistanceKm = isSameAddress ? 0 : distanceKm;
      const rideRaw = isSameAddress ? 0 : null;
      const rideMinutes = r.delivery_available ? rideRaw : null;
      const routeCtx = userLat != null && userLng != null;
      const manualForEta =
        deliveryRideTimeSource === "store" ? extras.deliveryRideDisplayManual : null;
      const etaLabel = buildBrowseStoreListEtaLabel(
        extras,
        rideMinutes,
        {
          deliveryAvailable: !!r.delivery_available,
          routeContextPresent: routeCtx,
          manualRideDisplay: manualForEta,
        },
        uiLang
      );

      return {
        id: r.id,
        slug: r.slug,
        nameKo: r.store_name,
        tagline: r.description,
        primarySlug: cat?.slug ?? null,
        primaryNameKo: cat?.name ?? null,
        regionLabel,
        status: resolveStoreDiscoveryHomeDisplayStatus({
          business_hours_json: r.business_hours_json,
          is_open: r.is_open,
          point_commerce_blocked: r.point_commerce_blocked,
          delivery_available: r.delivery_available,
          distanceOutOfRange: rowOutOfRange,
        }),
        rating: r.rating_avg != null ? Number(r.rating_avg) : 0,
        reviewCount: r.review_count ?? 0,
        deliveryAvailable: !!r.delivery_available,
        pickupAvailable: r.pickup_available !== false,
        minOrderLabel,
        estPrepLabel: extras.estPrepLabel,
        prepMinutes: extras.prepMinutes,
        rideMinutes,
        etaLabel,
        deliveryFeeLabel,
        deliveryFeeStrikePhp,
        paymentMethodsLine,
        commerce,
        distanceKm: displayDistanceKm,
        straightDistanceKm: distanceKm,
        distancePolicyApplied,
        distanceOutOfRange: rowOutOfRange,
        maxDeliveryDistanceKm,
        featuredItems: featuredByStore.get(r.id) ?? [],
        profileImageUrl: r.profile_image_url,
        isFeatured: !!r.is_featured,
        completedOrderCount30d: completedOrderCount30dById.get(r.id) ?? 0,
        discoveryEligibilityRank: eligibilityRankById.get(r.id) ?? 99,
      };
    });

    const payload = {
      ok: true as const,
      stores,
      meta: {
        source: "supabase" as const,
        sorted_by:
          userLat != null && userLng != null
            ? "eligibility_district_distance_rating"
            : "eligibility_district_distance_rating",
        origin_source: origin.source,
        origin_address_id: origin.addressId,
      },
    };
    setStoreHomeFeedCache(cacheKey, payload);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": STORE_HOME_FEED_HTTP_CACHE_CONTROL },
    });
  } catch (e) {
    console.error("[api/stores/home-feed]", e);
    return NextResponse.json(
      { ok: false, stores: [], error: e instanceof Error ? e.message : "unknown" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
