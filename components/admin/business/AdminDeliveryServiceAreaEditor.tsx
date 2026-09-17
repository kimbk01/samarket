"use client";

import { DeliveryServiceAreaEditorCore } from "@/components/delivery/DeliveryServiceAreaEditorCore";

/**
 * Admin Business CC thin wrapper — same SSOT editor core, Admin API path only.
 * Attaches under existing delivery operational settings (no new Admin subsystem).
 */
export function AdminDeliveryServiceAreaEditor({
  storeId,
  referenceRadiusKmDisplay,
  onSaved,
}: {
  storeId: string;
  referenceRadiusKmDisplay?: string;
  onSaved?: () => void;
}) {
  return (
    <DeliveryServiceAreaEditorCore
      storeId={storeId}
      surface="admin"
      referenceRadiusKmDisplay={referenceRadiusKmDisplay}
      onSaved={onSaved}
      apiPath={`/api/admin/stores/${encodeURIComponent(storeId)}/delivery-service-areas`}
    />
  );
}
