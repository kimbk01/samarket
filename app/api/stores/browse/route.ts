import { NextResponse } from "next/server";
import { districtRank, haversineKm } from "@/lib/geo/haversine-km";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import { resolveStoreFrontOpen } from "@/lib/stores/store-auto-hours";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { formatStoreLocationLine } from "@/lib/stores/store-location-label";
import { parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
import { formatMoneyPhp } from "@/lib/utils/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_BROWSE_HTTP_CACHE_CONTROL = "public, max-age=15, s-maxage=30, stale-while-revalidate=60";

function parseCoord(v: string | null): number | null {
  if (v == null || !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type StoreBrowseRow = {
  id: string;
  store_name: string;
  slug: string;
  description: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  profile_image_url: string | null;
  is_open: boolean | null;
  rating_avg: number | null;
  review_count: number | null;
  delivery_available: boolean | null;
  pickup_available: boolean | null;
  visit_available: boolean | null;
  reservation_available: boolean | null;
  is_featured: boolean | null;
  lat: number | null;
  lng: number | null;
  business_hours_json: unknown;
  store_categories: { slug: string; name: string } | null;
  store_topics: { slug: string; name: string } | null;
};

type ProductMini = {
  id: string;
  store_id: string;
  title: string;
  price: number;
  is_featured: boolean | null;
  sort_order: number | null;
};

type RelOne = { slug: string; name: string };

/** PostgREST 임베드가 객체 또는 단일행 배열로 올 수 있음 */
function embedOne(v: RelOne | RelOne[] | null | undefined): RelOne | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/**
 * 업종(primary slug) + 세부 주제(sub slug)별 실매장 목록 (서비스 롤, RLS 우회)
 * ?district= — 같은 구/동 우선 정렬(districtRank)
 * ?user_lat= & ?user_lng= — 거리 보조 정렬
 */
export async function GET(req: Request) {
  const supabase = tryGetSupabaseForStores();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: true,
        stores: [] as BrowseStoreListItem[],
        meta: { source: "supabase_unconfigured" as const },
      },
      { headers: { "Cache-Control": STORE_BROWSE_HTTP_CACHE_CONTROL } }
    );
  }

  const { searchParams } = new URL(req.url);
  const primary = (searchParams.get("primary") ?? "").trim().toLowerCase();
  const sub = (searchParams.get("sub") ?? "").trim().toLowerCase();
  const district = searchParams.get("district")?.trim() || null;
  const userLat = parseCoord(searchParams.get("user_lat"));
  const userLng = parseCoord(searchParams.get("user_lng"));

  if (!primary || !sub) {
    return NextResponse.json(
      { ok: false, error: "primary_and_sub_required", stores: [] },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    /**
     * 업종·세부주제만 DB에서 고른다. region/city/district 쿼리 파라미터는
     * 아래 districtRank·거리 정렬에만 쓴다. (프로필 지역 표기가 탭바 동네와
     * 조금만 달라도 ILIKE 필터에 걸려 0건 → 데모만 보이는 문제 방지)
     */
    const { data: rawRows, error } = await supabase
      .from("stores")
      .select(
        `
        id,
        store_name,
        slug,
        description,
        region,
        city,
        district,
        profile_image_url,
        is_open,
        rating_avg,
        review_count,
        delivery_available,
        pickup_available,
        visit_available,
        reservation_available,
        is_featured,
        lat,
        lng,
        business_hours_json,
        store_categories!inner ( slug, name ),
        store_topics!inner ( slug, name )
      `
      )
      .eq("approval_status", "approved")
      .eq("is_visible", true)
      .eq("store_categories.slug", primary)
      .eq("store_topics.slug", sub)
      .limit(80);

    if (error) {
      console.error("[api/stores/browse]", error);
      return NextResponse.json(
        { ok: false, stores: [], error: error.message },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    let rows: StoreBrowseRow[] = (rawRows ?? []).map((r) => {
      const o = r as StoreBrowseRow & {
        store_categories?: RelOne | RelOne[];
        store_topics?: RelOne | RelOne[];
      };
      return {
        ...o,
        store_categories: embedOne(o.store_categories),
        store_topics: embedOne(o.store_topics),
      };
    });

    const byDistrictFeaturedRating = (a: StoreBrowseRow, b: StoreBrowseRow) => {
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
        return byDistrictFeaturedRating(a, b);
      });
    } else {
      rows = [...rows].sort(byDistrictFeaturedRating);
    }

    rows = rows.slice(0, 60);

    const ids = rows.map((r) => r.id);
    const featuredByStore = new Map<string, { productId: string; name: string; price: number }[]>();

    if (ids.length > 0) {
      const { data: prods, error: pErr } = await supabase
        .from("store_products")
        .select("id, store_id, title, price, is_featured, sort_order")
        .in("store_id", ids)
        .eq("product_status", "active");

      if (pErr) {
        console.error("[api/stores/browse] products", pErr);
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

    const stores: BrowseStoreListItem[] = rows.map((r) => {
      const cat = r.store_categories;
      const top = r.store_topics;
      const openNow = resolveStoreFrontOpen(r.business_hours_json, r.is_open);
      const status: BrowseStoreListItem["status"] = openNow ? "open" : "preparing";
      const regionLabel = formatStoreLocationLine(r) ?? "위치 미등록";
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

      return {
        id: r.id,
        slug: r.slug,
        nameKo: r.store_name,
        tagline: r.description,
        primarySlug: cat?.slug ?? primary,
        subSlug: top?.slug ?? sub,
        primaryNameKo: cat?.name ?? "",
        subNameKo: top?.name ?? "",
        regionLabel,
        status,
        rating: r.rating_avg != null ? Number(r.rating_avg) : 0,
        reviewCount: r.review_count ?? 0,
        deliveryAvailable: !!r.delivery_available,
        pickupAvailable: r.pickup_available !== false,
        visitAvailable: r.visit_available !== false,
        featuredItems: featuredByStore.get(r.id) ?? [],
        profileImageUrl: r.profile_image_url,
        isFeatured: !!r.is_featured,
        estPrepLabel: extras.estPrepLabel,
        deliveryFeeLabel,
        minOrderLabel,
        distanceKm,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        stores,
        meta: {
          source: "supabase" as const,
          primary,
          sub,
          sorted_by:
            userLat != null && userLng != null
              ? "district_featured_distance_rating"
              : "district_featured_rating",
        },
      },
      { headers: { "Cache-Control": STORE_BROWSE_HTTP_CACHE_CONTROL } }
    );
  } catch (e) {
    console.error("[api/stores/browse]", e);
    return NextResponse.json(
      {
        ok: false,
        stores: [],
        error: e instanceof Error ? e.message : "unknown",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
