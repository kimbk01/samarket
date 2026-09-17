"use client";

import { DeliveryServiceAreaEditorCore } from "@/components/delivery/DeliveryServiceAreaEditorCore";

type Props = {
  storeId: string;
  /** When profile radius input changes, refresh candidates (discovery only). */
  referenceRadiusKmDisplay: string;
};

/**
 * Owner thin wrapper — same SSOT editor core, Owner API path only.
 */
export function OwnerDeliveryServiceAreaEditor({ storeId, referenceRadiusKmDisplay }: Props) {
  return (
    <DeliveryServiceAreaEditorCore
      storeId={storeId}
      surface="owner"
      referenceRadiusKmDisplay={referenceRadiusKmDisplay}
      apiPath={`/api/me/stores/${encodeURIComponent(storeId)}/delivery-service-areas`}
    />
  );
}
