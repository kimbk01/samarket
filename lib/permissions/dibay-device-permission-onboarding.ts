import {
  checkDevicePermissions,
  getDibayDevicePermissionState,
  hasRequestedInitialDevicePermissions,
  type DibayDevicePermissionSource,
  type DibayDevicePermissionState,
} from "@/lib/permissions/dibay-device-permission-store";

export type DibayDevicePermissionOnboardingDecision =
  | { shouldShow: true; source: DibayDevicePermissionSource; state: DibayDevicePermissionState }
  | { shouldShow: false; state: DibayDevicePermissionState };

export function isDibayDevicePermissionGranted(state: DibayDevicePermissionState): boolean {
  return state.camera === "granted" && state.microphone === "granted";
}

export function shouldShowDibayDevicePermissionOnboarding(
  state: DibayDevicePermissionState,
): boolean {
  if (isDibayDevicePermissionGranted(state)) return false;
  return !hasRequestedInitialDevicePermissions();
}

export async function resolveDibayDevicePermissionOnboarding(
  source: DibayDevicePermissionSource,
): Promise<DibayDevicePermissionOnboardingDecision> {
  const synced = await checkDevicePermissions();
  if (shouldShowDibayDevicePermissionOnboarding(synced)) {
    return { shouldShow: true, source, state: synced };
  }
  return { shouldShow: false, state: synced };
}

export function readDibayDevicePermissionOnboardingState(): DibayDevicePermissionState {
  return getDibayDevicePermissionState();
}
