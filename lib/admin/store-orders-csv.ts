import type { AdminStoreOrderRow } from "@/lib/admin/admin-store-orders-query";

function csvCell(s: string): string {
  const t = String(s).replace(/"/g, '""');
  if (/[",\r\n]/.test(t)) return `"${t}"`;
  return t;
}

const HEADER = [
  "order_no",
  "id",
  "store_name",
  "store_id",
  "buyer_user_id",
  "payment_amount",
  "payment_status",
  "order_status",
  "fulfillment_type",
  "created_at",
];

/** UTF-8 BOM — 엑셀에서 한글 깨짐 완화 */
export function buildStoreOrdersCsv(rows: AdminStoreOrderRow[]): string {
  const lines = [HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.order_no),
        csvCell(r.id),
        csvCell(r.store_name),
        csvCell(r.store_id),
        csvCell(r.buyer_user_id),
        csvCell(String(r.payment_amount)),
        csvCell(r.payment_status),
        csvCell(r.order_status),
        csvCell(r.fulfillment_type),
        csvCell(r.created_at),
      ].join(",")
    );
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

export function storeOrdersCsvFilename() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `store-orders-${stamp}.csv`;
}
