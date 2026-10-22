import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModifierSelectionsWire } from "@/lib/stores/modifiers/types";
import {
  computeCartLineMergeKey,
  parseProductOptionsJson,
  validateLineModifiers,
  type OrderLineOptionsSnapshotV2,
} from "@/lib/stores/product-line-options";
import {
  parseCommerceExtrasFromHoursJson,
  resolveChargedDeliveryFeePhp,
} from "@/lib/stores/store-commerce-extras";
import { resolveStoreFrontOpen } from "@/lib/stores/store-auto-hours";
import { isStorePointCommerceBlocked } from "@/lib/stores/store-point-commerce-block";
import { canOwnerSellProducts } from "@/lib/stores/owner-product-gate";
import { resolveStoreOrderability } from "@/lib/stores/store-orderability-policy";
import { loadStoreCashPosition } from "@/lib/stores/commission/store-commission-writer";
import { STORE_CASH_INSUFFICIENT_ERROR } from "@/lib/stores/commission/store-commission-contract";
import { storeProductBuyerVisibilityBlocked } from "@/lib/stores/store-product-buyer-sellability";

export type StoreOrderLineInput = {
  product_id: string;
  qty: number;
  wire: ModifierSelectionsWire;
  line_note: string | null;
  /** 장바구니 스냅샷 단가 — 불일치 시 price_changed */
  client_unit_php?: number | null;
};

export type ValidatedStoreOrderLine = {
  product_id: string;
  title: string;
  unit: number;
  qty: number;
  subtotal: number;
  options_snapshot: OrderLineOptionsSnapshotV2;
  base_unit_after_discount: number;
  unit_options_delta: number;
};

export type ValidateStoreOrderCheckoutResult =
  | {
      ok: true;
      lines: ValidatedStoreOrderLine[];
      paymentTotal: number;
      deliveryFeeAmount: number;
      paymentGrandTotal: number;
      /** 검증 시 조회한 상품 — 재고 차감 재조회 생략 */
      productsById: Record<string, StoreOrderCheckoutProductRow>;
    }
  | {
      ok: false;
      error: string;
      status: number;
      min_order_php?: number;
      /** 줄 단위 오류일 때 원인 상품 id (CRT-02) */
      product_id?: string;
    };

type StoreRow = {
  id: string;
  owner_user_id: string;
  approval_status: string;
  is_visible: boolean;
  is_open: boolean | null;
  point_commerce_blocked?: boolean | null;
  business_hours_json: unknown;
  pickup_available?: boolean | null;
  delivery_available?: boolean | null;
};

export type ValidateStoreOrderCheckoutStoreRow = StoreRow;

export type StoreOrderCheckoutProductRow = {
  id: string;
  store_id: string;
  title: string;
  price: number;
  discount_price: number | null;
  stock_qty: number;
  track_inventory?: boolean;
  product_status: string;
  min_order_qty: number;
  max_order_qty: number;
  pickup_available: boolean;
  local_delivery_available: boolean;
  shipping_available: boolean;
  options_json: unknown;
  /** PRD-03 — 검수 반려·재검수 대기는 판매 불가 */
  admin_review_status?: string | null;
  /** PRD-05 — 숨김 구역 상품은 판매 불가 (embed) */
  store_menu_sections?: { is_hidden?: boolean | null } | { is_hidden?: boolean | null }[] | null;
};

/**
 * 줄 단위 상품 판매 가능 판정 — 주문 RPC Pass1 과 같은 순서·오류 코드.
 * 노출 게이트(검수·숨김 구역) → 품절 → active 아님.
 */
export function storeOrderLineProductError(
  p: Pick<StoreOrderCheckoutProductRow, "product_status" | "admin_review_status" | "store_menu_sections">
): "product_not_available" | "product_sold_out" | null {
  if (storeProductBuyerVisibilityBlocked(p)) return "product_not_available";
  if (p.product_status === "sold_out") return "product_sold_out";
  if (p.product_status !== "active") return "product_not_available";
  return null;
}

export function assertSingleStoreOnOrderItems(
  storeId: string,
  products: Pick<StoreOrderCheckoutProductRow, "id" | "store_id">[]
): { ok: true } | { ok: false; error: "mixed_store_cart" } {
  const sid = storeId.trim();
  const storeIds = new Set(
    products.map((p) => String(p.store_id ?? "").trim()).filter(Boolean)
  );
  if (storeIds.size > 1) {
    return { ok: false, error: "mixed_store_cart" };
  }
  if (storeIds.size === 1 && !storeIds.has(sid)) {
    return { ok: false, error: "mixed_store_cart" };
  }
  return { ok: true };
}

