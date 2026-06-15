"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  checkDevicePermissions,
  getDibayDevicePermissionState,
  openDevicePermissionSettings,
  requestInitialDevicePermissions,
  subscribeDibayDevicePermissionState,
  syncDevicePermissionState,
  type DibayDevicePermissionSource,
} from "@/lib/permissions/dibay-device-permission-store";
import { isDibayDevicePermissionGranted } from "@/lib/permissions/dibay-device-permission-onboarding";

export function useDibayDevicePermissions() {
  const state = useSyncExternalStore(
    subscribeDibayDevicePermissionState,
    getDibayDevicePermissionState,
    getDibayDevicePermissionState,
  );

  useEffect(() => {
    void syncDevicePermissionState();
  }, []);

  const check = useCallback(() => checkDevicePermissions(), []);
  const requestInitial = useCallback(
    (source: DibayDevicePermissionSource) => requestInitialDevicePermissions(source),
    [],
  );
  const openSettings = useCallback(() => openDevicePermissionSettings(), []);

  return {
    state,
    granted: isDibayDevicePermissionGranted(state),
    checkDevicePermissions: check,
    requestInitialDevicePermissions: requestInitial,
    syncDevicePermissionState,
    openDevicePermissionSettings: openSettings,
  };
}
