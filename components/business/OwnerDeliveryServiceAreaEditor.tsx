"use client";

import { DeliveryServiceAreaEditorCore } from "@/components/delivery/DeliveryServiceAreaEditorCore";

type Props = {
  storeId: string;
  /** When profile radius input changes, refresh candidates (discovery only). */
  referenceRadiusKmDisplay: string;
  /** 저장 전 선택 변경 — 프로필 폼 이탈 확인에 합류. */
  onDirtyChange?: (dirty: boolean) => void;
};

/**
 * Owner thin wrapper — same SSOT editor core, Owner API path only.
 */
export function OwnerDeliveryServiceAreaEditor({
  storeId,
  referenceRadiusKmDisplay,
  onDirtyChange,
}: Props) {
  return (
    <DeliveryServiceAreaEditorCore
      storeId={storeId}
      surface="owner"
      referenceRadiusKmDisplay={referenceRadiusKmDisplay}
      onDirtyChange={onDirtyChange}
      apiPath={`/api/me/stores/${encodeURIComponent(storeId)}/delivery-service-areas`}
    />
  );
}
