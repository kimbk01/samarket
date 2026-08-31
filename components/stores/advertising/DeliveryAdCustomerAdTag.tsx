"use client";

import { DELIVERY_AD_CUSTOMER_AD_TAG_CLASS } from "@/lib/stores/advertising/delivery-ad-design-board-contract";

/** Design board — customer-facing orange 「광고」 badge (#FF8A00) */
export function DeliveryAdCustomerAdTag({ label }: { label: string }) {
  return (
    <span className={DELIVERY_AD_CUSTOMER_AD_TAG_CLASS} data-delivery-ad-customer-tag="design-board">
      {label}
    </span>
  );
}
