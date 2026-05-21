import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  canOwnerSellProducts,
  getStoreIfOwner,
} from "@/lib/stores/owner-product-gate";
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
import { invalidateOwnerProductsListCache } from "@/lib/stores/owner-products-list-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadProductForOwner(
  sb: ReturnType<typeof tryGetSupabaseForStores>,
  userId: string,
  storeId: string,
  productId: string
) {
  if (!sb) return { error: "no_sb" as const };
  const gate = await getStoreIfOwner(sb, userId, storeId);
  if (!gate.ok) return { error: "gate", gate };

  const { data: product, error } = await sb
    .from("store_products")
    .select(
      [
        "id, store_id, title, summary, price, discount_price, discount_percent, stock_qty, track_inventory",
        "thumbnail_url, thumbnail_width, thumbnail_height, images_json, product_status, pickup_available, local_delivery_available, shipping_available",
        "category_id, menu_section_id, item_type, is_featured, is_owner_recommended, is_representative, sort_order, options_json",
        "created_at, updated_at",
        "store_menu_sections ( id, name, sort_order )",
        "store_product_categories ( name, slug )",
      ].join(", ")
    )
    .eq("id", productId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (error || !product) {
    return { error: "not_found" as const };
  }
  return { product, store: gate.store };
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ storeId: string; productId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId, productId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const pid = typeof productId === "string" ? productId.trim() : "";
  if (!sid || !pid) {
    return NextResponse.json({ ok: false, error: "missing_param" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const res = await loadProductForOwner(sb, userId, sid, pid);
  if (res.error === "no_sb") {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  if (res.error === "gate" && res.gate) {
    return NextResponse.json({ ok: false, error: res.gate.error }, { status: res.gate.status });
  }
  if (res.error === "not_found") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, product: res.product });
}

type PatchBody = {
  title?: string;
  summary?: string | null;
  price?: number;
  discount_price?: number | null;
  discount_percent?: number | null;
  stock_qty?: number;
  track_inventory?: boolean;
  product_status?: string;
  pickup_available?: boolean;
  local_delivery_available?: boolean;
  shipping_available?: boolean;
  thumbnail_url?: string | null;
  /** 상세 슬라이드 URL 배열(대표와 중복 불가, 최대 5). null 이면 비움 */
  images_json?: unknown[] | null;
  thumbnail_width?: number | null;
  thumbnail_height?: number | null;
  category_id?: string | null;
  menu_section_id?: string | null;
  item_type?: string;
  /** 레거시 단일 토글 — 신규 클라는 `is_owner_recommended` / `is_representative` 사용 */
  is_featured?: boolean;
  is_owner_recommended?: boolean;
  is_representative?: boolean;
  sort_order?: number;
  options_json?: unknown[] | null;
};

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ storeId: string; productId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId, productId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const pid = typeof productId === "string" ? productId.trim() : "";
  if (!sid || !pid) {
    return NextResponse.json({ ok: false, error: "missing_param" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const uiLang = await loadUserAppLanguage(sb, userId, req.headers.get("accept-language"));

  const loaded = await loadProductForOwner(sb, userId, sid, pid);
  if (loaded.error === "no_sb") {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  if (loaded.error === "gate" && loaded.gate) {
    return NextResponse.json({ ok: false, error: loaded.gate.error }, { status: loaded.gate.status });
  }
  if (loaded.error === "not_found") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  if (!("store" in loaded) || !loaded.store) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!("product" in loaded) || !loaded.product) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const { store } = loaded;
  const productRow = loaded.product as unknown as Record<string, unknown>;

  if (store.approval_status !== "approved") {
    return NextResponse.json({ ok: false, error: "store_not_approved" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const t = String(body.title).trim();
    if (t.length < 1) {
      return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
    }
    patch.title = t;
  }
  if (body.summary !== undefined) patch.summary = body.summary ? String(body.summary).trim() : null;
  if (body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ ok: false, error: "invalid_price" }, { status: 400 });
    }
    patch.price = Math.floor(price);
  }
  if (body.discount_percent !== undefined) {
    let basePrice = body.price !== undefined ? Math.floor(Number(body.price)) : NaN;
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      const { data: curRow } = await sb
        .from("store_products")
        .select("price")
        .eq("id", pid)
        .eq("store_id", sid)
        .maybeSingle();
      basePrice = Math.floor(Number(curRow?.price));
    }
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      return NextResponse.json({ ok: false, error: "price_required_for_discount_percent" }, { status: 400 });
    }
    if (body.discount_percent === null) {
      patch.discount_percent = null;
      patch.discount_price = null;
    } else {
      const pct = Math.floor(Number(body.discount_percent));
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return NextResponse.json({ ok: false, error: "invalid_discount_percent" }, { status: 400 });
      }
      if (pct <= 0) {
        patch.discount_percent = null;
        patch.discount_price = null;
      } else {
        const dp = discountPriceFromPercent(basePrice, pct);
        if (dp == null) {
          return NextResponse.json({ ok: false, error: "invalid_discount_for_price" }, { status: 400 });
        }
        patch.discount_percent = pct;
        patch.discount_price = dp;
      }
    }
  } else if (body.discount_price !== undefined) {
    if (body.discount_price === null) {
      patch.discount_price = null;
      patch.discount_percent = null;
    } else {
      const d = Number(body.discount_price);
      if (!Number.isFinite(d) || d < 0) {
        return NextResponse.json({ ok: false, error: "invalid_discount" }, { status: 400 });
      }
      patch.discount_price = Math.floor(d);
      patch.discount_percent = null;
    }
  }
  if (body.stock_qty !== undefined) {
    const q = Number(body.stock_qty);
    if (!Number.isFinite(q) || q < 0) {
      return NextResponse.json({ ok: false, error: "invalid_stock" }, { status: 400 });
    }
    patch.stock_qty = Math.floor(q);
  }
  if (body.track_inventory !== undefined) {
    patch.track_inventory = !!body.track_inventory;
  }
  if (body.pickup_available !== undefined) patch.pickup_available = !!body.pickup_available;
  if (body.local_delivery_available !== undefined) {
    patch.local_delivery_available = !!body.local_delivery_available;
  }
  if (body.shipping_available !== undefined) patch.shipping_available = !!body.shipping_available;
  if (body.thumbnail_url !== undefined) {
    patch.thumbnail_url =
      body.thumbnail_url == null || body.thumbnail_url === ""
        ? null
        : String(body.thumbnail_url).trim();
  }

  if (body.thumbnail_width !== undefined || body.thumbnail_height !== undefined) {
    const dimParse = parseThumbnailDimensions(body.thumbnail_width, body.thumbnail_height);
    if (!dimParse.ok) {
      return NextResponse.json({ ok: false, error: dimParse.error }, { status: 400 });
    }
    if (dimParse.dims) {
      patch.thumbnail_width = dimParse.dims.width;
      patch.thumbnail_height = dimParse.dims.height;
    } else {
      patch.thumbnail_width = null;
      patch.thumbnail_height = null;
    }
  }

  if (body.images_json !== undefined) {
    const thumbForNorm =
      body.thumbnail_url !== undefined
        ? body.thumbnail_url == null || body.thumbnail_url === ""
          ? null
          : String(body.thumbnail_url).trim()
        : productRow.thumbnail_url != null && String(productRow.thumbnail_url).trim()
          ? String(productRow.thumbnail_url).trim()
          : null;
    const rawDetail = body.images_json === null ? [] : body.images_json;
    const norm = normalizeOwnerProductDetailImageUrls(rawDetail, thumbForNorm);
    if (!norm.ok) {
      return NextResponse.json(
        { ok: false, error: norm.error, message: norm.message },
        { status: 400 }
      );
    }
    patch.images_json = norm.urls;
  }

  if (body.category_id !== undefined) {
    if (body.category_id === null || body.category_id === "") {
      patch.category_id = null;
    } else {
      const cid = String(body.category_id).trim();
      const { data: cat } = await sb
        .from("store_product_categories")
        .select("id")
        .eq("id", cid)
        .eq("is_active", true)
        .maybeSingle();
      if (!cat) {
        return NextResponse.json({ ok: false, error: "invalid_category_id" }, { status: 400 });
      }
      patch.category_id = cid;
    }
  }

  if (body.menu_section_id !== undefined) {
    const { data: sectionRows, error: secListErr } = await sb
      .from("store_menu_sections")
      .select("id")
      .eq("store_id", sid);
    if (secListErr && /column|does not exist|schema cache/i.test(String(secListErr.message))) {
      return NextResponse.json({ ok: false, error: "migration_pending" }, { status: 503 });
    }
    const sectionIds = new Set(
      (sectionRows ?? []).map((r) => String((r as { id: string }).id))
    );
    const raw =
      body.menu_section_id === null || body.menu_section_id === ""
        ? ""
        : String(body.menu_section_id).trim();
    if (!raw) {
      if (sectionIds.size > 0) {
        return NextResponse.json({ ok: false, error: "menu_section_id_required" }, { status: 400 });
      }
      patch.menu_section_id = null;
    } else {
      if (!sectionIds.has(raw)) {
        return NextResponse.json({ ok: false, error: "invalid_menu_section_id" }, { status: 400 });
      }
      patch.menu_section_id = raw;
    }
  }

  if (body.item_type !== undefined) {
    const it = String(body.item_type).trim();
    if (!["product", "menu", "service"].includes(it)) {
      return NextResponse.json({ ok: false, error: "invalid_item_type" }, { status: 400 });
    }
    patch.item_type = it;
  }

  if (body.is_owner_recommended !== undefined) {
    patch.is_owner_recommended = !!body.is_owner_recommended;
  }
  if (body.is_representative !== undefined) {
    patch.is_representative = !!body.is_representative;
  }

  const legacyFeaturedOnly =
    body.is_featured !== undefined &&
    body.is_owner_recommended === undefined &&
    body.is_representative === undefined;
  if (legacyFeaturedOnly) {
    patch.is_owner_recommended = !!body.is_featured;
  }

  const shouldSyncFeatured =
    patch.is_owner_recommended !== undefined ||
    patch.is_representative !== undefined ||
    legacyFeaturedOnly;
  if (shouldSyncFeatured) {
    const effOwner =
      patch.is_owner_recommended !== undefined
        ? !!patch.is_owner_recommended
        : typeof productRow.is_owner_recommended === "boolean"
          ? !!productRow.is_owner_recommended
          : productRow.is_featured === true;
    const effRep =
      patch.is_representative !== undefined
        ? !!patch.is_representative
        : productRow.is_representative === true;
    patch.is_featured = effOwner || effRep;
  } else if (body.is_featured !== undefined) {
    patch.is_featured = !!body.is_featured;
  }

  if (body.sort_order !== undefined) {
    const q = Number(body.sort_order);
    if (!Number.isFinite(q)) {
      return NextResponse.json({ ok: false, error: "invalid_sort_order" }, { status: 400 });
    }
    patch.sort_order = Math.max(0, Math.min(9999, Math.floor(q)));
  }

  if (body.product_status !== undefined) {
    const next = String(body.product_status).trim();
    const allowed = ["draft", "active", "hidden", "sold_out", "deleted"];
    if (!allowed.includes(next)) {
      return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
    }
    if (next === "active" && !(await canOwnerSellProducts(sb, sid))) {
      return NextResponse.json({ ok: false, error: "sales_not_approved" }, { status: 403 });
    }
    patch.product_status = next;
  }

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
    patch.options_json = optCheck.value;
  }

  const prevOwnerRec =
    typeof productRow.is_owner_recommended === "boolean"
      ? !!productRow.is_owner_recommended
      : productRow.is_featured === true;
  const nextOwnerRec =
    patch.is_owner_recommended !== undefined
      ? !!patch.is_owner_recommended
      : prevOwnerRec;

  if (nextOwnerRec && !prevOwnerRec) {
    const cnt = await countOwnerRecommendedProducts(sb, sid, pid);
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

  const mergedThumb =
    body.thumbnail_url !== undefined
      ? body.thumbnail_url == null || body.thumbnail_url === ""
        ? null
        : String(body.thumbnail_url).trim()
      : productRow.thumbnail_url != null && String(productRow.thumbnail_url).trim()
        ? String(productRow.thumbnail_url).trim()
        : null;
  const touchesImageFields = body.thumbnail_url !== undefined || body.images_json !== undefined;
  if (touchesImageFields && !mergedThumb) {
    return NextResponse.json({ ok: false, error: "thumbnail_required" }, { status: 400 });
  }
  if (body.product_status === "active" && !mergedThumb) {
    return NextResponse.json({ ok: false, error: "thumbnail_required" }, { status: 400 });
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "empty_patch" }, { status: 400 });
  }

  const { error: upErr } = await sb.from("store_products").update(patch).eq("id", pid).eq("store_id", sid);

  if (upErr) {
    console.error("[PATCH product]", upErr);
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  invalidateOwnerProductsListCache(sid);

  return NextResponse.json({ ok: true });
}
