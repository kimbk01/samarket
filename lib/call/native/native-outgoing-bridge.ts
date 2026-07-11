"use client";

import { invokeNativeCallServicePlugin } from "@/lib/call/native/native-call-service";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";

export type NativeOutgoingEstablishmentInput = {
  callId: string;
  roomId: string;
  mediaType: string;
  peerUserId?: string | null;
  peerName?: string | null;
};

export type NativeOutgoingEstablishmentResult = {
  ok: boolean;
  nativeOwned: boolean;
};

function isAndroidNativeShell(): boolean {
  return isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "android";
}

function isIosNativeShell(): boolean {
  return isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "ios";
}

/** True when outgoing must use Native Runtime only (Android Capacitor shell). */
export function isAndroidNativeOutgoingShell(): boolean {
  return isAndroidNativeShell();
}

/**
 * iOS native voice outgoing — reads bundled lane flags from native (dibay-call-lane.json).
 * No Web sessionStorage/env gate — QA only needs json + rebuild.
 */
export async function isIOSNativeOutgoingShell(): Promise<boolean> {
  if (!isIosNativeShell()) return false;
  const result = await invokeNativeCallServicePlugin<{ enabled: boolean }>("isNativeVoiceOutgoingLaneEnabled", {});
  return result?.enabled ?? false;
}

/** O2 — hand off outgoing establishment to Native Runtime (Android + iOS when gated). */
export async function startNativeOutgoingEstablishment(
  input: NativeOutgoingEstablishmentInput,
): Promise<NativeOutgoingEstablishmentResult> {
  const callId = input.callId.trim();
  if (!callId) {
    return { ok: false, nativeOwned: false };
  }
  if (!isAndroidNativeShell() && !(await isIOSNativeOutgoingShell())) {
    return { ok: false, nativeOwned: false };
  }
  const result = await invokeNativeCallServicePlugin<NativeOutgoingEstablishmentResult>(
    "startNativeOutgoingEstablishment",
    {
      callId,
      roomId: input.roomId.trim(),
      mediaType: input.mediaType.trim() || "voice",
      peerUserId: input.peerUserId?.trim() || "",
      peerName: input.peerName?.trim() || "",
    },
  );
  return {
    ok: result?.ok ?? false,
    nativeOwned: result?.nativeOwned ?? false,
  };
}

/**
 * iOS Capacitor bridge dispatch (registerPlugin proxy / nativePromise) has been observed to hang
 * indefinitely without resolving or rejecting (same failure mode as isNativeVoiceOutgoingLaneEnabled,
 * see call-v4-actions.ts outgoing_ios_shell_check_timeout). Since this is polled every 500ms from
 * the caller-active poll (call-v4-caller-active.ts) and gates the Agora join (call-v4-agora.ts), a
 * hang here silently blocks the caller from ever detecting the callee's accept. Timeout + fallback
 * to `false` (== "not native owned" == safe/Web path) so a stuck bridge call can never freeze the
 * outgoing call flow.
 */
const IOS_NATIVE_ESTABLISHMENT_OWNED_TIMEOUT_MS = 1500;

export async function isNativeEstablishmentOwned(callId: string): Promise<boolean> {
  const sid = callId.trim();
  if (!sid) return false;
  if (!isAndroidNativeShell() && !isIosNativeShell()) return false;
  const ownedCheck = invokeNativeCallServicePlugin<{ owned: boolean }>("isNativeEstablishmentOwned", {
    callId: sid,
  });
  if (isIosNativeShell()) {
    const result = await Promise.race([
      ownedCheck,
      new Promise<null>((resolve) => {
        setTimeout(() => {
          logCallV4("ios_native_establishment_owned_check_timeout", { callId: sid });
          resolve(null);
        }, IOS_NATIVE_ESTABLISHMENT_OWNED_TIMEOUT_MS);
      }),
    ]);
    return result?.owned ?? false;
  }
  const result = await ownedCheck;
  return result?.owned ?? false;
}
