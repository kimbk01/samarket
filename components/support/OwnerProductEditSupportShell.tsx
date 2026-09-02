"use client";

import { OwnerProductForm } from "@/components/business/owner/OwnerProductForm";
import { OwnerSupportContextBridge } from "@/components/support/OwnerSupportContextBridge";

export function OwnerProductEditSupportShell({
  storeId,
  productId,
}: {
  storeId: string;
  productId: string;
}) {
  return (
    <OwnerSupportContextBridge
      enabled
      category="PRODUCT_MENU"
      sourceSurface="owner_product_edit"
      storeId={storeId}
      referenceType="STORE_PRODUCT"
      referenceId={productId}
    >
      <OwnerProductForm mode="edit" storeId={storeId} productId={productId} />
    </OwnerSupportContextBridge>
  );
}