function productUnitPrice(p: StoreOrderCheckoutProductRow): number {
  const price = Number(p.price);
  const disc = p.discount_price != null ? Number(p.discount_price) : null;
  return disc != null && Number.isFinite(disc) && disc >= 0 && disc < price ? disc : price;
}

/** 주문 검증·장바구니 재검증 공통 상품 조회 — 같은 컬럼·embed */
const STORE_ORDER_CHECKOUT_PRODUCT_SELECT =
  "id, store_id, title, price, discount_price, stock_qty, track_inventory, product_status, min_order_qty, max_order_qty, pickup_available, local_delivery_available, shipping_available, options_json, admin_review_status, store_menu_sections ( is_hidden )";

async function loadStoreOrderCheckoutProducts(
  sb: SupabaseClient,
  productIds: string[]
): Promise<{ ok: true; rows: StoreOrderCheckoutProductRow[] } | { ok: false }> {
  const { data: products, error: pErr } = await sb
    .from("store_products")
    .select(STORE_ORDER_CHECKOUT_PRODUCT_SELECT)
    .in("id", productIds);
  if (pErr || !products) return { ok: false };
  return { ok: true, rows: products as StoreOrderCheckoutProductRow[] };
}

type StoreOrderCheckoutGateResult =
  | { ok: true; storeRow: StoreRow; storeDeliveryOn: boolean }
  | { ok: false; error: string; status: number };

/** 매장 단위 게이트 — 승인·본인 매장·판매 권한·영업·포인트·캐시·수령 방식 (주문 생성과 같은 순서) */
async function checkStoreOrderCheckoutStoreGate(params: {
  sb: SupabaseClient;
  buyerId: string;
  storeId: string;
  fulfillment: "pickup" | "local_delivery" | "shipping";
  store?: StoreRow | null;
}): Promise<StoreOrderCheckoutGateResult> {
  const { sb, storeId, fulfillment } = params;
  let storeRow = params.store ?? null;
  if (!storeRow) {
    const { data: store, error: sErr } = await sb
      .from("stores")
      .select(
        "id, owner_user_id, approval_status, is_visible, is_open, point_commerce_blocked, business_hours_json, pickup_available, delivery_available"
      )
      .eq("id", storeId)
      .maybeSingle();

    if (sErr || !store) {
      return { ok: false, error: "store_unavailable", status: 400 };
    }
    storeRow = store as StoreRow;
  }

  if (storeRow.approval_status !== "approved" || !storeRow.is_visible) {
    return { ok: false, error: "store_unavailable", status: 400 };
  }

  // Same SSOT as UI `can_order_store` — enforce for all creates (coupon and no-coupon).
  const orderability = await resolveStoreOrderability(
    sb,
    params.buyerId,
    storeRow.owner_user_id
  );
  if (!orderability.can_order_store) {
    return { ok: false, error: "owner_self_order_denied", status: 403 };
  }

  if (!(await canOwnerSellProducts(sb, storeId))) {
    return { ok: false, error: "store_not_selling", status: 400 };
  }

  if (!resolveStoreFrontOpen(storeRow.business_hours_json, storeRow.is_open)) {
    return { ok: false, error: "store_closed", status: 400 };
  }

  if (isStorePointCommerceBlocked(storeRow)) {
    return { ok: false, error: "store_point_blocked", status: 400 };
  }

  // Early, friendly check — the authority is the DB trigger on store_orders INSERT.
  const cash = await loadStoreCashPosition(sb, storeId).catch(() => null);
  if (cash && !cash.orderable) {
    return { ok: false, error: STORE_CASH_INSUFFICIENT_ERROR, status: 409 };
  }

  const storePickupOff = storeRow.pickup_available === false;
  const storeDeliveryOn = storeRow.delivery_available === true;

  if (fulfillment === "pickup" && storePickupOff) {
    return { ok: false, error: "store_pickup_disabled", status: 400 };
  }
  if (fulfillment === "local_delivery" && !storeDeliveryOn) {
    return { ok: false, error: "store_delivery_disabled", status: 400 };
  }
  return { ok: true, storeRow, storeDeliveryOn };
}

export type StoreOrderLineEvaluation =
  | { ok: true; line: ValidatedStoreOrderLine }
  | {
      ok: false;
      error: string;
      /** 옵션 검증까지 통과해 서버 단가를 계산한 경우(price_changed 등) — 아니면 null */
      server_unit_php: number | null;
    };

/**
 * 줄 1개 판정 — 주문 생성(`validateStoreOrderCheckout`)과 장바구니 재검증이 같은 판정을 쓴다.
 * 순서: 상품 판매 가능 → 수량 → 재고 → 수령 방식 → 옵션 → 단가 → 장바구니 단가 대조.
 */
