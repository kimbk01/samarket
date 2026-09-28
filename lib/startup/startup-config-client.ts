"use client";

import {
  BUNDLED_STARTUP_CONFIG,
  normalizeStartupConfig,
  type StartupConfig,
} from "@/lib/startup/startup-config";
import { DIBAY_STARTUP_INTRO_DOM_ID } from "@/lib/startup/startup-constants";
import {
  readStartupConfigCache,
  writeStartupConfigCache,
} from "@/lib/startup/startup-cache";

let memory: StartupConfig = { ...BUNDLED_STARTUP_CONFIG };
let hydrateStarted = false;

if (typeof window !== "undefined") {
  memory = readStartupConfigCache();
}

export function getStartupConfigCached(): StartupConfig {
  memory = readStartupConfigCache();
  return { ...memory };
}

export function applyStartupConfigToDom(_config: StartupConfig): void {
  if (typeof document === "undefined") return;
  const root = document.getElementById(DIBAY_STARTUP_INTRO_DOM_ID);
  if (!root) return;
  root.setAttribute("data-ready", "1");
  root.setAttribute("hidden", "");
  root.setAttribute("aria-hidden", "true");
}

/**
 * After first paint — refresh remote config for *next* cold start.
 * Must never block App Ready.
 */
export function scheduleStartupConfigRefresh(): void {
  if (typeof window === "undefined") return;
  if (hydrateStarted) return;
  hydrateStarted = true;

  const run = () => {
    void (async () => {
      try {
        const res = await fetch("/api/app/startup-config", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { ok?: boolean; config?: unknown };
        if (!json?.ok) return;
        const next = normalizeStartupConfig(json.config);
        memory = next;
        writeStartupConfigCache(next);
        const { syncStartupConfigToNative } = await import(
          "@/lib/startup/startup-config-native-sync"
        );
        syncStartupConfigToNative(next);
      } catch {
        /* keep cached / default */
      }
    })();
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => run(), { timeout: 4000 });
  } else {
    window.setTimeout(run, 1200);
  }
}

export function persistStartupConfigCache(config: StartupConfig): void {
  memory = normalizeStartupConfig(config);
  writeStartupConfigCache(memory);
  void import("@/lib/startup/startup-config-native-sync").then((m) => {
    m.syncStartupConfigToNative(memory);
  });
}
