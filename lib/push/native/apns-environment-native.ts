import { registerPlugin } from "@capacitor/core";
import { DIBAY_DEVICE_CLASS_PLUGIN_ID } from "@/lib/device/dibay-device-class-native";
import { isCapacitorBridgeReady, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

/**
 * PUSH-02 — iOS binary's APNs environment (aps-environment of its provisioning profile).
 * Binaries built before this method existed reject the call → null → server default / learned host.
 */
type DibayApnsEnvironmentPlugin = {
  getApnsEnvironment(): Promise<{ apnsEnvironment?: string | null }>;
};

const DibayDeviceClass = registerPlugin<DibayApnsEnvironmentPlugin>(DIBAY_DEVICE_CLASS_PLUGIN_ID);

export async function readNativeApnsEnvironment(timeoutMs = 1_500): Promise<"sandbox" | "production" | null> {
  if (resolveCapacitorShellPlatform() !== "ios" || !isCapacitorBridgeReady()) return null;
  try {
    const result = await Promise.race([
      DibayDeviceClass.getApnsEnvironment(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    const raw = typeof result?.apnsEnvironment === "string" ? result.apnsEnvironment.trim().toLowerCase() : "";
    if (raw === "production") return "production";
    if (raw === "sandbox" || raw === "development") return "sandbox";
    return null;
  } catch {
    return null;
  }
}
