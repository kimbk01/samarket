import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { checkAndroidFullScreenIntentGranted } from "@/lib/push/native/check-android-full-screen-intent";
import { syncNotificationState } from "@/lib/permissions/permission-manager/notification-permission-manager";

export type DibayUnifiedOnboardingStep = "notification" | "full_screen_intent";

export type DibayUnifiedOnboardingPlan = {
  steps: DibayUnifiedOnboardingStep[];
  source: import("@/lib/permissions/dibay-device-permission-store").DibayDevicePermissionSource;
  callMediaAlreadyGranted: boolean;
};

async function shouldIncludeNotificationStep(): Promise<boolean> {
  const snapshot = await syncNotificationState();
  return !snapshot.receiveReady;
}

async function shouldIncludeFullScreenIntentStep(): Promise<boolean> {
  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "android") {
    return false;
  }
  const granted = await checkAndroidFullScreenIntentGranted();
  return granted === false;
}

/** 로그인 후 — 알림(receiveReady) + FSI(lockScreen tier). mic/camera/battery는 제외. */
export async function resolveDibayUnifiedOnboardingPlan(): Promise<DibayUnifiedOnboardingPlan> {
  const steps: DibayUnifiedOnboardingStep[] = [];
  const { resolveCallMediaOnboardingSource, resolveDibayDevicePermissionOnboarding, isDibayDevicePermissionGranted } =
    await import("@/lib/permissions/dibay-device-permission-onboarding");
  const source = resolveCallMediaOnboardingSource();

  if (await shouldIncludeNotificationStep()) {
    steps.push("notification");
  }

  if (await shouldIncludeFullScreenIntentStep()) {
    steps.push("full_screen_intent");
  }

  const mediaDecision = await resolveDibayDevicePermissionOnboarding(source);
  const callMediaAlreadyGranted = isDibayDevicePermissionGranted(mediaDecision.state);

  return { steps, source, callMediaAlreadyGranted };
}
