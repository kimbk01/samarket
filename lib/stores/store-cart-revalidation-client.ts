import type { ModifierSelectionsWire } from "@/lib/stores/modifiers/types";
import type {
  StoreCartLineRevalidationPatch,
  StoreCommerceCartLine,
} from "@/lib/stores/store-commerce-cart-types";

/**
 * CRT-02 — 장바구니 줄 → 주문·재검증 POST 의 `items[]` 한 줄.
 * 주문 제출과 재검증이 같은 직렬화를 쓴다(서버 `normalizeStoreOrderLineItem`).
 */
export function storeCartLineToOrderItem(l: StoreCommerceCartLine): Record<string, unknown> {
  const wire: ModifierSelectionsWire = l.modifierWire ?? { pick: { ...l.optionSelections }, qty: {} };
  const hasPick = Object.keys(wire.pick).some((k) => (wire.pick[k]?.length ?? 0) > 0);
  const hasQty = Object.keys(wire.qty).length > 0;
  const row: Record<string, unknown> = {
    product_id: l.productId,
    qty: l.qty,
    /** 서버 `validate-store-order-checkout` — 스냅샷 단가와 DB 재계산 단가 대조 */
    client_unit_php: Math.max(0, Math.floor(Number(l.unitPricePhp) || 0)),
  };
  if (hasPick || hasQty) row.modifier_selections = wire;
  if (l.lineNote?.trim()) row.line_note = l.lineNote.trim();
  return row;
}

/** 재검증 요청 키 — 가격·재검증 표시를 빼서, 결과 반영이 재요청을 부르지 않게 한다 */
export function storeCartRevalidationRequestKey(
  storeId: string,
  fulfillment: string,
  lines: readonly StoreCommerceCartLine[]
): string {
  return JSON.stringify({
    s: storeId,
    f: fulfillment,
    l: lines.map((l) => [l.lineId, l.productId, l.qty, l.modifierWire ?? l.optionSelections, l.lineNote ?? ""]),
  });
}

export type StoreCartRevalidationLineJson = {
  line_id?: unknown;
  error?: unknown;
  server_unit_php?: unknown;
  server_list_unit_php?: unknown;
};

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** 가격 차이만 있는 코드 — 서버 단가로 갱신하면 주문 가능 */
const PRICE_ONLY_CODES = new Set(["price_changed", "client_unit_php_required"]);

/**
 * 서버 줄 결과 → 카트 패치. 가격 변경은 서버 단가로 갱신하고 사유를 지운다.
 * 그 외 오류(품절·판매 중지·옵션·수량 등)는 사유로 표시한다.
 */
export function revalidationLinesToPatches(
  rows: readonly StoreCartRevalidationLineJson[]
): StoreCartLineRevalidationPatch[] {
  const out: StoreCartLineRevalidationPatch[] = [];
  for (const r of rows) {
    const lineId = typeof r.line_id === "string" ? r.line_id.trim() : "";
    if (!lineId) continue;
    const code = typeof r.error === "string" && r.error.trim() ? r.error.trim() : null;
    out.push({
      lineId,
      unitPricePhp: finiteOrNull(r.server_unit_php),
      listUnitPricePhp: finiteOrNull(r.server_list_unit_php),
      issue: code && !PRICE_ONLY_CODES.has(code) ? code : null,
    });
  }
  return out;
}

/** 패치가 사용자에게 보이는 변화(가격·주문 불가)를 만드는지 — 안내 배너 표시용 */
export function revalidationPatchesChangeCart(
  lines: readonly StoreCommerceCartLine[],
  patches: readonly StoreCartLineRevalidationPatch[]
): boolean {
  const byId = new Map(lines.map((l) => [l.lineId, l]));
  return patches.some((p) => {
    const l = byId.get(p.lineId);
    if (!l) return false;
    if (p.issue && p.issue !== (l.revalidationIssue ?? null)) return true;
    return (
      p.unitPricePhp != null &&
      Math.max(0, Math.floor(p.unitPricePhp)) !== Math.max(0, Math.floor(Number(l.unitPricePhp) || 0))
    );
  });
}

/** 주문 실패 코드 중 장바구니 줄 재검증으로 회복·표시할 수 있는 것 */
export function isStoreCartLineLevelCheckoutError(code: string): boolean {
  return (
    PRICE_ONLY_CODES.has(code) ||
    code.startsWith("options_") ||
    code.startsWith("product_") ||
    code === "invalid_option" ||
    code === "invalid_product" ||
    code === "products_not_found" ||
    code === "qty_out_of_range" ||
    code === "insufficient_stock" ||
    code === "pickup_not_available" ||
    code === "delivery_not_available" ||
    code === "shipping_not_available"
  );
}

/** POST `/api/me/store-cart/revalidate` — 읽기 전용. 실패·비로그인은 null(카트 표시 그대로) */
export async function postStoreCartRevalidation(args: {
  storeId: string;
  fulfillment: string;
  lines: readonly StoreCommerceCartLine[];
  signal?: AbortSignal;
}): Promise<StoreCartRevalidationLineJson[] | null> {
  const res = await fetch("/api/me/store-cart/revalidate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    signal: args.signal,
    body: JSON.stringify({
      store_id: args.storeId,
      fulfillment_type: args.fulfillment,
      items: args.lines.map((l) => ({ ...storeCartLineToOrderItem(l), line_id: l.lineId })),
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as { ok?: boolean; lines?: unknown } | null;
  if (!json?.ok || !Array.isArray(json.lines)) return null;
  return json.lines as StoreCartRevalidationLineJson[];
}
