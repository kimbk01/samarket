"use client";

import { useCallback, useEffect, useReducer } from "react";
import type { DevicePermissionKind } from "@/lib/permissions/device-permission-kind";
import type { BrowserPermissionState } from "@/lib/permissions/device-permission-manager";
import {
  getCachedPermissionState,
  getPermissionState,
  refreshPermissionState,
  resetPermissionGuideTracking,
  shouldShowGuide,
} from "@/lib/permissions/device-permission-manager";
import { subscribePermissionUiBridge } from "@/lib/permissions/permission-ui-bridge";

export function useDevicePermission(kind: DevicePermissionKind) {
  const [, bump] = useReducer((x) => x + 1, 0);

  useEffect(() => subscribePermissionUiBridge(bump), []);

  const refresh = useCallback(async () => {
    const next = await refreshPermissionState(kind);
    bump();
    return next;
  }, [kind]);

  const resetGuideTracking = useCallback(() => {
    resetPermissionGuideTracking(kind);
    bump();
  }, [kind]);

  const state: BrowserPermissionState = getPermissionState(kind);
  const cached = getCachedPermissionState(kind);

  const computeShouldShowGuide = useCallback(async () => {
    const live = await refreshPermissionState(kind);
    return shouldShowGuide(kind, live);
  }, [kind]);

  return {
    state,
    cached,
    refresh,
    computeShouldShowGuide,
    resetGuideTracking,
  };
}
