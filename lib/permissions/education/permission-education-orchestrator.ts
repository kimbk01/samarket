"use client";

import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { callPermissionGate } from "@/lib/call/permissions/call-permission-gate";
import type { CallPermissionCheckResult } from "@/lib/call/permissions/call-permission-types";
import type {
  PermissionEducationCallFlow,
  PermissionEducationResult,
} from "@/lib/permissions/education/permission-education-types";
import { isMobileNativePlatform } from "@/lib/permissions/education/permission-education-platform";

function isCallMediaReady(
  kind: CommunityMessengerCallKind,
  check: CallPermissionCheckResult,
): boolean {
  return kind === "video" ? check.canVideo : check.canVoice;
}

/** OS prompt 불가(영구 거부·system_revoked·웹 deny) 상태 판별 — DIBAY UI 없음. */
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
 * @deprecated OS-only UX — DIBAY education sheet 제거. 호출부는 ensureCallMediaForUserGesture 로 이전.
 */
export async function runCallMediaEducationBeforeGesture(
  kind: CommunityMessengerCallKind,
  _flow: PermissionEducationCallFlow,
): Promise<PermissionEducationResult> {
  const check = await callPermissionGate.check(kind);
  if (isCallMediaReady(kind, check)) {
    return { proceed: true };
  }
  if (!needsCallMediaSettingsEducation(kind, check)) {
    return { proceed: true };
  }
  return { proceed: false };
}

/** Call boundary — battery tier OS settings when restricted (legacy; login excluded). */
export async function runLockScreenEducationIfNeeded(): Promise<void> {
  const { runCallBoundaryBatteryOptimizationCheck } = await import(
    "@/lib/permissions/permission-manager/call-boundary-battery-optimization-check"
  );
  await runCallBoundaryBatteryOptimizationCheck();
}

export function resetPermissionEducationOrchestratorForTests(): void {
  void import("@/lib/permissions/permission-manager/call-boundary-battery-optimization-check").then(
    ({ resetCallBoundaryBatteryOptimizationCheckForTests }) => {
      resetCallBoundaryBatteryOptimizationCheckForTests();
    },
  );
}
