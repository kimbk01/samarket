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
  /** taxonomy 미연결 시 `/api/me/stores` 가 `${primary} · ${sub}` 형태로 채움 */
  business_type: string | null;
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

/** browse 카테고리 단건 + 임베드 토픽(PostgREST) */
type StoreCategoryBrowseBundle = {
  id: string;
  slug: string;
  name: string;
  store_topics?: { id: string; slug: string; name: string; sort_order: number | null; is_active: boolean }[] | null;
};

/** PostgREST 임베드가 객체 또는 단일행 배열로 올 수 있음 */
function embedOne(v: RelOne | RelOne[] | null | undefined): RelOne | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** · / - / | 등 업종 구분 표기 통일 */
function normalizeBizTypeSeparators(raw: string): string {
  return raw
    .trim()
    .replace(/\s*[\u00B7\u2219‧･]\s*/g, " · ")
    .replace(/\s*[-–—|]\s*/g, " · ");
}

/**
 * business_type 첫 토큰이 primary 슬러그 또는 DB 1차 표시명(예: 식당) 과 일치할 때 세부 파싱.
 * (신청 실패 시 `${slug} · ${sub}` 또는 `식당 · 한식` 등 혼재)
 */
function parseBizTypePrimarySub(
  businessType: string | null | undefined,
  primarySlug: string,
  primaryDisplayNames: string[]
): { subSlugGuess: string; subLabelGuess: string } | null {
  const bt = normalizeBizTypeSeparators(businessType ?? "");
  if (!bt) return null;
  const parts = bt.split(" · ").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const headNorm = parts[0].toLowerCase();
  const aliases = new Set(primaryDisplayNames.map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (!aliases.has(headNorm)) return null;
  const label = parts.slice(1).join(" · ").trim();
  if (!label) return null;
  return { subSlugGuess: label.toLowerCase(), subLabelGuess: label };
}

/** ILIKE 패턴용 — 와일드카드 문자 제거 */
function sanitizeForIlikeFragment(s: string): string {
  return s.replace(/\\/g, "").replace(/%/g, "").replace(/_/g, "").trim();
}

const STORE_ROW_CORE_FIELDS = `
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
        business_type`;

/** 동일 slug 토픽 중복 행 방지 — sort_order 우선(관리자/시드 중복 대비) */
function dedupeStoreTopicsForBrowse(
  topics: { id: string; slug: string; name: string; sort_order: number | null }[]
): { id: string; slug: string; name: string }[] {
  const best = new Map<
    string,
    { id: string; slug: string; name: string; sort_order: number }
  >();
  for (const t of topics) {
    const slugKey = String(t.slug ?? "").trim().toLowerCase();
    if (!slugKey) continue;
    const so = t.sort_order ?? 0;
    const prev = best.get(slugKey);
    if (!prev || so < prev.sort_order) {
      best.set(slugKey, {
        id: String(t.id),
        slug: String(t.slug).trim(),
        name: String(t.name ?? "").trim(),
        sort_order: so,
      });
    }
  }
  return [...best.values()]
    .sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug))
    .map(({ sort_order: _so, ...rest }) => rest);
}

