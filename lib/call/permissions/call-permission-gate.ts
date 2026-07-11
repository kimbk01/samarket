"use client";

import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { logDibayCallFlow } from "@/lib/call/logging/call-flow-log";
import {
  checkNativeCallOsPermissions,
  requestNativeCallMediaPermissions,
} from "@/lib/call/native/native-call-permissions";
import {
  deriveStoreStateFromOsGrant,
  readCallPermissionStoreState,
  writeCallPermissionStoreState,
} from "@/lib/call/permissions/call-permission-store";
import type {
  CallOsPermissionSnapshot,
  CallOsPermissionState,
  CallPermissionCheckResult,
  CallPermissionGateContext,
  CallPermissionRequireResult,
  CallPermissionStoreState,
} from "@/lib/call/permissions/call-permission-types";
import { requiredPermissionsForKind } from "@/lib/call/permissions/call-permission-types";

function isOsGranted(state: CallOsPermissionState): boolean {
  return state === "granted";
}

function isOsPromptAvailable(state: CallOsPermissionState): boolean {
  return state === "prompt_available";
}

function isOsPermanentlyDenied(state: CallOsPermissionState): boolean {
  return state === "permanently_denied";
}

function resolveOsPermanentDenial(
  kind: CommunityMessengerCallKind,
  os: CallOsPermissionSnapshot,
): boolean {
  const required = requiredPermissionsForKind(kind);
  if (required.microphone && isOsPermanentlyDenied(os.microphone)) return true;
  if (required.camera && isOsPermanentlyDenied(os.camera)) return true;
  return false;
}

function resolveEffectiveState(
  storeState: CallPermissionStoreState,
  os: CallOsPermissionSnapshot,
  kind: CommunityMessengerCallKind,
): CallPermissionStoreState {
  const micGranted = isOsGranted(os.microphone);
  const camGranted = isOsGranted(os.camera);
  const storeSaysGranted = storeState === "granted_audio" || storeState === "granted_audio_video";
  if (storeSaysGranted && !micGranted) return "system_revoked";
  if (micGranted && camGranted) return "granted_audio_video";
  if (micGranted) return "granted_audio";
  if (resolveOsPermanentDenial(kind, os)) return "denied_permanently";
  if (storeState === "denied_permanently") return "denied_permanently";
  if (storeState === "denied_once") return "denied_once";
  if (storeState === "system_revoked") return "system_revoked";
  return storeState === "unknown" ? "unknown" : storeState;
}

function osNeedsPrompt(kind: CommunityMessengerCallKind, os: CallOsPermissionSnapshot): boolean {
  const required = requiredPermissionsForKind(kind);
  if (required.microphone && isOsPromptAvailable(os.microphone)) return true;
  if (required.camera && isOsPromptAvailable(os.camera)) return true;
  return false;
}

export async function checkCallPermission(
  kind: CommunityMessengerCallKind = "voice",
): Promise<CallPermissionCheckResult> {
  logDibayCallFlow("permission_check_start", { kind });
  const storeState = readCallPermissionStoreState();
  const os = await checkNativeCallOsPermissions();
  const microphoneGranted = isOsGranted(os.microphone);
  const cameraGranted = isOsGranted(os.camera);
  const effectiveState = resolveEffectiveState(storeState, os, kind);
  const canVoice = microphoneGranted;
  const canVideo = microphoneGranted && cameraGranted;
  const canFallbackToVoice = kind === "video" && microphoneGranted && !cameraGranted;
  const isPermanentlyDenied = resolveOsPermanentDenial(kind, os) || effectiveState === "denied_permanently";

  const result: CallPermissionCheckResult = {
    storeState,
    os,
    effectiveState,
    microphoneGranted,
    cameraGranted,
    canVoice,
    canVideo,
    canFallbackToVoice,
    isPermanentlyDenied,
  };
  logDibayCallFlow("permission_check_result", { kind, ...result });
  return result;
}

export async function promptCallPermission(
  kind: CommunityMessengerCallKind,
  context: CallPermissionGateContext,
): Promise<CallPermissionCheckResult> {
  logDibayCallFlow("permission_prompt_open", { kind, context });
  const before = await checkCallPermission(kind);
  if ((kind === "video" ? before.canVideo : before.canVoice) || !osNeedsPrompt(kind, before.os)) {
    if (before.isPermanentlyDenied) {
      logDibayCallFlow("permission_prompt_denied", { kind, context, settingsOnly: true });
    }
    return before;
  }

  const osAfter = await requestNativeCallMediaPermissions(kind);
  const microphoneGranted = isOsGranted(osAfter.microphone);
  const cameraGranted = isOsGranted(osAfter.camera);
  const deniedPermanently = resolveOsPermanentDenial(kind, osAfter);
  const nextStore = deriveStoreStateFromOsGrant({ microphoneGranted, cameraGranted, deniedPermanently });
  writeCallPermissionStoreState(nextStore);
  const check = await checkCallPermission(kind);
  if (check.canVoice && (kind === "voice" || check.canVideo)) {
    logDibayCallFlow("permission_prompt_granted", { kind, context });
  } else {
    logDibayCallFlow("permission_prompt_denied", { kind, context, effectiveState: check.effectiveState });
  }
  return check;
}

function evaluateRequire(
  kind: CommunityMessengerCallKind,
  check: CallPermissionCheckResult,
): CallPermissionRequireResult {
  const required = requiredPermissionsForKind(kind);
  if (!check.microphoneGranted) {
    return {
      ok: false,
      check,
      reason: check.isPermanentlyDenied ? "permanently_denied" : "microphone_required",
    };
  }
  if (required.camera && !check.cameraGranted) {
    return {
      ok: false,
      check,
      reason: check.isPermanentlyDenied ? "permanently_denied" : "camera_required",
      canFallbackToVoice: check.canFallbackToVoice,
    };
  }
  return { ok: true, check };
}

export async function requireCallPermissionForOutgoing(
  kind: CommunityMessengerCallKind,
): Promise<CallPermissionRequireResult> {
  const check = await checkCallPermission(kind);
  const evaluated = evaluateRequire(kind, check);
  if (!evaluated.ok) {
    logDibayCallFlow("outgoing_blocked_permission", { kind, reason: evaluated.reason });
  }
  return evaluated;
}

export async function requireCallPermissionForIncoming(
  kind: CommunityMessengerCallKind,
): Promise<CallPermissionRequireResult> {
  const check = await checkCallPermission(kind);
  const evaluated = evaluateRequire(kind, check);
  if (!evaluated.ok) {
    logDibayCallFlow("incoming_accept_blocked_permission", { kind, reason: evaluated.reason });
  }
  return evaluated;
}

export const callPermissionGate = {
  check: checkCallPermission,
  prompt: promptCallPermission,
  requireForOutgoing: requireCallPermissionForOutgoing,
  requireForIncoming: requireCallPermissionForIncoming,
};