export function evaluateStoreOrderCheckoutLine(params: {
  product: StoreOrderCheckoutProductRow | undefined;
  line: StoreOrderLineInput;
  storeId: string;
  fulfillment: "pickup" | "local_delivery" | "shipping";
  storeDeliveryOn: boolean;
}): StoreOrderLineEvaluation {
  const { product: p, line, storeId, fulfillment, storeDeliveryOn } = params;
  const fail = (error: string, serverUnit: number | null = null): StoreOrderLineEvaluation => ({
    ok: false,
    error,
    server_unit_php: serverUnit,
  });
  if (!p || p.store_id !== storeId) {
    return fail("invalid_product");
  }
  const lineProductError = storeOrderLineProductError(p);
  if (lineProductError) {
    return fail(lineProductError);
  }

  const minQ = Math.max(1, Number(p.min_order_qty) || 1);
  const maxQ = Math.max(minQ, Number(p.max_order_qty) || 99);
  if (line.qty < minQ || line.qty > maxQ) {
    return fail("qty_out_of_range");
  }

  const trackStock = p.track_inventory === true;
  if (trackStock && line.qty > Number(p.stock_qty)) {
    return fail("insufficient_stock");
  }

  if (fulfillment === "pickup" && !p.pickup_available) {
    return fail("pickup_not_available");
  }
  if (fulfillment === "local_delivery" && !p.local_delivery_available && !storeDeliveryOn) {
    return fail("delivery_not_available");
  }
  if (fulfillment === "shipping" && !p.shipping_available) {
    return fail("shipping_not_available");
  }

  const baseUnit = productUnitPrice(p);
  const groups = parseProductOptionsJson(p.options_json);
  const optVal = validateLineModifiers(groups, line.wire, baseUnit);
  if (!optVal.ok) {
    return fail(optVal.error ?? "invalid_option");
  }

  const unit = baseUnit + optVal.unitDelta;
  if (!Number.isFinite(unit) || unit < 0) {
    return fail("invalid_unit_price");
  }

  if (line.client_unit_php == null || !Number.isFinite(line.client_unit_php)) {
    return fail("client_unit_php_required", unit);
  }
  if (Math.abs(unit - line.client_unit_php) >= 1) {
    return fail("price_changed", unit);
  }

  const subtotal = unit * line.qty;
  const options_snapshot: OrderLineOptionsSnapshotV2 =
    line.line_note != null && line.line_note.length > 0
      ? { ...optVal.snapshot, line_note: line.line_note }
      : optVal.snapshot;

  return {
    ok: true,
    line: {
      product_id: line.product_id,
      title: String(p.title),
      unit,
      qty: line.qty,
      subtotal,
      options_snapshot,
      base_unit_after_discount: options_snapshot.base_unit_after_discount,
      unit_options_delta: options_snapshot.unit_options_delta,
    },
  };
}

/**
 * POST /api/me/store-orders — 단일 store_id·상품·옵션·가격·최소주문(할인 후 상품합) 서버 최종 검증.
 */
export async function validateStoreOrderCheckout(params: {
  sb: SupabaseClient;
  buyerId: string;
  storeId: string;
  fulfillment: "pickup" | "local_delivery" | "shipping";
  items: StoreOrderLineInput[];
  store?: StoreRow | null;
}): Promise<ValidateStoreOrderCheckoutResult> {
  const { sb, storeId, fulfillment, items } = params;
  if (!storeId || items.length === 0) {
    return { ok: false, error: "store_and_items_required", status: 400 };
  }

  const lineKeys = items.map((x) =>
    computeCartLineMergeKey({
      storeId,
      productId: x.product_id,
      selections: x.wire,
      lineNote: x.line_note,
    })
  );
  if (new Set(lineKeys).size !== lineKeys.length) {
    return { ok: false, error: "duplicate_line_in_order", status: 400 };
  }

  const gate = await checkStoreOrderCheckoutStoreGate(params);
  if (!gate.ok) return gate;
  const { storeRow, storeDeliveryOn } = gate;

  const productIds = items.map((x) => x.product_id);
  const loaded = await loadStoreOrderCheckoutProducts(sb, productIds);
  if (!loaded.ok || !loaded.rows.length || loaded.rows.length !== productIds.length) {
    return { ok: false, error: "products_not_found", status: 400 };
  }

  const productRows = loaded.rows;
  const mixed = assertSingleStoreOnOrderItems(storeId, productRows);
  if (!mixed.ok) {
    return { ok: false, error: mixed.error, status: 400 };
  }

  const byId = Object.fromEntries(productRows.map((p) => [p.id, p]));
  let paymentTotal = 0;
  const lines: ValidatedStoreOrderLine[] = [];

  for (const line of items) {
    const evaluated = evaluateStoreOrderCheckoutLine({
      product: byId[line.product_id],
      line,
      storeId,
      fulfillment,
      storeDeliveryOn,
    });
    if (!evaluated.ok) {
      /** CRT-02 — 클라이언트가 원인 상품을 표시할 수 있게 product_id 동봉 */
      return { ok: false, error: evaluated.error, status: 400, product_id: line.product_id };
    }
    paymentTotal += evaluated.line.subtotal;
    lines.push(evaluated.line);
  }

  const commerceExtras = parseCommerceExtrasFromHoursJson(storeRow.business_hours_json);
  const minOrderPhp = commerceExtras.minOrderPhp;
  if (minOrderPhp != null && minOrderPhp > 0 && paymentTotal < minOrderPhp) {
    return { ok: false, error: "below_min_order", status: 400, min_order_php: minOrderPhp };
  }

  const deliveryFeeAmount = resolveChargedDeliveryFeePhp(commerceExtras, paymentTotal, fulfillment);
  const paymentGrandTotal = paymentTotal + deliveryFeeAmount;

  return {
    ok: true,
    lines,
    paymentTotal,
    deliveryFeeAmount,
    paymentGrandTotal,
    productsById: byId,
  };
}

