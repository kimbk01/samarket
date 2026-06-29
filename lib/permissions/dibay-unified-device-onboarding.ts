import { syncNotificationState } from "@/lib/permissions/permission-manager/notification-permission-manager";

export type DibayUnifiedOnboardingStep = "notification" | "camera" | "microphone";

export type DibayUnifiedOnboardingPlan = {
  steps: DibayUnifiedOnboardingStep[];
  source: import("@/lib/permissions/dibay-device-permission-store").DibayDevicePermissionSource;
  callMediaAlreadyGranted: boolean;
};

async function shouldIncludeNotificationStep(): Promise<boolean> {
  const snapshot = await syncNotificationState();
  return !snapshot.receiveReady;
}

/** 로그인 후 — 알림(receiveReady 미달) → 카메라 → 마이크 순서 */
export async function resolveDibayUnifiedOnboardingPlan(): Promise<DibayUnifiedOnboardingPlan> {
  const steps: DibayUnifiedOnboardingStep[] = [];
  const { resolveCallMediaOnboardingSource, resolveDibayDevicePermissionOnboarding, isDibayDevicePermissionGranted } =
    await import("@/lib/permissions/dibay-device-permission-onboarding");
  const source = resolveCallMediaOnboardingSource();

  if (await shouldIncludeNotificationStep()) {
    steps.push("notification");
  }

  const mediaDecision = await resolveDibayDevicePermissionOnboarding(source);
  const callMediaAlreadyGranted = isDibayDevicePermissionGranted(mediaDecision.state);

  if (mediaDecision.shouldShow) {
    if (mediaDecision.state.camera !== "granted") {
      steps.push("camera");
    }
    if (mediaDecision.state.microphone !== "granted") {
      steps.push("microphone");
    }
  }

  return { steps, source, callMediaAlreadyGranted };
}
