"use client";

import { useEffect } from "react";
import { shouldRunOsEntryRuntime } from "@/lib/os-entry/runtime-platform";
import { warmSyncOsEntryLive } from "@/lib/os-entry/warm-sync";

/**
 * Foreground / warm sync only. Never blocks cold OsEntry paint.
 */
export function OsEntryWarmSyncHost() {
  useEffect(() => {
    if (!shouldRunOsEntryRuntime()) return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void warmSyncOsEntryLive();
    };

    const t = window.setTimeout(run, 2500);
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", run);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", run);
    };
  }, []);

  return null;
}
