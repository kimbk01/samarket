/**
 * Push StartupConfig to Native bridge for next cold start (never blocks App Ready).
 */

import {
  toNativeStartupConfigPayload,
  type StartupConfig,
} from "@/lib/startup/startup-config";

declare global {
  interface Window {
    DibayBootBridge?: {
      dismissSplash?: () => void;
      endHandoffCover?: () => void;
      setInitialSurface?: (surface: string) => void;
      persistStartupConfig?: (json: string) => void;
    };
  }
}

export function syncStartupConfigToNative(config: StartupConfig): void {
  if (typeof window === "undefined") return;
  try {
    const bridge = window.DibayBootBridge;
    bridge?.setInitialSurface?.(config.initialSurface);
    const payload = toNativeStartupConfigPayload(config);
    const json = JSON.stringify(payload);
    bridge?.persistStartupConfig?.(json);
  } catch {
    /* ignore — web / missing bridge */
  }
}
