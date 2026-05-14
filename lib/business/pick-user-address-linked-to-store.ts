import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

/**
 * 주소록에서 `labelType === shop` 이고 `linked_store_id` 가 해당 매장과 일치하는 행.
 * 배달 ETA·거리는 `stores.lat`/`lng` 가 이 주소 좌표와 맞춰질 때 주문자 ↔ 매장 핀으로 일치한다.
 */
export function pickUserAddressLinkedToStore(
  storeId: string,
  addresses: readonly UserAddressDTO[],
): UserAddressDTO | null {
  const sid = storeId.trim();
  if (!sid) return null;
  const rows = addresses.filter(
    (a) =>
      a.isActive &&
      a.labelType === "shop" &&
      (a.linkedStoreId?.trim() ?? "") === sid,
  );
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  return sorted[0] ?? null;
}
