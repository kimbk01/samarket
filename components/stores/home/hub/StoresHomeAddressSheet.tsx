"use client";

import { DeliveryStyleAddressPickerSheet } from "@/components/addresses/DeliveryStyleAddressPickerSheet";

/**
 * CONTRACT — `/stores` 주소 바텀시트.
 * DO NOT: pill `현재` 뱃지·헤더와 다른 주소 한 줄 포맷 — `AddressListRowBody` 공유.
 * `store_address_manage_link` 는 시트 헤더 링크에만.
 */
export function StoresHomeAddressSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return <DeliveryStyleAddressPickerSheet open={open} onClose={onClose} purpose="delivery" />;
}
