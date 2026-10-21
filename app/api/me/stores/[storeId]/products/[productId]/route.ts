import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  canOwnerSellProducts,
  getStoreIfOwner,
  type StoreGateRow,
} from "@/lib/stores/owner-product-gate";
import {
  guardOwnerCatalogWrite,
  ownerCatalogDbErrorResponse,
} from "@/lib/stores/owner-catalog-write-guard";
import { validateOwnerProductFields } from "@/lib/stores/owner-product-field-limits";
import {
  OWNER_PRODUCT_AUTO_SOLD_OUT_PATCH,
  shouldAutoSoldOutOnOwnerSave,
} from "@/lib/stores/owner-product-auto-sold-out";
import { filterStoreOwnedImageUrls } from "@/lib/stores/store-owned-image-urls";
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
import { invalidateStoreMenusSnapshotCacheByStoreId } from "@/lib/stores/store-menus-snapshot-invalidate-by-store-id";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";
import {
  isMissingStoreProductLockColumnError,
  ownerProductStatusChangeBlock,
  ownerSoldOutReasonForStatus,
  stripStoreProductLockColumns,
} from "@/lib/stores/store-product-admin-lock";
import {
  isDirectDiscountPriceValid,
  reconcileDiscountForNewPrice,
} from "@/lib/stores/store-product-discount-reconcile";
import {
  collectCanonicalImagePublicUrls,
  diffRemovedImageUrls,
  removeCanonicalImagesFromPublicUrls,
} from "@/lib/media/canonical-image-lifecycle.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadProductForOwner(
  sb: ReturnType<typeof tryGetSupabaseForStores>,
  userId: string,
  storeId: string,
  productId: string,
  /** PATCH — `guardOwnerCatalogWrite` 가 이미 소유를 확인한 매장 행 (중복 조회 생략) */
  verifiedStore?: StoreGateRow
) {
  if (!sb) return { error: "no_sb" as const };
  const gate = verifiedStore
    ? ({ ok: true as const, store: verifiedStore })
    : await getStoreIfOwner(sb, userId, storeId);
  if (!gate.ok) return { error: "gate", gate };

  const baseCols = [
    "id, store_id, title, summary, price, discount_price, discount_percent, stock_qty, track_inventory",
    "thumbnail_url, thumbnail_width, thumbnail_height, images_json, product_status, pickup_available, local_delivery_available, shipping_available",
    "category_id, menu_section_id, item_type, is_featured, is_owner_recommended, is_representative, sort_order, options_json",
    "admin_review_status, admin_review_memo",
    "created_at, updated_at",
    "store_menu_sections ( id, name, sort_order )",
    "store_product_categories ( name, slug )",
  ];
  const selectProduct = (cols: string[]) =>
    sb
      .from("store_products")
      .select(cols.join(", "))
      .eq("id", productId)
      .eq("store_id", storeId)
      .maybeSingle();

  // ND-1 · PRD-06 컬럼(마이그레이션 20270602130000) — 미적용 DB 면 레거시 select 로 폴백.
  let lockColumnsAvailable = true;
  let res = await selectProduct([...baseCols, "admin_status_lock, sold_out_reason"]);
  if (res.error && isMissingStoreProductLockColumnError(res.error)) {
    lockColumnsAvailable = false;
    res = await selectProduct(baseCols);
  }
  const { data: product, error } = res;

  if (error || !product) {
    return { error: "not_found" as const };
  }
  return { product, store: gate.store, lockColumnsAvailable };
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
  /**
   * PRD-07 — 편집 폼이 로드한 행의 `updated_at`. 있으면 조건부 UPDATE 로, 그 사이 주문 재고 감산·
   * 관리자 조치 등으로 행이 바뀌었으면 409 `product_changed`(+최신 행). 퀵 토글은 생략 가능(기존 동작).
   */
  expected_updated_at?: string | null;
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
  // PRD-15 — 세션 · 소유 · 1-B 운영 게이트 (POST 와 같은 가드). 정지 매장은 403 store_suspended.
  const guard = await guardOwnerCatalogWrite(sb, userId, sid);
  if (!guard.ok) return guard.response;
  const uiLang = await loadUserAppLanguage(sb, userId, req.headers.get("accept-language"));

  const loaded = await loadProductForOwner(sb, userId, sid, pid, guard.store);
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

  const productRow = loaded.product as unknown as Record<string, unknown>;
  const lockColumnsAvailable = loaded.lockColumnsAvailable !== false;

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
    // PRD-04 — 할인 필드 없이 가격만 바뀌면 현재 할인율로 할인가 재계산 (CHECK discount < price 정합).
    if (
      body.discount_percent === undefined &&
      body.discount_price === undefined &&
      patch.price !== Math.floor(Number(productRow.price))
    ) {
      const discount = reconcileDiscountForNewPrice(patch.price as number, productRow);
      patch.discount_price = discount.discount_price;
      patch.discount_percent = discount.discount_percent;
    }
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
      // PRD-04 — 직접 입력 할인가는 정가보다 작아야 한다.
      const basePrice =
        patch.price !== undefined ? Number(patch.price) : Math.floor(Number(productRow.price));
      if (!isDirectDiscountPriceValid(basePrice, d)) {
        return NextResponse.json(
          {
            ok: false,
            error: "invalid_discount_price",
            message: "할인가는 판매가보다 낮아야 합니다.",
          },
          { status: 400 }
        );
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
    // 같은 상태 재전송은 변경이 아니다 (폼 전체 저장 호환) — 게이트·사유 갱신 생략.
    if (next !== String(productRow.product_status ?? "")) {
      if (next === "active" && !(await canOwnerSellProducts(sb, sid))) {
        return NextResponse.json({ ok: false, error: "sales_not_approved" }, { status: 403 });
      }
      // ND-1 관리자 잠금 · 관리자 차단 · DEF-65/PRD-03 검수 반려·재검수 대기 → 관리자만 해제.
      const statusBlock = ownerProductStatusChangeBlock(productRow, next);
      if (statusBlock) {
        return NextResponse.json(
          { ok: false, error: statusBlock.error, message: statusBlock.message },
          { status: statusBlock.status }
        );
      }
      patch.product_status = next;
      // PRD-06 — 오너 수동 품절 = manual (취소 재고 복원이 자동 해제하지 않음), 그 외 상태 = NULL.
      patch.sold_out_reason = ownerSoldOutReasonForStatus(next);
    }
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

  // PRD-15 — 입력 상한: 값이 실제로 바뀐 필드만 검사 (기존 초과 값은 수정 저장 시에만 — 보존 계약).
  const changedOnly = <T,>(key: string, v: T): T | undefined =>
    key in patch && patch[key] !== productRow[key] ? v : undefined;
  const limits = validateOwnerProductFields(
    {
      title: changedOnly("title", patch.title as string | undefined),
      summary: changedOnly("summary", (patch.summary as string | null | undefined) ?? undefined),
      price: changedOnly("price", patch.price as number | undefined),
      stock_qty: changedOnly("stock_qty", patch.stock_qty as number | undefined),
    },
    uiLang
  );
  if (!limits.ok) {
    return NextResponse.json({ ok: false, error: limits.error, message: limits.message }, { status: 400 });
  }

  // PRD-10 — 저장 결과가 「재고 추적 · 재고 0 · 판매중」 이면 품절(stock) 로 저장하고 오너에게 안내.
  const auto_sold_out = shouldAutoSoldOutOnOwnerSave(productRow, patch);
  if (auto_sold_out) {
    patch.product_status = OWNER_PRODUCT_AUTO_SOLD_OUT_PATCH.product_status;
    patch.sold_out_reason = OWNER_PRODUCT_AUTO_SOLD_OUT_PATCH.sold_out_reason;
  }

  // 반려 상품 내용을 고치면 재검수 요청 상태로 전환 (관리자가 「검수 승인」하면 판매 재개 가능).
  const REVIEW_CONTENT_FIELDS = ["title", "summary", "price", "discount_percent", "discount_price", "thumbnail_url", "images_json", "options_json", "description_html"];
  if (
    String(productRow.admin_review_status ?? "") === "rejected" &&
    REVIEW_CONTENT_FIELDS.some((f) => f in patch)
  ) {
    patch.admin_review_status = "pending";
  }

  const writePatch = lockColumnsAvailable ? patch : stripStoreProductLockColumns(patch);

  // PRD-07 — 낙관적 잠금: 폼이 로드한 updated_at 과 다르면(주문 감산·관리자 조치 등) 덮어쓰지 않는다.
  const expectedUpdatedAt =
    typeof body.expected_updated_at === "string" && body.expected_updated_at.trim()
      ? body.expected_updated_at.trim()
      : null;
  let uq = sb.from("store_products").update(writePatch).eq("id", pid).eq("store_id", sid);
  if (expectedUpdatedAt) uq = uq.eq("updated_at", expectedUpdatedAt);
  const { data: updatedRows, error: upErr } = await uq.select("id, updated_at");

  if (upErr) {
    if (/store_products_discount_lt_price/.test(String(upErr.message))) {
      return NextResponse.json(
        { ok: false, error: "invalid_discount_price", message: "할인가는 판매가보다 낮아야 합니다." },
        { status: 400 }
      );
    }
    return ownerCatalogDbErrorResponse("[PATCH product]", upErr);
  }
  if (!updatedRows || updatedRows.length === 0) {
    if (expectedUpdatedAt) {
      const latest = await loadProductForOwner(sb, userId, sid, pid);
      return NextResponse.json(
        {
          ok: false,
          error: "product_changed",
          message: "다른 곳에서 상품이 변경되었습니다. 새로 불러온 뒤 다시 저장해 주세요.",
          product: "product" in latest ? latest.product : null,
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const nextUpdatedAt = (updatedRows[0] as { updated_at?: string }).updated_at ?? null;

  if (touchesImageFields) {
    const beforeUrls: (string | null | undefined)[] = [
      typeof productRow.thumbnail_url === "string" ? productRow.thumbnail_url : null,
      ...(Array.isArray(productRow.images_json)
        ? (productRow.images_json as string[])
        : []),
    ];
    const afterUrls: (string | null | undefined)[] = [
      mergedThumb,
      ...(patch.images_json !== undefined && Array.isArray(patch.images_json)
        ? (patch.images_json as string[])
        : Array.isArray(productRow.images_json)
          ? (productRow.images_json as string[])
          : []),
    ];
    const removed = filterStoreOwnedImageUrls(sid, diffRemovedImageUrls(beforeUrls, afterUrls));
    if (removed.length > 0) {
      const removal = await removeCanonicalImagesFromPublicUrls({
        sb,
        urls: removed,
        context: "owner/product/replace-image",
      });
      if (removal.failed.length > 0) {
        console.error("[PATCH product] storage cleanup partial failure", removal.failed);
      }
    }
  }

  invalidateOwnerProductsListCache(sid);
  invalidateStoreMenusSnapshotCacheByStoreId(sid);
  // OPS-02 — 인스턴스 공통 공개 캐시 세대 (관리자 쓰기와 같은 DEF-64 계약)
  bumpStorePublicSharedCacheGeneration("owner_store.product_update");

  return NextResponse.json({
    ok: true,
    updated_at: nextUpdatedAt,
    ...(auto_sold_out ? { auto_sold_out: true } : {}),
  });
}
