import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  evaluateStoreDeliveryServiceability,
  loadDeliveryServiceabilityRuntimeContext,
  serviceabilityDeprioritizeRank,
} from "@/lib/delivery/load-delivery-serviceability-runtime";
import { getUserAddressDefaults } from "@/lib/addresses/user-address-service";
import type { SupabaseClient } from "@supabase/supabase-js";

function sanitizeForIlike(raw: string): string {
  return raw
    .trim()
    .slice(0, 60)
    .replace(/[%_,]/g, "")
    .replace(/"/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDeliveryKeyword(raw: string): { keyword: string; normalized: string } | null {
  const keyword = sanitizeForIlike(raw);
  if (!keyword) return null;
  return { keyword, normalized: keyword.toLowerCase() };
}

export type DeliverySearchStoreResult = {
  id: string;
  slug: string;
  store_name: string;
  description: string | null;
  profile_image_url: string | null;
  rating_avg: number | null;
  review_count: number | null;
  district: string | null;
  city: string | null;
  region: string | null;
  lat?: number | null;
  lng?: number | null;
  distanceKm?: number | null;
  distanceOutOfRange?: boolean;
  maxDeliveryDistanceKm?: number | null;
  distancePolicyApplied?: boolean;
};

export type DeliverySearchMenuResult = {
  id: string;
  store_id: string;
  store_slug: string;
  store_name: string;
  title: string;
  summary: string | null;
  price: number;
  discount_price: number | null;
  thumbnail_url: string | null;
};

export type DeliverySearchDebug = {
  keyword: string;
  storeTable: "stores";
  menuTable: "store_products";
  storeConditions: string[];
  menuConditions: string[];
  matchedStoresCount: number;
  rawMatchedProductsCount: number;
  deliveryStoreIdsCount: number;
  finalMenusCount: number;
};

type StoreRow = DeliverySearchStoreResult & {
  approval_status?: string | null;
  is_visible?: boolean | null;
  delivery_available?: boolean | null;
};

type ProductRow = {
  id: string;
  store_id: string;
  title: string;
  summary: string | null;
  price: number;
  discount_price: number | null;
  thumbnail_url: string | null;
  product_status?: string | null;
  local_delivery_available?: boolean | null;
  item_type?: string | null;
};

export async function searchDeliveryDomain(input: {
  q: string;
  storeLimit?: number;
  menuLimit?: number;
  /** Optional — when omitted, tries logged-in master address via supabase auth cookie path is caller responsibility */
  userId?: string | null;
  customerLat?: number | null;
  customerLng?: number | null;
}): Promise<{
  ok: true;
  stores: DeliverySearchStoreResult[];
  menus: DeliverySearchMenuResult[];
  result_count: number;
  debug?: DeliverySearchDebug;
}> {
  const parsed = normalizeDeliveryKeyword(input.q);
  if (!parsed) {
    return {
      ok: true,
      stores: [],
      menus: [],
      result_count: 0,
      debug:
        process.env.NODE_ENV !== "production"
          ? {
              keyword: "",
              storeTable: "stores",
              menuTable: "store_products",
              storeConditions: ["approval_status=approved", "is_visible=true", "delivery_available=true"],
              menuConditions: ["product_status=active", "local_delivery_available=true"],
              matchedStoresCount: 0,
              rawMatchedProductsCount: 0,
              deliveryStoreIdsCount: 0,
              finalMenusCount: 0,
            }
          : undefined,
    };
  }

  const storeLimit = Math.max(1, Math.min(20, Math.floor(Number(input.storeLimit ?? 10)) || 10));
  const menuLimit = Math.max(1, Math.min(40, Math.floor(Number(input.menuLimit ?? 20)) || 20));

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return { ok: true, stores: [], menus: [], result_count: 0 };
  }

  const pat = `%${parsed.keyword}%`;
  const keyword = parsed.keyword;
  console.log("[delivery-search-debug] keyword", keyword);
  console.log("[delivery-search] stores query", {
    table: "stores",
    select: "id, slug, store_name, description, profile_image_url, rating_avg, review_count, district, city, region",
    where: {
      approval_status: "approved",
      is_visible: true,
      delivery_available: true,
      ilike_any: ["store_name", "description", "district", "city", "region"],
    },
    pattern: pat,
  });
  console.log("[delivery-search] menus query", {
    table: "store_products",
    select: "id, store_id, title, summary, price, discount_price, thumbnail_url, item_type",
    where: {
      product_status: "active",
      local_delivery_available: true,
      ilike_any: ["title", "summary"],
    },
    pattern: pat,
    note: "menus are store_products filtered + stores approval/is_visible/delivery_available join (2-step)",
  });

  const storesQuery = sb
    .from("stores")
    .select(
      [
        "id",
        "slug",
        "store_name",
        "description",
        "profile_image_url",
        "rating_avg",
        "review_count",
        "district",
        "city",
        "region",
        "lat",
        "lng",
      ].join(", ")
    )
    .eq("approval_status", "approved")
    .eq("is_visible", true)
    .eq("delivery_available", true)
    .or(
      [
        `store_name.ilike."${pat}"`,
        `description.ilike."${pat}"`,
        `region.ilike."${pat}"`,
        `city.ilike."${pat}"`,
        `district.ilike."${pat}"`,
      ].join(",")
    )
    .order("rating_avg", { ascending: false })
    .order("review_count", { ascending: false })
    .limit(storeLimit);

  const productsQuery = sb
    .from("store_products")
    .select("id, store_id, title, summary, price, discount_price, thumbnail_url, item_type")
    .eq("product_status", "active")
    .eq("local_delivery_available", true)
    .or([`title.ilike."${pat}"`, `summary.ilike."${pat}"`].join(","))
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(Math.max(menuLimit, 30));

  const [storesRes, prodsRes] = await Promise.all([storesQuery, productsQuery]);

  const stores: DeliverySearchStoreResult[] =
    (storesRes.data ?? [])
      .map((r) => r as unknown as DeliverySearchStoreResult)
      .filter((s) => !!s?.id && !!s?.slug) ?? [];

  const prodsRaw = (prodsRes.data ?? []) as unknown as ProductRow[];
  console.log("[delivery-search-debug] raw matched products count", prodsRaw.length);
  const storeIdsFromProducts = Array.from(
    new Set(prodsRaw.map((p) => String(p.store_id ?? "")).filter(Boolean))
  );

  /**
   * 메뉴 검색 결과에서 매칭된 store_id의 매장도 stores 결과에 포함.
   * (정확도 보강) 단, 매장은 반드시 delivery 조건을 만족해야 한다.
   */
  const deliveryStoreById = new Map<string, DeliverySearchStoreResult>();
  if (storeIdsFromProducts.length > 0) {
    const { data: storeMeta } = await sb
      .from("stores")
      .select(
        [
          "id",
          "slug",
          "store_name",
          "description",
          "profile_image_url",
          "rating_avg",
          "review_count",
          "district",
          "city",
          "region",
          "lat",
          "lng",
        ].join(", ")
      )
      .in("id", storeIdsFromProducts)
      .eq("approval_status", "approved")
      .eq("is_visible", true)
      .eq("delivery_available", true)
      .limit(200);
    for (const row of (storeMeta ?? []) as unknown as DeliverySearchStoreResult[]) {
      const id = String(row?.id ?? "");
      const slug = String(row?.slug ?? "");
      if (!id || !slug) continue;
      deliveryStoreById.set(id, {
        id,
        slug,
        store_name: String((row as any).store_name ?? ""),
        description: (row as any).description != null ? String((row as any).description) : null,
        profile_image_url:
          (row as any).profile_image_url != null ? String((row as any).profile_image_url) : null,
        rating_avg: (row as any).rating_avg != null ? Number((row as any).rating_avg) : null,
        review_count: (row as any).review_count != null ? Number((row as any).review_count) : null,
        district: (row as any).district != null ? String((row as any).district) : null,
        city: (row as any).city != null ? String((row as any).city) : null,
        region: (row as any).region != null ? String((row as any).region) : null,
        lat: (row as any).lat != null ? Number((row as any).lat) : null,
        lng: (row as any).lng != null ? Number((row as any).lng) : null,
      });
    }
  }
  console.log("[delivery-search-debug] matched stores count", stores.length);
  console.log("[delivery-search-debug] delivery store ids count", deliveryStoreById.size);

  // stores 결과에 메뉴 매칭 store를 merge (중복 제거) + limit 유지
  const byId = new Map<string, DeliverySearchStoreResult>();
  const merged: DeliverySearchStoreResult[] = [];
  for (const storeId of storeIdsFromProducts) {
    const s = deliveryStoreById.get(storeId);
    if (!s || byId.has(s.id)) continue;
    byId.set(s.id, s);
    merged.push(s);
  }
  for (const s of stores) {
    if (!s?.id || byId.has(s.id)) continue;
    byId.set(s.id, s);
    merged.push(s);
  }
  const mergedStoresRaw = merged.slice(0, storeLimit);

  let customerLat =
    input.customerLat != null && Number.isFinite(Number(input.customerLat))
      ? Number(input.customerLat)
      : null;
  let customerLng =
    input.customerLng != null && Number.isFinite(Number(input.customerLng))
      ? Number(input.customerLng)
      : null;
  if ((customerLat == null || customerLng == null) && input.userId) {
    try {
      const defaults = await getUserAddressDefaults(sb as SupabaseClient, input.userId);
      const la = defaults.master?.latitude;
      const ln = defaults.master?.longitude;
      if (typeof la === "number" && Number.isFinite(la)) customerLat = la;
      if (typeof ln === "number" && Number.isFinite(ln)) customerLng = ln;
    } catch {
      /* ignore */
    }
  }

  const svcCtx = await loadDeliveryServiceabilityRuntimeContext(sb as SupabaseClient);
  const annotated = mergedStoresRaw.map((s) => {
    const svc = evaluateStoreDeliveryServiceability({
      ctx: svcCtx,
      storeId: s.id,
      customerLat,
      customerLng,
      storeLat: s.lat,
      storeLng: s.lng,
    });
    const outOfRange =
      svc.applies && (svc.reason === "out_of_range" || svc.reason === "missing_store_coords");
    return {
      ...s,
      distanceKm: svc.distanceKm,
      distanceOutOfRange: outOfRange,
      maxDeliveryDistanceKm: svc.applies ? svc.maxKm : null,
      distancePolicyApplied: svc.applies,
      _svcRank: serviceabilityDeprioritizeRank(svc),
    };
  });
  annotated.sort((a, b) => a._svcRank - b._svcRank);
  const mergedStores: DeliverySearchStoreResult[] = annotated.map(({ _svcRank: _, ...rest }) => rest);

  const menus: DeliverySearchMenuResult[] = [];
  const storeMetaById = new Map<string, { slug: string; store_name: string; out?: boolean }>();
  for (const [id, row] of deliveryStoreById) {
    storeMetaById.set(id, { slug: row.slug, store_name: row.store_name });
  }
  for (const s of mergedStores) {
    storeMetaById.set(s.id, {
      slug: s.slug,
      store_name: s.store_name,
      out: s.distanceOutOfRange === true,
    });
  }
  for (const p of prodsRaw) {
    if (menus.length >= menuLimit) break;
    const id = String(p.id ?? "");
    const store_id = String(p.store_id ?? "");
    const meta = storeMetaById.get(store_id);
    if (!id || !store_id || !meta) continue;
    /** Out-of-range stores: keep store in list with badge, but do not surface orderable menus. */
    if (meta.out) continue;
    const price = Number(p.price);
    const discount_price = p.discount_price != null ? Number(p.discount_price) : null;
    menus.push({
      id,
      store_id,
      store_slug: meta.slug,
      store_name: meta.store_name,
      title: String(p.title ?? ""),
      summary: p.summary != null ? String(p.summary) : null,
      price: Number.isFinite(price) ? price : 0,
      discount_price: discount_price != null && Number.isFinite(discount_price) ? discount_price : null,
      thumbnail_url: p.thumbnail_url != null ? String(p.thumbnail_url) : null,
    });
  }
  console.log("[delivery-search-debug] final menus count", menus.length);

  const result_count = mergedStores.length + menus.length;
  const debug: DeliverySearchDebug | undefined =
    process.env.NODE_ENV !== "production" && result_count === 0
      ? {
          keyword,
          storeTable: "stores",
          menuTable: "store_products",
          storeConditions: ["approval_status=approved", "is_visible=true", "delivery_available=true"],
          menuConditions: ["product_status=active", "local_delivery_available=true"],
          matchedStoresCount: mergedStores.length,
          rawMatchedProductsCount: prodsRaw.length,
          deliveryStoreIdsCount: deliveryStoreById.size,
          finalMenusCount: menus.length,
        }
      : undefined;

  return { ok: true, stores: mergedStores, menus, result_count, debug };
}

