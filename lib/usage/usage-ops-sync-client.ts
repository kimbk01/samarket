"use client";

import type { UsageOpsBundleV1 } from "@/lib/usage/usage-state";
import { exportUsageOpsBundle, importUsageOpsBundle } from "@/lib/usage/usage-state";

export async function loadUsageOpsFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/usage-ops", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: UsageOpsBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importUsageOpsBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistUsageOpsToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportUsageOpsBundle();
    const res = await fetch("/api/admin/usage-ops", {
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
