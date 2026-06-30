"use client";

import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { callPermissionGate } from "@/lib/call/permissions/call-permission-gate";
import { openNativeCallPermissionSettings } from "@/lib/call/native/native-call-permissions";
import {
  openBatteryOptimizationSettings,
  openFullScreenIntentSettings,
} from "@/lib/permissions/permission-manager/notification-permission-manager";
import { getNotificationGuidePending } from "@/lib/permissions/permission-manager/notification-permission-ui-bridge";
import { buildPermissionCapabilitySummary } from "@/lib/permissions/education/permission-capability-summary";
import {
  openPermissionEducationSheet,
  showPermissionEducationSuccessToast,
} from "@/lib/permissions/education/permission-education-bridge";
import type {
  PermissionEducationCallFlow,
  PermissionEducationResult,
  PermissionCapabilitySummary,
} from "@/lib/permissions/education/permission-education-types";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate } from "@/lib/i18n/messages";
import {
  isMobileNativePlatform,
  supportsLockScreenIncomingEducation,
  supportsNativeSettingsShortcut,
} from "@/lib/permissions/education/permission-education-platform";

function isCallMediaReady(kind: CommunityMessengerCallKind, check: Awaited<ReturnType<typeof callPermissionGate.check>>): boolean {
  return kind === "video" ? check.canVideo : check.canVoice;
}

function callEducationContext(kind: CommunityMessengerCallKind, flow: PermissionEducationCallFlow) {
  return {
    tier: kind === "video" ? ("call_video" as const) : ("call_voice" as const),
    flow,
    kind,
  };
}

/** Pre-permission education before existing call preflight (UI boundary B). */
export async function runCallMediaEducationBeforeGesture(
  kind: CommunityMessengerCallKind,
  flow: PermissionEducationCallFlow,
): Promise<PermissionEducationResult> {
  const check = await callPermissionGate.check(kind);
  if (isCallMediaReady(kind, check)) {
    return { proceed: true };
  }

  const choice = await openPermissionEducationSheet(callEducationContext(kind, flow));
  if (choice === "later") {
    return { proceed: false };
  }
  if (choice === "settings") {
    if (supportsNativeSettingsShortcut()) {
      await openNativeCallPermissionSettings();
      await resyncAfterSettingsReturn();
      const after = await callPermissionGate.check(kind);
      return { proceed: isCallMediaReady(kind, after) };
    }
    return { proceed: false };
  }
  return { proceed: true };
}

let lockTierPromptInflight: Promise<void> | null = null;
let lockTierDismissedAt = 0;
const LOCK_TIER_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** Proactive lock-tier education when receiveReady but lock screen path blocked. */
export async function runLockScreenEducationIfNeeded(): Promise<void> {
  if (!supportsLockScreenIncomingEducation() || !isMobileNativePlatform()) return;
  if (getNotificationGuidePending()) return;
  if (Date.now() - lockTierDismissedAt < LOCK_TIER_COOLDOWN_MS) return;
  if (lockTierPromptInflight) {
    await lockTierPromptInflight;
    return;
  }

  lockTierPromptInflight = (async () => {
    const summary = await buildPermissionCapabilitySummary();
    if (!summary.receiveReady || summary.lockScreenIncomingReady) return;

    const tier =
      summary.lockScreenBlockReason === "battery_restricted" ||
      summary.items.find((i) => i.id === "battery")?.pass === false
        ? ("battery_restricted" as const)
        : ("lock_screen_fsi" as const);

    const choice = await openPermissionEducationSheet({ tier }, summary);
    if (choice === "later") {
      lockTierDismissedAt = Date.now();
      return;
    }
    if (choice === "settings") {
      if (tier === "battery_restricted") {
        await openBatteryOptimizationSettings();
      } else {
        await openFullScreenIntentSettings();
      }
      const after = await resyncAfterSettingsReturn();
      if (tier === "battery_restricted" ? after.items.find((i) => i.id === "battery")?.pass : after.lockScreenIncomingReady) {
        const lang = getRuntimeAppLanguage();
        showPermissionEducationSuccessToast(translate(lang, "perm_edu_success_toast_ready"));
      }
    }
  })().finally(() => {
    lockTierPromptInflight = null;
  });

  await lockTierPromptInflight;
}

export async function resyncAfterSettingsReturn(): Promise<PermissionCapabilitySummary> {
  return buildPermissionCapabilitySummary({ forceSync: true });
}

export function resetPermissionEducationOrchestratorForTests(): void {
  lockTierPromptInflight = null;
  lockTierDismissedAt = 0;
}
