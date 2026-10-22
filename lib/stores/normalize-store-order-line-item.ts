import { parseModifierWireFromBody } from "@/lib/stores/product-line-options";
import type { StoreOrderLineInput } from "@/lib/stores/validate-store-order-checkout";

/**
 * POST 본문 `items[]` 한 줄 → 검증 입력. 주문 생성(`/api/me/store-orders`)과
 * 장바구니 재검증(`/api/me/store-cart/revalidate`)이 같은 파서를 쓴다.
 */
export function normalizeStoreOrderLineItem(raw: unknown): StoreOrderLineInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const product_id = String(r.product_id ?? "").trim();
  const qty = Math.floor(Number(r.qty));
  if (!product_id || !Number.isFinite(qty) || qty < 1) return null;
  const wire = parseModifierWireFromBody(r);
  const line_note = String(r.line_note ?? "").trim() || null;
  const clientRaw = r.client_unit_php ?? r.unit_price_php;
  const client_unit_php =
    clientRaw != null && clientRaw !== "" && Number.isFinite(Number(clientRaw))
      ? Number(clientRaw)
      : null;
  return { product_id, qty, wire, line_note, client_unit_php };
}
