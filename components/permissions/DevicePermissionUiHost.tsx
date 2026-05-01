"use client";

import { useEffect, useReducer } from "react";
import {
  getPermissionGuidePending,
  settlePermissionGuideModal,
  subscribePermissionUiBridge,
} from "@/lib/permissions/permission-ui-bridge";
import { warmDevicePermissionCache } from "@/lib/permissions/device-permission-manager";
import { PermissionGuideModal } from "@/components/permissions/PermissionGuideModal";

/**
 * 전역 권한 안내 모달 — 브리지에 걸린 요청만 렌더링.
 * 실제 geolocation/GUM 은 매니저가 같은 마이크로태스크 체인에서 이어서 호출한다.
 */
export function DevicePermissionUiHost() {
  const [, bump] = useReducer((x) => x + 1, 0);

  useEffect(() => subscribePermissionUiBridge(bump), []);

  useEffect(() => {
    void warmDevicePermissionCache();
  }, []);

  const pending = getPermissionGuidePending();
  if (!pending) return null;

  return (
    <PermissionGuideModal
      kind={pending.kind}
      onLater={() => settlePermissionGuideModal("later")}
      onPrimary={() => settlePermissionGuideModal("allow")}
    />
  );
}
