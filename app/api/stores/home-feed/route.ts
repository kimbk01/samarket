import { NextResponse } from "next/server";
import { districtRank, haversineKm } from "@/lib/geo/haversine-km";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { resolveStoreFrontOpen } from "@/lib/stores/store-auto-hours";
import { parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
import { formatStoreLocationLine } from "@/lib/stores/store-location-label";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { formatMoneyPhp } from "@/lib/utils/format";

export const dynamic = "force-dynamic";
const STORE_HOME_FEED_SERVER_CACHE_TTL_MS = 20_000;
const STORE_HOME_FEED_HTTP_CACHE_CONTROL = "public, max-age=10, s-maxage=20, stale-while-revalidate=40";

type StoreHomeFeedServerCacheEntry = {
  payload: {
    ok: true;
    stores: StoreHomeFeedItem[];
    meta: {
      source: "supabase";
      sorted_by: string;
    };
  };
  expiresAt: number;
};

const storeHomeFeedServerCache = new Map<string, StoreHomeFeedServerCacheEntry>();

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

function parseCoord(v: string | null): number | null {
  if (v == null || !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeCoordForCache(value: number | null): string {
  return value == null ? "" : value.toFixed(3);
}

function buildStoreHomeFeedCacheKey(input: {
  region: string | null;
  district: string | null;
  searchQ: string | null;
  userLat: number | null;
  userLng: number | null;
}): string {
  return [
    input.region ?? "",
    input.district ?? "",
    input.searchQ ?? "",
    normalizeCoordForCache(input.userLat),
    normalizeCoordForCache(input.userLng),
  ].join("|");
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
  is_featured: boolean | null;
  sort_order: number | null;
};

type FeedRow = {
  id: string;
  store_name: string;
  slug: string;
  region: string | null;
  city: string | null;
  district: string | null;
  lat: number | null;
  lng: number | null;
  profile_image_url: string | null;
  description: string | null;
  is_open: boolean | null;
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
  const userLat = parseCoord(searchParams.get("user_lat"));
  const userLng = parseCoord(searchParams.get("user_lng"));
  const cacheKey = buildStoreHomeFeedCacheKey({
    region,
    district,
    searchQ,
    userLat,
    userLng,
  });

  for (const [key, entry] of storeHomeFeedServerCache) {
    if (entry.expiresAt <= Date.now()) {
      storeHomeFeedServerCache.delete(key);
    }
  }

  const cached = storeHomeFeedServerCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload, {
      headers: { "Cache-Control": STORE_HOME_FEED_HTTP_CACHE_CONTROL },
    });
  }

  try {
    let q = supabase
      .from("stores")
      .select(
        `
        id,
        store_name,
        slug,
        region,
        city,
        district,
        lat,
        lng,
        profile_image_url,
        description,
        is_open,
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
        const da = haversineKm(userLat, userLng, a.lat, a.lng);
        const db = haversineKm(userLat, userLng, b.lat, b.lng);
        if (da != null && db != null && da !== db) return da - db;
        if (da != null && db == null) return -1;
        if (da == null && db != null) return 1;
        return byFeaturedDistrictRating(a, b);
      });
    } else {
      rows = [...rows].sort(byFeaturedDistrictRating);
    }

    rows = rows.slice(0, 48);

    const ids = rows.map((r) => r.id);
    const featuredByStore = new Map<string, { productId: string; name: string; price: number }[]>();

    if (ids.length > 0) {
      const { data: prods, error: pErr } = await supabase
        .from("store_products")
        .select("id, store_id, title, price, is_featured, sort_order")
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
            }))
          );
        }
      }
    }

    const stores: StoreHomeFeedItem[] = rows.map((r) => {
      const cat = embedOne(r.store_categories as RelOne | RelOne[] | null | undefined);
      const openNow = resolveStoreFrontOpen(r.business_hours_json, r.is_open);
      const extras = parseCommerceExtrasFromHoursJson(r.business_hours_json);
      const fee = extras.deliveryFeePhp;
      const deliveryFeeLabel =
        fee != null && Number.isFinite(fee) && r.delivery_available ? formatMoneyPhp(fee) : null;

      const minPhp = extras.minOrderPhp;
      const minOrderLabel =
        minPhp != null && Number.isFinite(minPhp) && minPhp > 0 ? `최소주문 ${formatMoneyPhp(minPhp)}` : null;

      let distanceKm: number | null = null;
      if (userLat != null && userLng != null) {
        distanceKm = haversineKm(userLat, userLng, r.lat, r.lng);
      }

      const regionLabel = formatStoreLocationLine(r) ?? "위치 미등록";

      return {
        id: r.id,
        slug: r.slug,
        nameKo: r.store_name,
        tagline: r.description,
        primarySlug: cat?.slug ?? null,
        primaryNameKo: cat?.name ?? null,
        regionLabel,
        status: openNow ? "open" : r.is_open === false ? "closed" : "preparing",
        rating: r.rating_avg != null ? Number(r.rating_avg) : 0,
        reviewCount: r.review_count ?? 0,
        deliveryAvailable: !!r.delivery_available,
        pickupAvailable: r.pickup_available !== false,
        minOrderLabel,
        estPrepLabel: extras.estPrepLabel,
        deliveryFeeLabel,
        distanceKm,
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
      },
    };
    storeHomeFeedServerCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + STORE_HOME_FEED_SERVER_CACHE_TTL_MS,
    });
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
