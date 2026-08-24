import { NextResponse } from "next/server";
import { haversineKm } from "@/lib/geo/haversine-km";
import { devLogRoutesSkipped } from "@/lib/geo/google-routes-client";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import {
  loadHomeDiscoveryCandidateRows,
  STORE_HOME_FEED_RESPONSE_MAX,
} from "@/lib/stores/store-discovery-candidate";
import { loadHomeDiscoveryRankedForLive } from "@/lib/stores/discovery/load-store-discovery-ranked-live";
import {
  isStoreDiscoveryRankingAuthorityNew,
  logStoreDiscoveryAuthorityRuntime,
  resolveStoreDiscoveryRankingAuthority,
} from "@/lib/stores/discovery/store-discovery-ranking-authority";
import {
  applyStoreDiscoveryExposureRotation,
  buildStoreDiscoveryHomeExposureScope,
} from "@/lib/stores/store-discovery-exposure";
import { buildBrowseStoreCommerceSnapshot } from "@/lib/stores/browse-store-commerce-snapshot";
import { formatStoreBrowseDeliveryFeeLine, formatStoreBrowseDeliveryFeeStrikePhp, parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
import { buildBrowseStoreListEtaLabel } from "@/lib/stores/store-delivery-eta-label";
import { formatStoreLocationLine } from "@/lib/stores/store-location-label";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  attachHomeFeedCompositionPolicyMeta,
  loadHomeFeedCompositionPolicyMeta,
} from "@/lib/stores/composition/stores-composition-home-feed-meta";
import {
  attachHomeFeedInsertionMeta,
  loadStoresHomeInsertionMeta,
} from "@/lib/stores/composition/stores-composition-home-insertion-meta";
import { composeLiveHomeFeed } from "@/lib/stores/composition/stores-composition-live";
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
import { loadStoreCompletedOrderCount30dMapWithStatus } from "@/lib/stores/store-discovery-popular-store";
import { loadCommerceSettings } from "@/lib/stores/load-commerce-settings";
import { loadStorePopularProductStatsBatch } from "@/lib/stores/load-store-popular-product-stats-batch";
import { loadActiveStoreDiscoveryCampaignsForHome, attachDiscoveryCampaignsToHomeFeedStores, mapDiscoveryCampaignHomePayload } from "@/lib/stores/load-store-discovery-campaigns-for-home";
import {
  assemblePlatformPopularProductsForStore,
  buildActiveProductCatalogMap,
  resolvePopularMenuStatsSinceIso,
} from "@/lib/stores/assemble-store-home-platform-popular-products";
import { sortStoreDiscoveryHomeFeedRows } from "@/lib/stores/store-discovery-browse-sort";
import {
  resolveStoreDiscoveryEligibility,
  resolveStoreDiscoveryHomeDisplayStatus,
} from "@/lib/stores/store-discovery-eligibility";

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
  first_listed_at?: string | null;
  rating_avg: number | null;
  review_count: number | null;
  delivery_available: boolean | null;
  pickup_available: boolean | null;
  visit_available: boolean | null;
  is_featured: boolean | null;
  store_categories?: RelOne | RelOne[] | null;
};

