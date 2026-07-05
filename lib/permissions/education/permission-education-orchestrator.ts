"use client";

import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { callPermissionGate } from "@/lib/call/permissions/call-permission-gate";
import type { CallPermissionCheckResult } from "@/lib/call/permissions/call-permission-types";
import { openNativeCallPermissionSettings } from "@/lib/call/native/native-call-permissions";
import { openPermissionEducationSheet } from "@/lib/permissions/education/permission-education-bridge";
import type {
  PermissionEducationCallFlow,
  PermissionEducationResult,
} from "@/lib/permissions/education/permission-education-types";
import {
  isMobileNativePlatform,
  supportsNativeSettingsShortcut,
} from "@/lib/permissions/education/permission-education-platform";

function isCallMediaReady(
  kind: CommunityMessengerCallKind,
  check: CallPermissionCheckResult,
): boolean {
  return kind === "video" ? check.canVideo : check.canVoice;
}

function callEducationContext(kind: CommunityMessengerCallKind, flow: PermissionEducationCallFlow) {
  return {
    tier: kind === "video" ? ("call_video" as const) : ("call_voice" as const),
    flow,
    kind,
  };
}

/** OS prompt 불가(영구 거부·system_revoked·웹 deny)일 때만 settings education sheet. */
export function needsCallMediaSettingsEducation(
  kind: CommunityMessengerCallKind,
  check: CallPermissionCheckResult,
): boolean {
  if (check.isPermanentlyDenied) return true;
  if (check.effectiveState === "system_revoked") return true;
  if (!isMobileNativePlatform()) {
    if (!check.microphoneGranted && check.os.microphone === "permanently_denied") return true;
    if (kind === "video" && !check.cameraGranted && check.os.camera === "permanently_denied") return true;
  }
  return false;
}

/**
 * Call UI boundary B — OS-first: prompt 가능하면 sheet 없이 preflight로 위임.
 * 영구 거부·system_revoked·웹 browser deny 시에만 짧은 settings sheet.
 */
export async function runCallMediaEducationBeforeGesture(
  kind: CommunityMessengerCallKind,
  flow: PermissionEducationCallFlow,
): Promise<PermissionEducationResult> {
  const check = await callPermissionGate.check(kind);
  if (isCallMediaReady(kind, check)) {
    return { proceed: true };
  }
  if (!needsCallMediaSettingsEducation(kind, check)) {
    return { proceed: true };
  }

  const choice = await openPermissionEducationSheet(callEducationContext(kind, flow));
  if (choice === "later") {
    return { proceed: false };
  }
  if (supportsNativeSettingsShortcut()) {
    await openNativeCallPermissionSettings();
    const after = await callPermissionGate.check(kind);
    return { proceed: isCallMediaReady(kind, after) };
  }
  return { proceed: false };
}

/** FSI deferred — lock-screen receive failure follow-up only; no proactive sheet at call boundary. */
export async function runLockScreenEducationIfNeeded(): Promise<void> {
  /* no-op — OS-only permission UX */
}

export function resetPermissionEducationOrchestratorForTests(): void {
  /* no-op — lock-tier state removed */
}
