"use client";

import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { getNotificationGuidePending } from "@/lib/permissions/permission-manager/notification-permission-ui-bridge";
import {
  getFullScreenIntentGuidePending,
  openFullScreenIntentGuideSheet,
  settleFullScreenIntentGuideSheet,
  type FullScreenIntentGuideContext,
} from "@/lib/permissions/permission-manager/full-screen-intent-guide-bridge";
import {
  isFsiPermanentDismiss,
  isFsiSessionLater,
  markFsiPermanentDismiss,
  markFsiSessionGuideHandled,
  markFsiSessionLater,
} from "@/lib/permissions/permission-manager/full-screen-intent-guide-storage";
import {
  openFullScreenIntentSettings,
  syncNotificationState,
} from "@/lib/permissions/permission-manager/notification-permission-manager";
import type { NotificationReceiveSnapshot } from "@/lib/permissions/permission-manager/notification-permission-types";

export function isAndroidFullScreenIntentGuidePlatform(): boolean {
  return isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "android";
}

export function shouldShowLoginFullScreenIntentGuide(snapshot: NotificationReceiveSnapshot): boolean {
  if (!isAndroidFullScreenIntentGuidePlatform()) return false;
  if (!snapshot.receiveReady) return false;
  if (snapshot.fullScreenIntentEnabled) return false;
  if (getNotificationGuidePending()) return false;
  if (isFsiSessionLater()) return false;
  if (isFsiPermanentDismiss()) return false;
  return true;
}

async function handleGuideChoice(context: FullScreenIntentGuideContext, choice: "open_settings" | "later" | "dismiss_permanent"): Promise<void> {
  if (choice === "later") {
    if (context === "login") {
      markFsiSessionLater();
    } else {
      markFsiSessionGuideHandled();
    }
    return;
  }

  if (choice === "dismiss_permanent") {
    markFsiPermanentDismiss();
    return;
  }

  markFsiSessionGuideHandled();
  await openFullScreenIntentSettings();
  await syncNotificationState({ force: true });
}

export async function runLoginFullScreenIntentGuideIfNeeded(options?: {
  notificationOnboardingSettled?: boolean;
}): Promise<boolean> {
  if (!isAndroidFullScreenIntentGuidePlatform()) return false;
  if (options?.notificationOnboardingSettled === false) return false;

  const snapshot = await syncNotificationState();
  if (!shouldShowLoginFullScreenIntentGuide(snapshot)) return false;

  const choice = await openFullScreenIntentGuideSheet("login");
  await handleGuideChoice("login", choice);
  return true;
}

/** Call boundary — login permanent dismiss does not block call-time education. */
export async function runFullScreenIntentEducationBeforeCall(): Promise<void> {
  if (!isAndroidFullScreenIntentGuidePlatform()) return;

  const snapshot = await syncNotificationState();
  if (snapshot.fullScreenIntentEnabled) return;

  const choice = await openFullScreenIntentGuideSheet("call");
  if (choice === "dismiss_permanent") {
    await handleGuideChoice("call", "later");
    return;
  }
  await handleGuideChoice("call", choice);
}

export async function syncFullScreenIntentAfterAppResume(): Promise<NotificationReceiveSnapshot> {
  return syncNotificationState({ force: true });
}

/** Close an open guide sheet when OS reports FSI granted after settings return. */
export function dismissFullScreenIntentGuideIfGranted(fullScreenIntentEnabled: boolean): void {
  if (!fullScreenIntentEnabled) return;
  if (!getFullScreenIntentGuidePending()) return;
  markFsiSessionGuideHandled();
  settleFullScreenIntentGuideSheet("later");
}
