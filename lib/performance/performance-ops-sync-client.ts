"use client";

import type { PerformanceOpsBundleV1 } from "@/lib/performance/performance-state";
import {
  exportPerformanceOpsBundle,
  importPerformanceOpsBundle,
} from "@/lib/performance/performance-state";

export async function loadPerformanceOpsFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/performance-ops", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: PerformanceOpsBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importPerformanceOpsBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistPerformanceOpsToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportPerformanceOpsBundle();
    const res = await fetch("/api/admin/performance-ops", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundle }),
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      return { ok: false, error: j.error ?? "save_failed" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}
