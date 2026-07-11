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
import type { NotificationGuideMode } from "@/lib/permissions/permission-manager/notification-permission-types";
import { recordDiBaYOnboardingDecision } from "@/lib/permissions/device-permission-manager";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { registerNativePushFromClient } from "@/lib/push/native/register-native-push-client";
import { registerWebPushSubscriptionFromClient } from "@/lib/push/register-web-push-subscription-client";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";

export type NotificationGuideFlowResult = "granted" | "declined" | "browser_denied";

/** Web: settings_retry = explicit user click; first_login/disabled_resume = passive (no modal, no OS prompt). */
function isWebNotificationUserGesture(mode: NotificationGuideMode): boolean {
  return mode === "settings_retry";
}

/** Native passive — resume/visibility: sync only, no OS prompt. */
function isNativePassiveNotificationMode(mode: NotificationGuideMode): boolean {
  return mode === "disabled_resume" || mode === "first_login";
}

async function schedulePushRegistration(): Promise<void> {
  if (isCapacitorNativePlatform()) {
    const userId = (await getCurrentUserIdForDb())?.trim() ?? "";
    void registerNativePushFromClient(userId, "notificationOnboardingFlow");
    return;
  }
  void registerWebPushSubscriptionFromClient();
}

async function finalizeNotificationOsResult(
  osResult: Awaited<ReturnType<typeof requestNotificationFromGuide>>,
): Promise<NotificationGuideFlowResult> {
  const snapshot = osResult.snapshot;

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

/**
 * Chrome/Web — browser permission model only. No app guide modal; OS prompt on explicit user gesture.
 */
async function runWebNotificationBrowserFlow(mode: NotificationGuideMode): Promise<NotificationGuideFlowResult> {
  const snapshot = await syncNotificationState();

  if (snapshot.receiveReady) {
    clearNotificationRequiredBlocked();
    recordDiBaYOnboardingDecision("notification", "accepted");
    await schedulePushRegistration();
    return "granted";
  }

  if (!isWebNotificationUserGesture(mode)) {
    return "declined";
  }

  if (!canRequestOsNotificationPrompt(snapshot)) {
    recordDiBaYOnboardingDecision("notification", "browser_denied");
    return "browser_denied";
  }

  const osResult = await requestNotificationFromGuide();
  return finalizeNotificationOsResult(osResult);
}

/**
 * Settings retry — OS prompt when available; otherwise return settingsRequired state only.
 */
async function runNotificationSettingsGuideFlow(): Promise<NotificationGuideFlowResult> {
  const snapshot = await syncNotificationState();

  if (snapshot.receiveReady) {
    clearNotificationRequiredBlocked();
    recordDiBaYOnboardingDecision("notification", "accepted");
    await schedulePushRegistration();
    return "granted";
  }

  if (canRequestOsNotificationPrompt(snapshot)) {
    const osResult = await requestNotificationFromGuide();
    return finalizeNotificationOsResult(osResult);
  }

  markNotificationRequiredBlocked();
  recordDiBaYOnboardingDecision("notification", "browser_denied");
  return "browser_denied";
}

/**
 * OS-first notification flow — explicit user action or passive sync modes.
 */
export async function runNotificationGuideFlow(mode: NotificationGuideMode): Promise<NotificationGuideFlowResult> {
  if (!isCapacitorNativePlatform()) {
    return runWebNotificationBrowserFlow(mode);
  }

  const snapshot = await syncNotificationState();

  if (snapshot.receiveReady) {
    clearNotificationRequiredBlocked();
    recordDiBaYOnboardingDecision("notification", "accepted");
    await schedulePushRegistration();
    return "granted";
  }

  if (isNativePassiveNotificationMode(mode)) {
    return "declined";
  }

  if (!shouldShowNotificationGuide(snapshot)) {
    recordDiBaYOnboardingDecision("notification", "declined");
    return "declined";
  }

  if (canRequestOsNotificationPrompt(snapshot)) {
    const osResult = await requestNotificationFromGuide();
    return finalizeNotificationOsResult(osResult);
  }

  if (mode === "settings_retry") {
    return runNotificationSettingsGuideFlow();
  }

  markNotificationRequiredBlocked();
  recordDiBaYOnboardingDecision("notification", "browser_denied");
  return "browser_denied";
}

/** Explicit settings / register button — OS prompt only, no DIBAY guide UI. */
export async function requestNotificationOnUserAction(): Promise<NotificationGuideFlowResult> {
  return runNotificationGuideFlow("settings_retry");
}