export type StoreCartRevalidationLineInput = StoreOrderLineInput & {
  /** 클라이언트 장바구니 줄 id — 응답 매칭용(서버는 해석하지 않음) */
  line_id: string;
};

export type StoreCartRevalidationLineResult = {
  line_id: string;
  product_id: string;
  /** null = 이 줄은 현재 주문 가능 */
  error: string | null;
  /** 서버 기준 현재 단가(옵션 포함). 품절·판매 중지·수량 등으로 계산 전 중단되면 null */
  server_unit_php: number | null;
  /** 정가 기준 단가(옵션 포함) — 할인 표시용. 계산 불가면 null */
  server_list_unit_php: number | null;
};

export type RevalidateStoreCartLinesResult =
  | { ok: true; lines: StoreCartRevalidationLineResult[] }
  | { ok: false; error: string; status: number };

/**
 * CRT-02 — 장바구니 읽기 전용 재검증. 주문을 만들지 않고 주문 RPC 도 호출하지 않는다.
 * 매장 게이트·상품 조회·줄 판정은 `validateStoreOrderCheckout` 과 같은 함수를 쓴다.
 * 차이: 첫 오류에서 멈추지 않고 줄마다 결과를 돌려준다. 최소주문·배달비·쿠폰은 판정하지 않는다
 * (주문 생성 시 서버 SSOT 가 최종 판정).
 */
export async function revalidateStoreCartLines(params: {
  sb: SupabaseClient;
  buyerId: string;
  storeId: string;
  fulfillment: "pickup" | "local_delivery" | "shipping";
  items: StoreCartRevalidationLineInput[];
  store?: StoreRow | null;
}): Promise<RevalidateStoreCartLinesResult> {
  const { sb, storeId, fulfillment, items } = params;
  if (!storeId || items.length === 0) {
    return { ok: false, error: "store_and_items_required", status: 400 };
  }

  const gate = await checkStoreOrderCheckoutStoreGate(params);
  if (!gate.ok) return gate;

  const productIds = [...new Set(items.map((x) => x.product_id))];
  const loaded = await loadStoreOrderCheckoutProducts(sb, productIds);
  if (!loaded.ok) {
    return { ok: false, error: "products_not_found", status: 400 };
  }
  const byId = Object.fromEntries(loaded.rows.map((p) => [p.id, p]));

  const lines = items.map((line): StoreCartRevalidationLineResult => {
    const product = byId[line.product_id];
    const evaluated = evaluateStoreOrderCheckoutLine({
      product,
      line,
      storeId,
      fulfillment,
      storeDeliveryOn: gate.storeDeliveryOn,
    });
    const serverUnit = evaluated.ok ? evaluated.line.unit : evaluated.server_unit_php;
    let serverListUnit: number | null = null;
    if (product && serverUnit != null) {
      const list = Number(product.price);
      serverListUnit = Number.isFinite(list) ? list + (serverUnit - productUnitPrice(product)) : null;
    }
    return {
      line_id: line.line_id,
      product_id: line.product_id,
      /** 삭제된 상품(조회 0건)은 판매 중지와 같게 표시 */
      error: evaluated.ok ? null : product ? evaluated.error : "product_not_available",
      server_unit_php: serverUnit,
      server_list_unit_php: serverListUnit,
    };
  });

  return { ok: true, lines };
}
