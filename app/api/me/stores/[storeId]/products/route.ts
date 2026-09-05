import { NextRequest, NextResponse } from "next/server";
import { readActiveSessionIdCookie } from "@/lib/auth/active-session";
import { peekAuthSessionValidateCached } from "@/lib/auth/auth-session-validate-cache";
import { validateActiveSessionLightDeduped } from "@/lib/auth/auth-session-validate-dedupe";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  canOwnerSellProducts,
  getStoreIfOwner,
} from "@/lib/stores/owner-product-gate";
import {
  getCachedStoreIfOwner,
  peekOwnerStoreOwnershipCacheHit,
} from "@/lib/stores/owner-store-ownership-cache";
import { parseProductOptionsJsonField } from "@/lib/stores/parse-product-options-json";
import { loadUserAppLanguage } from "@/lib/i18n/load-user-app-language";
import { validateOwnerOptionsJsonPayload } from "@/lib/stores/owner-product-options-validate";
import { discountPriceFromPercent } from "@/lib/stores/store-product-pricing";
import {
  normalizeOwnerProductDetailImageUrls,
  parseThumbnailDimensions,
} from "@/lib/stores/owner-product-images";
import {
  countOwnerRecommendedProducts,
  OWNER_RECOMMENDED_MENU_MAX,
} from "@/lib/stores/owner-recommended-menu-limit";
import {
  invalidateOwnerProductsListCache,
  loadOwnerProductsListSnapshot,
  parseOwnerProductsListLimit,
  peekOwnerProductsListCacheHit,
} from "@/lib/stores/owner-products-list-snapshot";
import { invalidateStoreMenusSnapshotCacheByStoreId } from "@/lib/stores/store-menus-snapshot-invalidate-by-store-id";
import {
  jsonPayloadKb,
  logOwnerProductsPerf,
  perfNowMs,
} from "@/lib/stores/owner-products-perf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const wall0 = perfNowMs();
  const tAuth0 = perfNowMs();
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sessionFp = ((await readActiveSessionIdCookie()) ?? "").trim() || "∅";
  const auth_cache_hit_before: 0 | 1 = peekAuthSessionValidateCached(userId, sessionFp) ? 1 : 0;
  const validated = await validateActiveSessionLightDeduped(userId, sessionFp);
  const auth_ms = Math.round(perfNowMs() - tAuth0);
  const auth_cache_hit: 0 | 1 =
    auth_cache_hit_before || validated.ttlCacheHit ? 1 : 0;
  if (!validated.ok) return validated.response;

  const { storeId } = await context.params;
  const id = typeof storeId === "string" ? storeId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  const supabase = tryGetSupabaseForStores();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const menuSectionId = req.nextUrl.searchParams.get("menu_section_id")?.trim() ?? "";
  const sectionFilter = menuSectionId.length >= 8 ? menuSectionId : "";
  const limit = parseOwnerProductsListLimit(req.nextUrl.searchParams.get("limit"));
  const cursor = req.nextUrl.searchParams.get("cursor")?.trim() ?? "";
  const skipListCache = sectionFilter.length > 0 || limit != null || cursor.length > 0;

  const tCacheLookup0 = perfNowMs();
  const products_list_cache_hit_before: 0 | 1 =
    skipListCache ? 0 : peekOwnerProductsListCacheHit(id) ? 1 : 0;
  const ownership_cache_hit_before: 0 | 1 = peekOwnerStoreOwnershipCacheHit(userId, id) ? 1 : 0;
  const cache_lookup_ms = Math.round(perfNowMs() - tCacheLookup0);

  const tOwn0 = perfNowMs();
  const gate = await getCachedStoreIfOwner(supabase, userId, id);
  const ownership_ms = Math.round(perfNowMs() - tOwn0);
  const ownership_cache_hit: 0 | 1 = ownership_cache_hit_before ? 1 : 0;
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const loaded = await loadOwnerProductsListSnapshot(supabase as import("@supabase/supabase-js").SupabaseClient<any>, id, {
    sectionFilter,
    limit,
    cursor: cursor || undefined,
    skipCache: skipListCache,
  });

  if (!loaded.ok) {
    console.error("[GET products]", loaded.error);
    return NextResponse.json({ ok: false, error: loaded.error }, { status: 500 });
  }

  const { snapshot } = loaded;
  const products_list_cache_hit: 0 | 1 = snapshot.cache_hit;
  const sections_cache_hit: 0 | 1 = products_list_cache_hit;
  const categories_cache_hit: 0 | 1 = products_list_cache_hit;
  const early_return_from_cache: 0 | 1 =
    auth_cache_hit === 1 && ownership_cache_hit === 1 && products_list_cache_hit === 1 ? 1 : 0;

  let actual_db_queries_count = 0;
  if (!auth_cache_hit) actual_db_queries_count += 2;
  if (!ownership_cache_hit) actual_db_queries_count += 1;
  if (!products_list_cache_hit) {
    actual_db_queries_count += 1;
    if (snapshot.timing.categories_query_ms > 0) actual_db_queries_count += 1;
    if (snapshot.timing.sections_query_ms > 0) actual_db_queries_count += 1;
  }

  const body = { ok: true as const, products: snapshot.products };
  const tSer0 = perfNowMs();
  const res = NextResponse.json(body);
  const serialization_ms = Math.round(perfNowMs() - tSer0);

  logOwnerProductsPerf({
    route: "owner_products_get",
    auth_ms,
    ownership_ms,
    products_query_ms: snapshot.timing.products_query_ms,
    categories_query_ms: snapshot.timing.categories_query_ms,
    sections_query_ms: snapshot.timing.sections_query_ms,
    payload_kb: jsonPayloadKb(body),
    product_count: snapshot.products.length,
    options_embed: snapshot.options_embed,
    images_embed: snapshot.images_embed,
    sort_ms: snapshot.timing.sort_ms,
    serialization_ms,
    total_ms: Math.round(perfNowMs() - wall0),
    cache_hit: products_list_cache_hit,
    singleflight_hit: snapshot.singleflight_hit,
    auth_cache_hit,
    ownership_cache_hit,
    products_list_cache_hit,
    sections_cache_hit,
    categories_cache_hit,
    early_return_from_cache,
    actual_db_queries_count,
    cache_lookup_ms,
  });

  return res;
}

