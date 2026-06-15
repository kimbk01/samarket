import { shouldOfferDiBaYNotificationPrePrompt } from "@/lib/notifications/dibay-notification-prompt-storage";
import {
  isDibayDevicePermissionGranted,
  resolveDibayDevicePermissionOnboarding,
  resolveCallMediaOnboardingSource,
} from "@/lib/permissions/dibay-device-permission-onboarding";
import type { DibayDevicePermissionSource } from "@/lib/permissions/dibay-device-permission-store";
import { syncDiBaYOnboardingFromBrowserPermission } from "@/lib/permissions/device-permission-manager";

export type DibayUnifiedOnboardingStep = "notification" | "camera" | "microphone";

export type DibayUnifiedOnboardingPlan = {
  steps: DibayUnifiedOnboardingStep[];
  source: DibayDevicePermissionSource;
  callMediaAlreadyGranted: boolean;
};

function shouldIncludeNotificationStep(): boolean {
  if (typeof window === "undefined") return false;
  if (!shouldOfferDiBaYNotificationPrePrompt()) return false;
  const notificationApi = (window as Window & { Notification?: { permission: NotificationPermission } }).Notification;
  if (!notificationApi) return false;
  const perm = notificationApi.permission;
  if (perm === "granted" || perm === "denied") {
    syncDiBaYOnboardingFromBrowserPermission("notification");
    return false;
  }
  return perm === "default";
}

/** 로그인 후 1회 — 알림 → 카메라 → 마이크 순서로 보여줄 단계 목록 */
export async function resolveDibayUnifiedOnboardingPlan(): Promise<DibayUnifiedOnboardingPlan> {
  const steps: DibayUnifiedOnboardingStep[] = [];
  const source = resolveCallMediaOnboardingSource();

  if (shouldIncludeNotificationStep()) {
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
