import { NextResponse } from "next/server";
import { districtRank, haversineKm } from "@/lib/geo/haversine-km";
import { devLogRoutesSkipped } from "@/lib/geo/google-routes-client";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { resolveStoreFrontOpen } from "@/lib/stores/store-auto-hours";
import { resolveStoreFrontOrderable } from "@/lib/stores/store-point-commerce-block";
import { buildBrowseStoreCommerceSnapshot } from "@/lib/stores/browse-store-commerce-snapshot";
import { formatStoreBrowseDeliveryFeeLine, formatStoreBrowseDeliveryFeeStrikePhp, parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
import { buildBrowseStoreListEtaLabel } from "@/lib/stores/store-delivery-eta-label";
import { formatStoreLocationLine } from "@/lib/stores/store-location-label";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadDeliveryRideTimeSource } from "@/lib/delivery/delivery-ops-settings";
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
  const [origin, deliveryRideTimeSource] = await Promise.all([
    resolveStoreListDeliveryOrigin(supabase, searchParams),
    loadDeliveryRideTimeSource(supabase),
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

    const byFeaturedDistrictRating = (a: FeedRow, b: FeedRow) => {
      const dr = districtRank(a.district, district) - districtRank(b.district, district);
      if (dr !== 0) return dr;
      const feat = Number(!!b.is_featured) - Number(!!a.is_featured);
      if (feat !== 0) return feat;
      const ratingB = Number(b.rating_avg ?? 0);
      const ratingA = Number(a.rating_avg ?? 0);
      if (ratingB !== ratingA) return ratingB - ratingA;
      return (b.review_count ?? 0) - (a.review_count ?? 0);
    };

    if (userLat != null && userLng != null) {
      rows = [...rows].sort((a, b) => {
        const dr = districtRank(a.district, district) - districtRank(b.district, district);
        if (dr !== 0) return dr;
        const feat = Number(!!b.is_featured) - Number(!!a.is_featured);
        if (feat !== 0) return feat;
        const ea = effectiveById.get(a.id) ?? a;
        const eb = effectiveById.get(b.id) ?? b;
        const da = haversineKm(userLat, userLng, ea.lat, ea.lng);
        const db = haversineKm(userLat, userLng, eb.lat, eb.lng);
        if (da != null && db != null && da !== db) return da - db;
        if (da != null && db == null) return -1;
        if (da == null && db != null) return 1;
        return byFeaturedDistrictRating(a, b);
      });
    } else {
      rows = [...rows].sort(byFeaturedDistrictRating);
    }

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
      const scheduleOpen = resolveStoreFrontOpen(r.business_hours_json, r.is_open);
      const orderable = resolveStoreFrontOrderable(scheduleOpen, r);
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

      let distanceKm: number | null = null;
      if (userLat != null && userLng != null) {
        const effective = effectiveById.get(r.id) ?? r;
        distanceKm = haversineKm(userLat, userLng, effective.lat, effective.lng);
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
        status: orderable
          ? "open"
          : r.is_open === false && !r.point_commerce_blocked
            ? "closed"
            : "preparing",
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
        featuredItems: featuredByStore.get(r.id) ?? [],
        profileImageUrl: r.profile_image_url,
        isFeatured: !!r.is_featured,
      };
    });

    /** 지금 주문 가능(영업중·배달) 우선 — 이미 거리·피처드 정렬 반영 후 상단부 재정렬 */
    const openDeliveryFirst = [...stores].sort((a, b) => {
      const score = (s: StoreHomeFeedItem) =>
        (s.status === "open" ? 4 : s.status === "preparing" ? 2 : 0) + (s.deliveryAvailable ? 1 : 0);
      const d = score(b) - score(a);
      if (d !== 0) return d;
      return 0;
    });

    const payload = {
      ok: true as const,
      stores: openDeliveryFirst,
      meta: {
        source: "supabase" as const,
        sorted_by:
          userLat != null && userLng != null
            ? "open_delivery_featured_distance_rating"
            : "open_delivery_featured_rating",
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
