"use client";

import type { OpsBenchmarksBundleV1 } from "@/lib/ops-benchmarks/ops-benchmarks-state";
import {
  exportOpsBenchmarksBundle,
  importOpsBenchmarksBundle,
} from "@/lib/ops-benchmarks/ops-benchmarks-state";

export async function loadOpsBenchmarksFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/ops-benchmarks", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: OpsBenchmarksBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importOpsBenchmarksBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistOpsBenchmarksToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportOpsBenchmarksBundle();
    const res = await fetch("/api/admin/ops-benchmarks", {
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
