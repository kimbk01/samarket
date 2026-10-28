import "server-only";

/**
 * 매장 카탈로그(상품) 쓰기 코어 — 오너 라우트와 관리자 샘플 카탈로그 라우트가 같은 검증·저장을 쓴다.
 * (2026-10-28 배달 감사 §F S-5) 라우트는 게이트·행위자 정책·캐시 세대 bump 만 소유한다.
 * 이 파일은 오너 POST 본문 로직을 그대로 옮긴 것 — 응답 코드·메시지·DB 호출 순서 불변.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { canOwnerSellProducts } from "@/lib/stores/owner-product-gate";
import {
  parseOwnerProductClientRequestId,
  validateOwnerProductFields,
} from "@/lib/stores/owner-product-field-limits";
import {
  OWNER_PRODUCT_AUTO_SOLD_OUT_PATCH,
  shouldAutoSoldOutOnOwnerSave,
} from "@/lib/stores/owner-product-auto-sold-out";
import { parseProductOptionsJsonField } from "@/lib/stores/parse-product-options-json";
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
import { isDirectDiscountPriceValid } from "@/lib/stores/store-product-discount-reconcile";
import {
  catalogDbErrorOutcome,
  outcome,
  type CatalogOutcome,
  type StoreCatalogWritePolicy,
} from "@/lib/stores/catalog/store-catalog-write-policy";

export type CreateStoreProductBody = {
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
  /** PRD-15 — 폼 마운트 시 고정 생성한 멱등 키. 같은 키 재요청(더블탭·재시도)은 같은 상품을 돌려준다. */
  client_request_id?: string | null;
};

const CLIENT_REQUEST_ID_UNIQUE = "store_products_store_client_request_id_key";

function isMissingClientRequestIdColumn(err: { message?: unknown } | null | undefined): boolean {
  const msg = String(err?.message ?? "");
  return msg.includes("client_request_id") && /column|does not exist|schema cache|could not find/i.test(msg);
}