function mapBrowseEmbedRows(raw: unknown[]): StoreBrowseRow[] {
  return (raw ?? []).map((row) => {
    const o = row as StoreBrowseRow & {
      store_categories?: RelOne | RelOne[];
      store_topics?: RelOne | RelOne[];
    };
    return {
      ...o,
      business_type: o.business_type ?? null,
      store_categories: embedOne(o.store_categories),
      store_topics: embedOne(o.store_topics),
    };
  });
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
  const subRaw = (searchParams.get("sub") ?? "").trim().toLowerCase();
  /** 세부 주제 미선택·「전체」 — 해당 1차 업종만 필터 (세부는 제한하지 않음). 예약 slug: `all` */
  const wantsAllSubs = subRaw === "" || subRaw === "all";
  const sub = wantsAllSubs ? "all" : subRaw;
  const district = searchParams.get("district")?.trim() || null;
  const userLat = parseCoord(searchParams.get("user_lat"));
  const userLng = parseCoord(searchParams.get("user_lng"));

  if (!primary) {
    return NextResponse.json(
      { ok: false, error: "primary_required", stores: [] },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    /**
     * region/city/district 쿼리 파라미터는 districtRank·거리 정렬에만 사용.
     * 업종은 `store_category_id` / `store_topic_id` 직접 필터 (PostgREST !inner 임베드 미신뢰).
     * 카테고리·토픽은 한 번에 로드해 왕복을 줄인다. 활성 여부는 `/api/stores/taxonomy`·매장 신청과 동일.
     */
    const { data: catBundle, error: catErr } = await supabase
      .from("store_categories")
      .select(`id, slug, name, store_topics ( id, slug, name, sort_order, is_active )`)
      .eq("slug", primary)
      .eq("is_active", true)
      .maybeSingle();

    if (catErr) {
      console.error("[api/stores/browse] category lookup", catErr);
      return NextResponse.json(
        { ok: false, stores: [], error: catErr.message },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    const catRow = catBundle;

    if (!catRow?.id) {
      return NextResponse.json(
        {
          ok: true,
          stores: [],
          meta: {
            source: "supabase" as const,
            primary,
            sub,
            all_topics: wantsAllSubs,
            reason: "unknown_primary_slug",
          },
        },
        { headers: { "Cache-Control": STORE_BROWSE_HTTP_CACHE_CONTROL } }
      );
    }

    const primaryNameKoFallback =
      typeof catRow.name === "string" && catRow.name.trim() ? catRow.name.trim() : primary;

    const primaryAliases = [primary, catRow.name ?? ""].map((s) => s.trim()).filter(Boolean);

    const topicsRaw = ((catRow as StoreCategoryBrowseBundle).store_topics ?? []).filter((t) => t.is_active);

    const topicList = dedupeStoreTopicsForBrowse(topicsRaw);
    const topicIdBySlug = new Map(topicList.map((t) => [String(t.slug).trim().toLowerCase(), String(t.id)]));

    const resolvedTopicId = !wantsAllSubs ? (topicIdBySlug.get(subRaw) ?? null) : null;
    if (!wantsAllSubs && !resolvedTopicId) {
      return NextResponse.json(
        {
          ok: true,
          stores: [],
          meta: {
            source: "supabase" as const,
            primary,
            sub,
            all_topics: false,
            reason: "unknown_topic_slug",
          },
        },
        { headers: { "Cache-Control": STORE_BROWSE_HTTP_CACHE_CONTROL } }
      );
    }

    const topicNameToSlug = new Map<string, string>();
    for (const t of topicList) {
      const nk = String(t.name).trim().toLowerCase();
      const sk = String(t.slug).trim().toLowerCase();
      if (nk && !topicNameToSlug.has(nk)) topicNameToSlug.set(nk, sk);
    }

    function orphanMatchesChosenSub(parsed: { subSlugGuess: string; subLabelGuess: string } | null): boolean {
      if (wantsAllSubs) return true;
      if (!parsed) return false;
      const guessSlug = parsed.subSlugGuess.trim().toLowerCase();
      if (guessSlug === subRaw) return true;
      const slugViaKoName = topicNameToSlug.get(parsed.subLabelGuess.trim().toLowerCase());
      return slugViaKoName === subRaw;
    }

    /**
     * store_category_id 없이 business_type 만 있는 승인 매장 — 슬러그·한글 표기·하이픈 구분 모두 허용.
     * ILIKE 와일드카드 주입 방지: 슬러그·표시명 조각은 sanitize 후만 패턴에 넣는다.
     */
    const primarySafe = sanitizeForIlikeFragment(primary);
    const cn = sanitizeForIlikeFragment(catRow.name ?? "");
    const orphanOrParts: string[] = [];
    if (primarySafe.length >= 1) {
      orphanOrParts.push(
        `business_type.ilike.%${primarySafe} ·%`,
        `business_type.ilike.%${primarySafe}·%`,
        `business_type.ilike.%${primarySafe} -%`,
        `business_type.ilike.%${primarySafe}-%`
      );
    }
    if (cn.length >= 1) {
      orphanOrParts.push(
        `business_type.ilike.%${cn} ·%`,
        `business_type.ilike.%${cn}·%`,
        `business_type.ilike.%${cn} -%`,
        `business_type.ilike.%${cn}-%`
      );
    }

    let mainQ = supabase
      .from("stores")
      .select(
        `${STORE_ROW_CORE_FIELDS},
        store_categories ( slug, name ),
        store_topics ( slug, name )
      `
      )
      .eq("approval_status", "approved")
      .eq("is_visible", true)
      .eq("store_category_id", catRow.id)
      .limit(160);

    if (!wantsAllSubs && resolvedTopicId) {
      mainQ = mainQ.eq("store_topic_id", resolvedTopicId);
    }

    const orphanQ =
      orphanOrParts.length > 0 ?
        supabase
          .from("stores")
          .select(
            `${STORE_ROW_CORE_FIELDS},
        store_categories ( slug, name ),
        store_topics ( slug, name )
      `
          )
          .eq("approval_status", "approved")
          .eq("is_visible", true)
          .is("store_category_id", null)
          .or(orphanOrParts.join(","))
          .limit(160)
      : null;

    const [{ data: rawRows, error }, orphanRes] = await Promise.all([
      mainQ,
      orphanQ ?? Promise.resolve({ data: [] as unknown[], error: null }),
    ]);

    if (error) {
      console.error("[api/stores/browse]", error);
      return NextResponse.json(
        { ok: false, stores: [], error: error.message },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    let rows: StoreBrowseRow[] = mapBrowseEmbedRows(rawRows ?? []);

    const orphanErr = orphanRes.error;
    if (orphanErr) {
      console.warn("[api/stores/browse] taxonomy orphan supplement:", orphanErr.message);
    } else {
      const orphans = mapBrowseEmbedRows(orphanRes.data ?? []);
      const seen = new Set(rows.map((r) => r.id));
      for (const o of orphans) {
        if (seen.has(o.id)) continue;
        const legacy = parseBizTypePrimarySub(o.business_type, primary, primaryAliases);
        if (!orphanMatchesChosenSub(legacy)) continue;
        seen.add(o.id);
        rows.push(o);
      }
    }

    const stableSlug = (a: StoreBrowseRow, b: StoreBrowseRow) =>
      String(a.slug ?? "").localeCompare(String(b.slug ?? ""));

    const stableId = (a: StoreBrowseRow, b: StoreBrowseRow) => String(a.id).localeCompare(String(b.id));

    const byDistrictFeaturedRating = (a: StoreBrowseRow, b: StoreBrowseRow) => {
      const dr = districtRank(a.district, district) - districtRank(b.district, district);
      if (dr !== 0) return dr;
      const feat = Number(!!b.is_featured) - Number(!!a.is_featured);
      if (feat !== 0) return feat;
      const ratingB = Number(b.rating_avg ?? 0);
      const ratingA = Number(a.rating_avg ?? 0);
      if (ratingB !== ratingA) return ratingB - ratingA;
      const rev = (b.review_count ?? 0) - (a.review_count ?? 0);
      if (rev !== 0) return rev;
      const slugCmp = stableSlug(a, b);
      if (slugCmp !== 0) return slugCmp;
      return stableId(a, b);
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
      const legacy =
        cat == null && (r.business_type ?? "").trim().length > 0 ?
          parseBizTypePrimarySub(r.business_type, primary, primaryAliases)
        : null;
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
        subSlug: wantsAllSubs ? "all" : (top?.slug ?? legacy?.subSlugGuess ?? subRaw),
        primaryNameKo: cat?.name ?? primaryNameKoFallback,
        subNameKo:
          wantsAllSubs ? "전체"
          : (top?.name ?? legacy?.subLabelGuess ?? subRaw),
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
          all_topics: wantsAllSubs,
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
