import type { SupabaseClient } from "@supabase/supabase-js";

/** 주문 취소·환불 등 시 라인 수량만큼 상품 재고 복구 (품절이었다면 active로 복귀). 재고 미관리 상품은 건너뜀. */
export async function restoreStockForOrderLines(
  sb: SupabaseClient,
  lines: { product_id: string; qty: number }[]
): Promise<void> {
  if (!lines.length) return;

  const qtyByProduct = new Map<string, number>();
  for (const line of lines) {
    const pid = String(line.product_id ?? "").trim();
    if (!pid) continue;
    const qty = Math.max(0, Math.floor(Number(line.qty) || 0));
    if (qty < 1) continue;
    qtyByProduct.set(pid, (qtyByProduct.get(pid) ?? 0) + qty);
  }
  if (!qtyByProduct.size) return;

  const ids = [...qtyByProduct.keys()];
  const { data: products, error } = await sb
    .from("store_products")
    .select("id, stock_qty, product_status, track_inventory")
    .in("id", ids);
  if (error) {
    console.error("[restoreStockForOrderLines] select", error);
    return;
  }

  const updates: PromiseLike<unknown>[] = [];
  for (const cur of products ?? []) {
    const pid = String((cur as { id?: string }).id ?? "").trim();
    if (!pid) continue;
    if ((cur as { track_inventory?: boolean }).track_inventory !== true) continue;
    const add = qtyByProduct.get(pid) ?? 0;
    if (add < 1) continue;
    const stock = Number((cur as { stock_qty?: number }).stock_qty) || 0;
    const n = stock + add;
    const status = String((cur as { product_status?: string }).product_status ?? "");
    updates.push(
      sb
        .from("store_products")
        .update({
          stock_qty: n,
          product_status: n > 0 && status === "sold_out" ? "active" : status,
        })
        .eq("id", pid)
    );
  }
  if (updates.length) {
    await Promise.all(updates);
  }
}
