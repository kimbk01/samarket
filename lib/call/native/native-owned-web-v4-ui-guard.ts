"use client";

import { readNativeActiveCallSnapshot } from "@/lib/call/native/native-call-service";
import { isNativeEstablishmentOwned } from "@/lib/call/native/native-outgoing-bridge";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import {
  getCallV4PersistedSurfaceOwner,
  isCallV4NativePersistedSurfaceOwner,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { readCallV4Identity, readCallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-store";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

export type NativeOwnedWebV4UiBlockReason =
  | "establishment_owned"
  | "native_snapshot_connected"
  | "store_native_connected"
  | "persisted_native_owner";

/** Android Capacitor shell — Web V4 UI quarantine applies (P2-3). */
export function isAndroidNativeOwnedWebV4UiShell(): boolean {
  return isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "android";
}

function normalizeCallId(callId: string): string {
  return callId.trim();
}

/** Auxiliary-only sync hints (store connected, persisted native owner). */
export function evaluateAuxiliaryNativeOwnedWebV4UiBlock(callId: string): {
  block: boolean;
  reason: NativeOwnedWebV4UiBlockReason | null;
} {
  const sid = normalizeCallId(callId);
  if (!sid) return { block: false, reason: null };

  const identity = readCallV4Identity();
  const phase = readCallV4Phase();
  if (identity?.callId === sid && phase === "connected") {
    return { block: true, reason: "store_native_connected" };
  }

  const owner = getCallV4PersistedSurfaceOwner(sid);
  if (
    isCallV4NativePersistedSurfaceOwner(sid) ||
    owner === "connected" ||
    owner === "accepted_transition"
  ) {
    return { block: true, reason: "persisted_native_owner" };
  }

  return { block: false, reason: null };
}

/** Sync peek — auxiliary hints only; primary checks use resolveNativeOwnedWebV4UiBlock. */
export function peekNativeOwnedWebV4UiBlockSync(callId: string, trigger = "peek_sync"): boolean {
  if (!isAndroidNativeOwnedWebV4UiShell()) return false;
  const sid = normalizeCallId(callId);
  if (!sid) return false;
  const auxiliary = evaluateAuxiliaryNativeOwnedWebV4UiBlock(sid);
  if (auxiliary.block && auxiliary.reason) {
    logCallV4("web_v4_ui_mount_blocked", {
      callId: sid,
      reason: auxiliary.reason,
      trigger,
      source: "peek_sync",
    });
    return true;
  }
  return false;
}

function logNativeOwnedWebV4UiBlocked(
  callId: string,
  reason: NativeOwnedWebV4UiBlockReason,
  trigger: string,
): void {
  logCallV4("web_v4_ui_mount_blocked", { callId, reason, trigger });
}

/**
 * P2-3 — block Web V4 UI when Native owns the call (Android only).
 * Primary: establishment owned → snapshot connected. Auxiliary: store / persisted owner.
 */
export async function resolveNativeOwnedWebV4UiBlock(
  callId: string,
  trigger: string,
): Promise<boolean> {
  const sid = normalizeCallId(callId);
  if (!sid || !isAndroidNativeOwnedWebV4UiShell()) return false;

  if (await isNativeEstablishmentOwned(sid)) {
    logNativeOwnedWebV4UiBlocked(sid, "establishment_owned", trigger);
    return true;
  }

  const snapshot = await readNativeActiveCallSnapshot();
  const snapshotCallId = snapshot?.callId?.trim() ?? "";
  if (snapshotCallId === sid && snapshot?.connected === true) {
    logNativeOwnedWebV4UiBlocked(sid, "native_snapshot_connected", trigger);
    return true;
  }

  const auxiliary = evaluateAuxiliaryNativeOwnedWebV4UiBlock(sid);
  if (auxiliary.block && auxiliary.reason) {
    logNativeOwnedWebV4UiBlocked(sid, auxiliary.reason, trigger);
    return true;
  }

  return false;
}

export function resetNativeOwnedWebV4UiBlockForTests(): void {
  /* stateless — hook for test symmetry */
}