type CreateBody = {
  title?: string;
  summary?: string;
  price?: number;
  discount_price?: number | null;
  stock_qty?: number;
  product_status?: string;
  pickup_available?: boolean;
  local_delivery_available?: boolean;
  shipping_available?: boolean;
  thumbnail_url?: string | null;
  category_id?: string | null;
  menu_section_id?: string | null;
  item_type?: string;
  is_featured?: boolean;
  is_owner_recommended?: boolean;
  is_representative?: boolean;
  sort_order?: number;
  options_json?: unknown[] | null;
  /** 상세 슬라이드 전용 URL 배열(대표 thumbnail_url 과 중복 불가, 최대 5) */
  images_json?: unknown[] | null;
  thumbnail_width?: number | null;
  thumbnail_height?: number | null;
  /** 0 또는 생략: 할인 없음. 1–100: 할인가 자동 계산 */
  discount_percent?: number | null;
  track_inventory?: boolean;
};

/** 매장 승인 필수. `active` 상품은 판매 승인 필수, `draft`는 판매 승인 없이 생성 가능 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(userId);
  if (!phone.ok) return phone.response;
  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  const supabase = tryGetSupabaseForStores();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const uiLang = await loadUserAppLanguage(supabase, userId, req.headers.get("accept-language"));

  const gate = await getStoreIfOwner(supabase, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }
  if (gate.store.approval_status !== "approved") {
    return NextResponse.json({ ok: false, error: "store_not_approved" }, { status: 400 });
  }

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  if (title.length < 1) {
    return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  }

  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ ok: false, error: "invalid_price" }, { status: 400 });
  }

  const stockQty = Number(body.stock_qty ?? 0);
  const stock = Number.isFinite(stockQty) && stockQty >= 0 ? Math.floor(stockQty) : 0;

  const priceFloored = Math.floor(price);
  let discount_percent: number | null = null;
  let discount: number | null = null;
  if (body.discount_percent !== undefined) {
    if (body.discount_percent === null) {
      discount_percent = null;
      discount = null;
    } else {
      const pct = Math.floor(Number(body.discount_percent));
      if (Number.isFinite(pct) && pct > 0 && pct <= 100) {
        discount_percent = pct;
        discount = discountPriceFromPercent(priceFloored, pct);
      } else {
        discount_percent = null;
        discount = null;
      }
    }
  } else if (body.discount_price != null && typeof body.discount_price === "number") {
    const d = Number(body.discount_price);
    if (Number.isFinite(d) && d >= 0) discount = Math.floor(d);
  }

  /** 생략 시 재고 미관리(무제한) */
  const track_inventory = body.track_inventory === true;

  const statusRaw = body.product_status !== undefined ? String(body.product_status).trim() : "hidden";
  /** Align with PATCH / Owner form: create may set sold_out (no silent coerce to hidden). */
  const product_status = ["draft", "active", "hidden", "sold_out"].includes(statusRaw)
    ? statusRaw
    : "hidden";

  if (
    product_status === "active" &&
    !(await canOwnerSellProducts(supabase, sid))
  ) {
    return NextResponse.json({ ok: false, error: "sales_not_approved" }, { status: 403 });
  }

  let category_id: string | null = null;
  if (body.category_id != null) {
    const cid = String(body.category_id).trim();
    if (cid) {
      const { data: cat } = await supabase
        .from("store_product_categories")
        .select("id")
        .eq("id", cid)
        .eq("is_active", true)
        .maybeSingle();
      if (!cat) {
        return NextResponse.json({ ok: false, error: "invalid_category_id" }, { status: 400 });
      }
      category_id = cid;
    }
  }

  const rawMenuSection =
    body.menu_section_id !== undefined && body.menu_section_id !== null
      ? String(body.menu_section_id).trim()
      : "";
  const menu_section_id: string | null = rawMenuSection ? rawMenuSection : null;

  const { data: storeMenuSectionRows, error: storeMenuSecErr } = await supabase
    .from("store_menu_sections")
    .select("id")
    .eq("store_id", sid);

  if (
    storeMenuSecErr &&
    /column|does not exist|schema cache/i.test(String(storeMenuSecErr.message))
  ) {
    return NextResponse.json({ ok: false, error: "migration_pending" }, { status: 503 });
  }

  const storeMenuSectionIds = new Set(
    (storeMenuSectionRows ?? []).map((r) => String((r as { id: string }).id))
  );

  if (storeMenuSectionIds.size === 0) {
    return NextResponse.json({ ok: false, error: "menu_sections_required" }, { status: 400 });
  }
  if (!menu_section_id) {
    return NextResponse.json({ ok: false, error: "menu_section_id_required" }, { status: 400 });
  }
  if (!storeMenuSectionIds.has(menu_section_id)) {
    return NextResponse.json({ ok: false, error: "invalid_menu_section_id" }, { status: 400 });
  }

  const itemRaw = String(body.item_type ?? "product").trim();
  const item_type = ["product", "menu", "service"].includes(itemRaw) ? itemRaw : "product";
  const sortRaw = Number(body.sort_order ?? 0);
  const sort_order = Number.isFinite(sortRaw) ? Math.max(0, Math.min(9999, Math.floor(sortRaw))) : 0;

  let options_json: unknown[] = [];
  if (body.options_json !== undefined) {
    const parsed = parseProductOptionsJsonField(body.options_json);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: "invalid_options_json" }, { status: 400 });
    }
    const optCheck = validateOwnerOptionsJsonPayload(parsed.value, uiLang);
    if (!optCheck.ok) {
      return NextResponse.json(
        { ok: false, error: optCheck.error, message: optCheck.message },
        { status: 400 }
      );
    }
    options_json = optCheck.value;
  }

  const thumbStr = body.thumbnail_url != null ? String(body.thumbnail_url).trim() : "";
  if (!thumbStr) {
    return NextResponse.json({ ok: false, error: "thumbnail_required" }, { status: 400 });
  }

  const detailNorm = normalizeOwnerProductDetailImageUrls(
    body.images_json === undefined ? [] : body.images_json,
    thumbStr
  );
  if (!detailNorm.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: detailNorm.error,
        message: detailNorm.message,
      },
      { status: 400 }
    );
  }

  const dimParse = parseThumbnailDimensions(body.thumbnail_width, body.thumbnail_height);
  if (!dimParse.ok) {
    return NextResponse.json({ ok: false, error: dimParse.error }, { status: 400 });
  }

  const hasNewMenuFlags =
    body.is_owner_recommended !== undefined || body.is_representative !== undefined;
  const ownerRec = hasNewMenuFlags ? !!body.is_owner_recommended : !!body.is_featured;
  const rep = hasNewMenuFlags ? !!body.is_representative : false;
  const is_featured = ownerRec || rep;

  if (ownerRec) {
    const cnt = await countOwnerRecommendedProducts(supabase, sid);
    if (cnt >= OWNER_RECOMMENDED_MENU_MAX) {
      return NextResponse.json(
        {
          ok: false,
          error: "owner_recommended_limit",
          message: "사장님 추천 메뉴는 최대 6개까지 지정할 수 있습니다.",
        },
        { status: 400 }
      );
    }
  }

  const row = {
    store_id: sid,
    title,
    summary: String(body.summary ?? "").trim() || null,
    description_html: null,
    price: priceFloored,
    discount_price: discount,
    discount_percent,
    stock_qty: stock,
    track_inventory,
    product_status,
    pickup_available: !!body.pickup_available,
    local_delivery_available: !!body.local_delivery_available,
    shipping_available: !!body.shipping_available,
    thumbnail_url: thumbStr,
    images_json: detailNorm.urls,
    thumbnail_width: dimParse.dims?.width ?? null,
    thumbnail_height: dimParse.dims?.height ?? null,
    category_id,
    menu_section_id,
    item_type,
    is_owner_recommended: ownerRec,
    is_representative: rep,
    is_featured,
    sort_order,
    options_json,
  };

  const { data: created, error: insErr } = await supabase
    .from("store_products")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (insErr) {
    console.error("[POST product]", insErr);
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  invalidateOwnerProductsListCache(sid);
  invalidateStoreMenusSnapshotCacheByStoreId(sid);

  return NextResponse.json({ ok: true, product: created });
}
