import { registerPlugin } from "@capacitor/core";
import {
  isCapacitorBridgeReady,
  resolveCapacitorShellPlatform,
  waitForCapacitorBridgeReady,
} from "@/lib/platform/capacitor-native";
import type { DibayDeviceClassResult } from "@/lib/device/dibay-device-class";

export const DIBAY_DEVICE_CLASS_PLUGIN_ID = "DibayDeviceClass";

type DibayDeviceClassPlugin = {
  getDeviceClass(): Promise<DibayDeviceClassResult>;
};

const DibayDeviceClass = registerPlugin<DibayDeviceClassPlugin>(DIBAY_DEVICE_CLASS_PLUGIN_ID);

function invokeNativeDeviceClass(): Promise<DibayDeviceClassResult> {
  const cap = (typeof window !== "undefined" ? window : undefined) as
    | (Window & {
        Capacitor?: {
          nativePromise?: (plugin: string, methodName: string, options?: unknown) => Promise<unknown>;
        };
      })
    | undefined;
  const nativePromise = cap?.Capacitor?.nativePromise;
  if (typeof nativePromise === "function" && isCapacitorBridgeReady()) {
    return nativePromise(DIBAY_DEVICE_CLASS_PLUGIN_ID, "getDeviceClass", {}) as Promise<DibayDeviceClassResult>;
  }
  return DibayDeviceClass.getDeviceClass();
}

export async function readNativeDibayDeviceClass(): Promise<DibayDeviceClassResult | null> {
  const shell = resolveCapacitorShellPlatform();
  if (shell !== "android" && shell !== "ios") return null;
  if (!isCapacitorBridgeReady()) {
    const ready = await waitForCapacitorBridgeReady({ timeoutMs: 3_500 });
    if (!ready) return null;
  }
  try {
    return await invokeNativeDeviceClass();
  } catch {
    return null;
  }
}
