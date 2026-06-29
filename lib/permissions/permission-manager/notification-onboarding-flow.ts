"use client";

import {
  canRequestOsNotificationPrompt,
  openNotificationSettings,
  requestNotificationFromGuide,
  shouldShowNotificationGuide,
  syncNotificationState,
} from "@/lib/permissions/permission-manager/notification-permission-manager";
import {
  markNotificationRequiredBlocked,
  clearNotificationRequiredBlocked,
} from "@/lib/permissions/permission-manager/notification-permission-block-store";
import {
  openNotificationGuideModal,
} from "@/lib/permissions/permission-manager/notification-permission-ui-bridge";
import type { NotificationGuideMode } from "@/lib/permissions/permission-manager/notification-permission-types";
import { recordDiBaYOnboardingDecision } from "@/lib/permissions/device-permission-manager";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { registerNativePushFromClient } from "@/lib/push/native/register-native-push-client";
import { registerWebPushSubscriptionFromClient } from "@/lib/push/register-web-push-subscription-client";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";

export type NotificationGuideFlowResult = "granted" | "declined" | "browser_denied";

async function schedulePushRegistration(): Promise<void> {
  if (isCapacitorNativePlatform()) {
    const userId = (await getCurrentUserIdForDb())?.trim() ?? "";
    void registerNativePushFromClient(userId);
    return;
  }
  void registerWebPushSubscriptionFromClient();
}

/**
 * Guide-first notification flow — single entry for first login and explicit retries.
 */
export async function runNotificationGuideFlow(mode: NotificationGuideMode): Promise<NotificationGuideFlowResult> {
  let snapshot = await syncNotificationState();

  if (snapshot.receiveReady) {
    clearNotificationRequiredBlocked();
    recordDiBaYOnboardingDecision("notification", "accepted");
    await schedulePushRegistration();
    return "granted";
  }

  if (!shouldShowNotificationGuide(snapshot)) {
    recordDiBaYOnboardingDecision("notification", "declined");
    return "declined";
  }

  const choice = await openNotificationGuideModal(mode, snapshot);

  if (choice === "later") {
    markNotificationRequiredBlocked();
    recordDiBaYOnboardingDecision("notification", "declined");
    return "declined";
  }

  if (choice === "open_settings") {
    markNotificationRequiredBlocked();
    recordDiBaYOnboardingDecision("notification", "browser_denied");
    return "browser_denied";
  }

  snapshot = await syncNotificationState();
  if (!canRequestOsNotificationPrompt(snapshot)) {
    await openNotificationSettings();
    markNotificationRequiredBlocked();
    recordDiBaYOnboardingDecision("notification", "browser_denied");
    return "browser_denied";
  }

  const osResult = await requestNotificationFromGuide();
  snapshot = osResult.snapshot;

  if (osResult.ok && snapshot.receiveReady) {
    clearNotificationRequiredBlocked();
    recordDiBaYOnboardingDecision("notification", "accepted");
    await schedulePushRegistration();
    return "granted";
  }

  if (snapshot.effectiveState === "PERMANENT_DENIED" || snapshot.effectiveState === "SYSTEM_DISABLED") {
    markNotificationRequiredBlocked();
    recordDiBaYOnboardingDecision("notification", "browser_denied");
    return "browser_denied";
  }

  markNotificationRequiredBlocked();
  recordDiBaYOnboardingDecision("notification", "declined");
  return "declined";
}
