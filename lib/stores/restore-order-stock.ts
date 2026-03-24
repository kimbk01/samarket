import type { SupabaseClient } from "@supabase/supabase-js";

/** 주문 취소 시 라인 수량만큼 상품 재고 복구 (품절이었다면 active로 복귀) */
export async function restoreStockForOrderLines(
  sb: SupabaseClient,
  lines: { product_id: string; qty: number }[]
): Promise<void> {
  for (const line of lines) {
    const { data: cur } = await sb
      .from("store_products")
      .select("stock_qty, product_status")
      .eq("id", line.product_id)
      .maybeSingle();
    if (!cur) continue;
    const n = (cur.stock_qty as number) + line.qty;
    await sb
      .from("store_products")
      .update({
        stock_qty: n,
        product_status: n > 0 && cur.product_status === "sold_out" ? "active" : cur.product_status,
      })
      .eq("id", line.product_id);
  }
}
