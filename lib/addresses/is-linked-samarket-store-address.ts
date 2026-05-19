import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

/** `labelType === shop` 이고 매장에 연결된 행 — 대표(마스터) PATCH 시 서버 400 */
export function isLinkedSamarketStoreAddressRow(row: {
  labelType: UserAddressDTO["labelType"];
  linkedStoreId?: string | null;
}): boolean {
  return row.labelType === "shop" && Boolean(String(row.linkedStoreId ?? "").trim());
}