async function finalizeHomeFeedJsonPayload(
  supabase: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  payload: { ok: true; stores: StoreHomeFeedItem[]; meta?: Record<string, unknown> }
) {
  const compositionPolicy = await loadHomeFeedCompositionPolicyMeta(supabase).catch(() => null);
  const withPolicy = attachHomeFeedCompositionPolicyMeta(payload, compositionPolicy);
  const restOrganicStoreIds = composeLiveHomeFeed(payload.stores).slot6RestStores.map((s) => s.id);
  const restShelf = compositionPolicy?.shelfProduct?.shelves?.find((s) => s.shelfId === "rest_stores");
  const insertions = await loadStoresHomeInsertionMeta(supabase, {
    restOrganicStoreIds,
    restShelfAdIntegration: restShelf?.adIntegration ?? null,
  }).catch(() => null);
  return attachHomeFeedInsertionMeta(withPolicy, insertions);
}

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
    const campaignRefresh = await attachDiscoveryCampaignsToHomeFeedStores(supabase, cached.stores);
    const refreshedPayload = {
      ...cached,
      stores: campaignRefresh.stores,
      meta: {
        ...cached.meta,
        discoveryCampaigns: { status: campaignRefresh.status },
      },
    };
    const finalized = await finalizeHomeFeedJsonPayload(supabase, refreshedPayload);
    return NextResponse.json(finalized, {
      headers: { "Cache-Control": STORE_HOME_FEED_HTTP_CACHE_CONTROL },
    });
  }

  try {
    const hasGeo = userLat != null && userLng != null;
    const distanceAxisEnabled = serviceabilityCtx.policy.enabled && hasGeo;
    const exposureScope = buildStoreDiscoveryHomeExposureScope({
      region,
      district,
      searchQ,
      originKey: origin.cacheKeyPart,
      hasGeo,
      geoKey: hasGeo ? `g:${userLat!.toFixed(5)},${userLng!.toFixed(5)}` : "",
    });

    let rows: FeedRow[] = [];
    const eligibilityRankById = new Map<string, number>();
    const outOfRangeById = new Map<string, boolean>();
    const distById = new Map<string, number | null>();
    let orderLoad: { status: "ok" | "error"; counts: Map<string, number> } = {
      status: "ok",
      counts: new Map(),
    };
    let effectiveById = new Map<string, FeedRow>();

    const rankingAuthority = resolveStoreDiscoveryRankingAuthority();

    if (isStoreDiscoveryRankingAuthorityNew()) {
      const live = await loadHomeDiscoveryRankedForLive(supabase, {
        originLat: userLat,
        originLng: userLng,
        district,
        searchQ,
        distanceAxisEnabled,
        exposureScope,
      });
      if (!live.ok) {
        // Fail-closed — never silent-fallback to OLD full-candidate ranking.
        return NextResponse.json(
          {
            ok: false,
            error: "discovery_ranking_unavailable",
            stores: [] as StoreHomeFeedItem[],
            meta: {
              source: "supabase" as const,
              ranking_authority: "new" as const,
              ranking_status: live.status,
            },
          },
          { status: 500, headers: { "Cache-Control": STORE_HOME_FEED_HTTP_CACHE_CONTROL } }
        );
      }
      rows = live.rows as FeedRow[];
      for (const [id, rank] of live.eligibilityRankById) eligibilityRankById.set(id, rank);
      for (const [id, oor] of live.outOfRangeById) outOfRangeById.set(id, oor);
      for (const [id, d] of live.distById) distById.set(id, d);
      orderLoad = { status: "ok", counts: live.completedOrders30dById };

      if (rows.length === 0 && !searchQ) {
        return NextResponse.json(
          {
            ok: true,
            stores: [] as StoreHomeFeedItem[],
            meta: { source: "supabase" as const, ranking_authority: "new" as const },
          },
          { headers: { "Cache-Control": STORE_HOME_FEED_HTTP_CACHE_CONTROL } }
        );
      }

      const ownerDefaults = await loadOwnerDefaultAddressByUserId(
        supabase,
        rows.map((r) => String(r.owner_user_id ?? ""))
      );
      effectiveById = new Map(
        rows.map((r) => [
          r.id,
          resolveEffectiveStoreRouteAddress(
            r,
            ownerDefaults.get(String(r.owner_user_id ?? "").trim())
          ) as FeedRow,
        ])
      );
    } else {
      logStoreDiscoveryAuthorityRuntime({
        surface: "home",
        authority: "old",
        status: "old_path",
      });
      const candidateLoad = await loadHomeDiscoveryCandidateRows(supabase, { searchQ });
      if (candidateLoad.status === "error") {
        console.error("[api/stores/home-feed] candidate load error");
      }
      rows = candidateLoad.rows as FeedRow[];

      if (rows.length === 0 && !searchQ) {
        return NextResponse.json(
          {
            ok: true,
            stores: [] as StoreHomeFeedItem[],
            meta: { source: "supabase" as const, ranking_authority: "old" as const },
          },
          { headers: { "Cache-Control": STORE_HOME_FEED_HTTP_CACHE_CONTROL } }
        );
      }
      const ownerDefaults = await loadOwnerDefaultAddressByUserId(
        supabase,
        rows.map((r) => String(r.owner_user_id ?? ""))
      );
      effectiveById = new Map(
        rows.map((r) => [
          r.id,
          resolveEffectiveStoreRouteAddress(
            r,
            ownerDefaults.get(String(r.owner_user_id ?? "").trim())
          ) as FeedRow,
        ])
      );

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
      orderLoad = await loadStoreCompletedOrderCount30dMapWithStatus(supabase, allRowIds);

      rows = sortStoreDiscoveryHomeFeedRows(rows, {
        district,
        eligibilityRankById,
        distanceKmById: userLat != null && userLng != null ? distById : null,
        outOfRangeById: userLat != null && userLng != null ? outOfRangeById : null,
        hasGeo: userLat != null && userLng != null,
        completedOrderCount30dById: orderLoad.counts,
        completedOrderCountStatus: orderLoad.status,
      });

      rows = applyStoreDiscoveryExposureRotation({
        recommendedSorted: rows,
        eligibilityRankById,
        exposureScope,
      });

      rows = rows.slice(0, STORE_HOME_FEED_RESPONSE_MAX);
    }

    if (process.env.NODE_ENV === "development" && userLat != null && userLng != null && rows.length > 0) {
      devLogRoutesSkipped("list_screen_disabled", "api/stores/home-feed");
    }

    const ids = rows.map((r) => r.id);
    const featuredByStore = new Map<
      string,
      { productId: string; name: string; price: number; imageUrl: string | null }[]
    >();
    let activeCatalogByStore = new Map<
      string,
      Map<string, { productId: string; name: string; price: number; imageUrl: string | null }>
    >();
    let popularProductStatsStatus: "ok" | "error" = "ok";
    const platformPopularByStore = new Map<
      string,
      Array<{
        productId: string;
        name: string;
        price: number;
        imageUrl: string | null;
        totalQty: number;
        popularRank: number;
        windowDays: number;
      }>
    >();

    if (ids.length > 0) {
      const [commerce, { data: prods, error: pErr }] = await Promise.all([
        loadCommerceSettings(supabase),
        supabase
          .from("store_products")
          .select("id, store_id, title, price, thumbnail_url, is_featured, sort_order")
          .in("store_id", ids)
          .eq("product_status", "active"),
      ]);

      if (pErr) {
        console.error("[api/stores/home-feed] products", pErr);
      } else {
        const list = (prods ?? []) as ProductMini[];
        activeCatalogByStore = buildActiveProductCatalogMap(list, resolveBrowseFeaturedMenuImageUrl);
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

      const since = resolvePopularMenuStatsSinceIso(commerce.popularMenuWindowDays);
      const statsLoad = await loadStorePopularProductStatsBatch(supabase, ids, {
        since,
        limitPerStore: commerce.popularMenuTopN,
      });
      popularProductStatsStatus = statsLoad.status;

      if (statsLoad.status === "error") {
        console.error("[api/stores/home-feed] popular product stats batch failed");
      }

      for (const storeId of ids) {
        const catalog = activeCatalogByStore.get(storeId);
        const statRows = statsLoad.status === "ok" ? (statsLoad.byStoreId.get(storeId) ?? []) : [];
        platformPopularByStore.set(
          storeId,
          assemblePlatformPopularProductsForStore(
            statRows,
            catalog,
            commerce.popularMenuMinQty,
            commerce.popularMenuWindowDays
          )
        );
      }
    }


    let discoveryCampaignsStatus: "ok" | "error" = "ok";
    const discoveryCampaignByStore = new Map<
      string,
      {
        id: string;
        campaignType: "event" | "promo";
        title: string;
        bodyCopy: string | null;
        startAt: string;
        endAt: string;
      }
    >();
    {
      const campaignLoad = await loadActiveStoreDiscoveryCampaignsForHome(supabase, ids);
      discoveryCampaignsStatus = campaignLoad.status;
      for (const [storeId, row] of campaignLoad.byStoreId) {
        discoveryCampaignByStore.set(storeId, mapDiscoveryCampaignHomePayload(row));
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
      if (rankingAuthority === "new") {
        distancePolicyApplied = distanceAxisEnabled;
        if (distanceAxisEnabled) {
          const effective = effectiveById.get(r.id) ?? r;
          const svc = evaluateStoreDeliveryServiceability({
            ctx: serviceabilityCtx,
            storeId: r.id,
            customerLat: userLat!,
            customerLng: userLng!,
            storeLat: effective.lat,
            storeLng: effective.lng,
          });
          maxDeliveryDistanceKm = svc.applies ? svc.maxKm : null;
          // Ranking/display OOR + distanceKm already from NEW wave projection maps.
        }
      } else if (userLat != null && userLng != null) {
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
        platformPopularProducts: platformPopularByStore.get(r.id) ?? [],
        profileImageUrl: r.profile_image_url,
        isFeatured: !!r.is_featured,
        completedOrderCount30d:
          orderLoad.status === "ok" ? (orderLoad.counts.get(r.id) ?? 0) : 0,
        discoveryEligibilityRank: eligibilityRankById.get(r.id) ?? 99,
        firstListedAt:
          typeof r.first_listed_at === "string" && r.first_listed_at.trim() ?
            r.first_listed_at
          : null,
        discoveryCampaign: discoveryCampaignByStore.get(r.id) ?? null,
      };
    });

    const payload = {
      ok: true as const,
      stores,
      meta: {
        source: "supabase" as const,
        sorted_by: "eligibility_district_distance_orders_rating",
        ranking_authority: rankingAuthority,
        origin_source: origin.source,
        origin_address_id: origin.addressId,
        popularProductStats: { status: popularProductStatsStatus },
        discoveryCampaigns: { status: discoveryCampaignsStatus },
      },
    };
    setStoreHomeFeedCache(cacheKey, payload);
    const finalized = await finalizeHomeFeedJsonPayload(supabase, payload);
    return NextResponse.json(finalized, {
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
