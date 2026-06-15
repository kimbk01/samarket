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

export const DIBAY_CALL_MEDIA_PENDING_SOURCE_KEY = "dibay.call_media.pending_source";

/** 가입·첫 로그인 직후 온보딩 게이트가 source 를 식별하도록 sessionStorage 에 기록 */
export function markCallMediaOnboardingPendingSource(source: "signup_complete" | "first_login"): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DIBAY_CALL_MEDIA_PENDING_SOURCE_KEY, source);
  } catch {
    /* private mode */
  }
}

/** 로그인·가입 직후 온보딩 source — sessionStorage 마커가 있으면 우선 */
export function resolveCallMediaOnboardingSource(): DibayDevicePermissionSource {
  if (typeof window === "undefined") return "app_entry";
  try {
    const raw = window.sessionStorage.getItem(DIBAY_CALL_MEDIA_PENDING_SOURCE_KEY)?.trim();
    if (raw === "signup_complete" || raw === "first_login") {
      window.sessionStorage.removeItem(DIBAY_CALL_MEDIA_PENDING_SOURCE_KEY);
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