/** 상품 생성 — 2xx 이면 호출 라우트가 캐시 무효화·세대 bump 를 한다. */
export async function createStoreProduct(
  supabase: SupabaseClient,
  sid: string,
  body: CreateStoreProductBody,
  opts: { uiLang: AppLanguageCode; policy: StoreCatalogWritePolicy }
): Promise<CatalogOutcome & { autoSoldOut?: boolean }> {
  const { uiLang, policy } = opts;
  const title = String(body.title ?? "").trim();
  if (title.length < 1) {
    return outcome(400, { ok: false, error: "title_required" });
  }

  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0) {
    return outcome(400, { ok: false, error: "invalid_price" });
  }

  const stockQty = Number(body.stock_qty ?? 0);
  const stock = Number.isFinite(stockQty) && stockQty >= 0 ? Math.floor(stockQty) : 0;

  const limits = validateOwnerProductFields(
    {
      title,
      summary: body.summary != null ? String(body.summary) : null,
      price: Math.floor(price),
      stock_qty: stock,
    },
    uiLang
  );
  if (!limits.ok) {
    return outcome(400, { ok: false, error: limits.error, message: limits.message });
  }

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
    if (Number.isFinite(d) && d >= 0) {
      // PRD-04 — 직접 입력 할인가는 판매가보다 작아야 한다 (DB CHECK store_products_discount_lt_price).
      if (!isDirectDiscountPriceValid(priceFloored, d)) {
        return outcome(400, { ok: false, error: "invalid_discount_price", message: "할인가는 판매가보다 낮아야 합니다." });
      }
      discount = Math.floor(d);
    }
  }

  /** 생략 시 재고 미관리(무제한) */
  const track_inventory = body.track_inventory === true;

  const statusRaw = body.product_status !== undefined ? String(body.product_status).trim() : "hidden";
  /** Align with PATCH / Owner form: create may set sold_out (no silent coerce to hidden). */
  const requestedStatus = ["draft", "active", "hidden", "sold_out"].includes(statusRaw)
    ? statusRaw
    : "hidden";
  // PRD-10 — 재고 추적 + 재고 0 + 판매중 → 품절(stock). 판매 승인 게이트는 요청 상태(active) 기준 그대로.
  const auto_sold_out = shouldAutoSoldOutOnOwnerSave(null, {
    product_status: requestedStatus,
    track_inventory,
    stock_qty: stock,
  });
  const product_status = auto_sold_out ? OWNER_PRODUCT_AUTO_SOLD_OUT_PATCH.product_status : requestedStatus;

  if (
    requestedStatus === "active" &&
    policy.requireSalesPermissionForActive &&
    !(await canOwnerSellProducts(supabase, sid))
  ) {
    return outcome(403, { ok: false, error: "sales_not_approved" });
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
        return outcome(400, { ok: false, error: "invalid_category_id" });
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
    return outcome(503, { ok: false, error: "migration_pending" });
  }

  const storeMenuSectionIds = new Set(
    (storeMenuSectionRows ?? []).map((r) => String((r as { id: string }).id))
  );

  if (storeMenuSectionIds.size === 0) {
    return outcome(400, { ok: false, error: "menu_sections_required" });
  }
  if (!menu_section_id) {
    return outcome(400, { ok: false, error: "menu_section_id_required" });
  }
  if (!storeMenuSectionIds.has(menu_section_id)) {
    return outcome(400, { ok: false, error: "invalid_menu_section_id" });
  }

  const itemRaw = String(body.item_type ?? "product").trim();
  const item_type = ["product", "menu", "service"].includes(itemRaw) ? itemRaw : "product";
  const sortRaw = Number(body.sort_order ?? 0);
  const sort_order = Number.isFinite(sortRaw) ? Math.max(0, Math.min(9999, Math.floor(sortRaw))) : 0;

  let options_json: unknown[] = [];
  if (body.options_json !== undefined) {
    const parsed = parseProductOptionsJsonField(body.options_json);
    if (!parsed.ok) {
      return outcome(400, { ok: false, error: "invalid_options_json" });
    }
    const optCheck = validateOwnerOptionsJsonPayload(parsed.value, uiLang);
    if (!optCheck.ok) {
      return outcome(400, { ok: false, error: optCheck.error, message: optCheck.message });
    }
    options_json = optCheck.value;
  }

  const thumbStr = body.thumbnail_url != null ? String(body.thumbnail_url).trim() : "";
  if (!thumbStr) {
    return outcome(400, { ok: false, error: "thumbnail_required" });
  }

  const detailNorm = normalizeOwnerProductDetailImageUrls(
    body.images_json === undefined ? [] : body.images_json,
    thumbStr
  );
  if (!detailNorm.ok) {
    return outcome(400, {
        ok: false,
        error: detailNorm.error,
        message: detailNorm.message,
      });
  }

  const dimParse = parseThumbnailDimensions(body.thumbnail_width, body.thumbnail_height);
  if (!dimParse.ok) {
    return outcome(400, { ok: false, error: dimParse.error });
  }

  const hasNewMenuFlags =
    body.is_owner_recommended !== undefined || body.is_representative !== undefined;
  const ownerRec = hasNewMenuFlags ? !!body.is_owner_recommended : !!body.is_featured;
  const rep = hasNewMenuFlags ? !!body.is_representative : false;
  const is_featured = ownerRec || rep;

  if (ownerRec) {
    const cnt = await countOwnerRecommendedProducts(supabase, sid);
    if (cnt >= OWNER_RECOMMENDED_MENU_MAX) {
      return outcome(400, {
          ok: false,
          error: "owner_recommended_limit",
          message: "사장님 추천 메뉴는 최대 6개까지 지정할 수 있습니다.",
        });
    }
  }

  const client_request_id = parseOwnerProductClientRequestId(body.client_request_id);

  const row: Record<string, unknown> = {
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
  if (auto_sold_out) row.sold_out_reason = OWNER_PRODUCT_AUTO_SOLD_OUT_PATCH.sold_out_reason;
  if (client_request_id) row.client_request_id = client_request_id;

  const insertRow = (r: Record<string, unknown>) =>
    supabase.from("store_products").insert(r).select("id").maybeSingle();

  let { data: created, error: insErr } = await insertRow(row);
  if (insErr && isMissingClientRequestIdColumn(insErr)) {
    // 마이그레이션 2027060416 미적용 DB — 멱등 키 없이 기존 동작
    const { client_request_id: _omit, ...legacy } = row;
    void _omit;
    ({ data: created, error: insErr } = await insertRow(legacy));
  }

  if (insErr) {
    if (client_request_id && String(insErr.message ?? "").includes(CLIENT_REQUEST_ID_UNIQUE)) {
      // PRD-15 — 같은 폼 키 재요청(더블탭·네트워크 재시도): 이미 만든 상품을 돌려준다 (1행 보장).
      const { data: existing } = await supabase
        .from("store_products")
        .select("id")
        .eq("store_id", sid)
        .eq("client_request_id", client_request_id)
        .maybeSingle();
      if (existing) {
        return { ...outcome(200, { ok: true, product: existing, idempotent: true }), noWrite: true };
      }
    }
    return catalogDbErrorOutcome("[POST product]", insErr);
  }

  // PRD-15 — 추천 6개 상한: 사전 count 와 INSERT 사이 경합은 INSERT 후 재카운트로 되돌린다.
  if (ownerRec && created) {
    const after = await countOwnerRecommendedProducts(supabase, sid);
    if (after > OWNER_RECOMMENDED_MENU_MAX) {
      const createdId = String((created as { id: string }).id);
      const { error: rbErr } = await supabase
        .from("store_products")
        .delete()
        .eq("id", createdId)
        .eq("store_id", sid);
      if (rbErr) console.error("[POST product] recommended limit rollback", rbErr);
      return outcome(409, {
          ok: false,
          error: "owner_recommended_limit",
          message: "사장님 추천 메뉴는 최대 6개까지 지정할 수 있습니다.",
        });
    }
  }

  return { ...outcome(200, { ok: true, product: created, ...(auto_sold_out ? { auto_sold_out: true } : {}) }), autoSoldOut: auto_sold_out };
}
