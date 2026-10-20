"use client";

import { adminSafeErrorCode } from "@/lib/admin/admin-load-failure";

import type { OpsBenchmarksBundleV1 } from "@/lib/ops-benchmarks/ops-benchmarks-state";
import {
  exportOpsBenchmarksBundle,
  importOpsBenchmarksBundle,
} from "@/lib/ops-benchmarks/ops-benchmarks-state";

export async function loadOpsBenchmarksFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
  httpStatus?: number;
}> {
  try {
    const res = await fetch("/api/admin/ops-benchmarks", { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      bundle?: OpsBenchmarksBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: adminSafeErrorCode(j.error, "load_failed"), httpStatus: res.status };
    }
    importOpsBenchmarksBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export async function persistOpsBenchmarksToServer(): Promise<{ ok: boolean; error?: string; httpStatus?: number }> {
  try {
    const bundle = exportOpsBenchmarksBundle();
    const res = await fetch("/api/admin/ops-benchmarks", {
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
