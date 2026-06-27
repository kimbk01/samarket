"use client";

import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

/** Android Native Voice Runtime flag. Web must not autostart voice accept when enabled. */
export function isNativeVoiceRuntimeEnabled(): boolean {
  const env = process.env.NEXT_PUBLIC_DIBAY_NATIVE_VOICE_RUNTIME;
  if (env === "1") return true;
  if (env === "0") return false;
  return resolveCapacitorShellPlatform() === "android";
}
