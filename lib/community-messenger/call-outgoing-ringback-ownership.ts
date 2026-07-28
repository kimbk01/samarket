/**
 * Web outgoing ringback ownership — skip Web tone when Native Runtime owns establishment.
 */
import {
  isAndroidNativeOutgoingShell,
  isIOSNativeOutgoingShell,
  isIOSNativeVideoOutgoingShell,
} from "@/lib/call/native/native-outgoing-bridge";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

/**
 * True when Web must not start outgoing ringback (native owner will).
 * Sync for Android; async check for iOS — use `shouldSkipWebOutgoingRingbackAsync` when awaiting is ok.
 */
export function shouldSkipWebOutgoingRingbackSync(kind: "voice" | "video"): boolean {
  if (!isCapacitorNativePlatform()) return false;
  if (resolveCapacitorShellPlatform() === "android") {
    return isAndroidNativeOutgoingShell();
  }
  return false;
}

export async function shouldSkipWebOutgoingRingbackAsync(kind: "voice" | "video"): Promise<boolean> {
  if (!isCapacitorNativePlatform()) return false;
  if (resolveCapacitorShellPlatform() === "android") {
    return isAndroidNativeOutgoingShell();
  }
  if (resolveCapacitorShellPlatform() === "ios") {
    if (kind === "video") return await isIOSNativeVideoOutgoingShell();
    return await isIOSNativeOutgoingShell();
  }
  return false;
}
