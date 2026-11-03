"use client";

import type { MutableRefObject } from "react";
import {
  DeliveryServiceAreaEditorCore,
  type DeliveryServiceAreaEditorController,
} from "@/components/delivery/DeliveryServiceAreaEditorCore";

type Props = {
  storeId: string;
  /** When profile radius input changes, refresh candidates (discovery only). */
  referenceRadiusKmDisplay: string;
  /** 저장 전 선택 변경 — 프로필 폼 이탈 확인에 합류. */
  onDirtyChange?: (dirty: boolean) => void;
  /** D-7 — 매장 설정 하단 저장·취소가 배달 지역도 저장·되돌림 */
  controllerRef?: MutableRefObject<DeliveryServiceAreaEditorController | null>;
};

/**
 * Owner thin wrapper — same SSOT editor core, Owner API path only.
 */
export function OwnerDeliveryServiceAreaEditor({
  storeId,
  referenceRadiusKmDisplay,
  onDirtyChange,
  controllerRef,
}: Props) {
  return (
    <DeliveryServiceAreaEditorCore
      storeId={storeId}
      surface="owner"
      referenceRadiusKmDisplay={referenceRadiusKmDisplay}
      onDirtyChange={onDirtyChange}
      controllerRef={controllerRef}
      apiPath={`/api/me/stores/${encodeURIComponent(storeId)}/delivery-service-areas`}
    />
  );
}
