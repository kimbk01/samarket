"use client";

const OUTGOING_SESSION_OVERRIDE_KEY = "dibay:native_voice_outgoing";
const RUNTIME_SESSION_OVERRIDE_KEY = "dibay:native_voice_runtime";

/** iOS native voice outgoing — bundled lane + Web gate (default OFF). */
export function isNativeVoiceOutgoingRuntimeEnabled(): boolean {
  const env = process.env.NEXT_PUBLIC_DIBAY_NATIVE_VOICE_OUTGOING;
  if (env === "1") return true;
  if (env === "0") return false;
  if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(OUTGOING_SESSION_OVERRIDE_KEY) === "1") {
    return true;
  }
  return false;
}

/**
 * iOS outgoing handoff base gate — mirrors bundled `nativeVoiceRuntime` without changing
 * `isNativeVoiceRuntimeEnabled()` (Android default + CallV4Screen contract).
 */
export function isNativeVoiceRuntimeGateEnabledForIosOutgoing(): boolean {
  const env = process.env.NEXT_PUBLIC_DIBAY_NATIVE_VOICE_RUNTIME;
  if (env === "1") return true;
  if (env === "0") return false;
  if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(RUNTIME_SESSION_OVERRIDE_KEY) === "1") {
    return true;
  }
  return false;
}
