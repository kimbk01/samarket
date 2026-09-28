import { registerPlugin } from "@capacitor/core";
import {
  isCapacitorBridgeReady,
  resolveCapacitorShellPlatform,
  waitForCapacitorBridgeReady,
} from "@/lib/platform/capacitor-native";
import type { OpeningRuntimeManifest } from "@/lib/opening-show/runtime-contract";

export const OPENING_RUNTIME_PLUGIN_ID = "OpeningRuntime";

type OpeningRuntimePlugin = {
  preparePack(options: OpeningRuntimeManifest): Promise<{ ok: boolean; ready: boolean }>;
};

const OpeningRuntime = registerPlugin<OpeningRuntimePlugin>(OPENING_RUNTIME_PLUGIN_ID);

function invokePreparePack(manifest: OpeningRuntimeManifest): Promise<{ ok: boolean; ready: boolean }> {
  const cap = (typeof window !== "undefined" ? window : undefined) as
    | (Window & {
        Capacitor?: {
          nativePromise?: (plugin: string, methodName: string, options?: unknown) => Promise<unknown>;
        };
      })
    | undefined;
  const nativePromise = cap?.Capacitor?.nativePromise;
  if (typeof nativePromise === "function" && isCapacitorBridgeReady()) {
    return nativePromise(OPENING_RUNTIME_PLUGIN_ID, "preparePack", manifest) as Promise<{
      ok: boolean;
      ready: boolean;
    }>;
  }
  return OpeningRuntime.preparePack(manifest);
}

export async function prepareOpeningRuntimePack(
  manifest: OpeningRuntimeManifest
): Promise<{ ok: boolean; ready: boolean } | null> {
  const shell = resolveCapacitorShellPlatform();
  if (shell !== "android" && shell !== "ios") return null;
  if (!isCapacitorBridgeReady()) {
    const ready = await waitForCapacitorBridgeReady({ timeoutMs: 3_500 });
    if (!ready) return null;
  }
  try {
    return await invokePreparePack(manifest);
  } catch {
    return null;
  }
}
