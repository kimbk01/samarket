"use client";

import { adminSafeErrorCode } from "@/lib/admin/admin-load-failure";

import type { PerformanceOpsBundleV1 } from "@/lib/performance/performance-state";
import {
  exportPerformanceOpsBundle,
  importPerformanceOpsBundle,
} from "@/lib/performance/performance-state";

export async function loadPerformanceOpsFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
  httpStatus?: number;
}> {
  try {
    const res = await fetch("/api/admin/performance-ops", { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      bundle?: PerformanceOpsBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: adminSafeErrorCode(j.error, "load_failed"), httpStatus: res.status };
    }
    importPerformanceOpsBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export async function persistPerformanceOpsToServer(): Promise<{ ok: boolean; error?: string; httpStatus?: number }> {
  try {
    const bundle = exportPerformanceOpsBundle();
    const res = await fetch("/api/admin/performance-ops", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundle }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      return { ok: false, error: adminSafeErrorCode(j.error, "save_failed"), httpStatus: res.status };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "network_error" };
  }
}
