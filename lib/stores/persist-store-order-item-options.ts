import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderLineOptionsSnapshotV2 } from "@/lib/stores/modifiers/types";

type InsertRow = {
  order_item_id: string;
  option_group_name_snapshot: string;
  option_item_name_snapshot: string;
  price_delta_snapshot: number;
  quantity: number;
  line_extra_total: number;
};

function rowsFromSnapshotV2(orderItemId: string, snap: OrderLineOptionsSnapshotV2): InsertRow[] {
  const rows: InsertRow[] = [];
  for (const g of snap.groups) {
    for (const ln of g.lines) {
      rows.push({
        order_item_id: orderItemId,
        option_group_name_snapshot: g.label,
        option_item_name_snapshot: ln.name,
        price_delta_snapshot: Math.round(Number(ln.price_delta_each) || 0),
        quantity: Math.max(1, Math.floor(Number(ln.qty) || 1)),
        line_extra_total: Math.round(Number(ln.line_extra) || 0),
      });
    }
  }
  return rows;
}

/**
 * options_snapshot_json(v2) 기준으로 정규화 테이블에 옵션 행 삽입.
 * 테이블/컬럼이 없으면(마이그레이션 전) 조용히 무시.
 */
export async function persistStoreOrderItemOptions(
  sb: SupabaseClient<any>,
  orderItemId: string,
  optionsSnapshot: unknown
): Promise<void> {
  if (!optionsSnapshot || typeof optionsSnapshot !== "object") return;
  const snap = optionsSnapshot as Partial<OrderLineOptionsSnapshotV2>;
  if (snap.v !== 2 || !Array.isArray(snap.groups)) return;
  const insertRows = rowsFromSnapshotV2(orderItemId, snap as OrderLineOptionsSnapshotV2);
  if (insertRows.length === 0) return;

  const { error } = await sb.from("store_order_item_options").insert(insertRows);
  if (error) {
    const msg = String(error.message ?? "");
    if (
      msg.includes("store_order_item_options") &&
      (msg.includes("does not exist") || msg.includes("schema cache"))
    ) {
      return;
    }
    console.warn("[persistStoreOrderItemOptions]", error.message);
  }
}
