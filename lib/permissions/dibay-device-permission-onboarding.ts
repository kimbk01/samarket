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

/** 로그인·가입 직후 온보딩 source — sessionStorage 마커가 있으면 우선 */
export function resolveCallMediaOnboardingSource(): DibayDevicePermissionSource {
  if (typeof window === "undefined") return "app_entry";
  try {
    const raw = window.sessionStorage.getItem("dibay.call_media.pending_source")?.trim();
    if (raw === "signup_complete" || raw === "first_login") {
      window.sessionStorage.removeItem("dibay.call_media.pending_source");
      return raw;
    }
  } catch {
    /* private mode */
  }
  return "app_entry";
}

export function readDibayDevicePermissionOnboardingState(): DibayDevicePermissionState {
  return getDibayDevicePermissionState();
}
