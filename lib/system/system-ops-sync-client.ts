"use client";

import type { SystemOpsBundleV1 } from "@/lib/system/system-state";
import { exportSystemOpsBundle, importSystemOpsBundle } from "@/lib/system/system-state";

export async function loadSystemOpsFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/system-ops", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: SystemOpsBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importSystemOpsBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistSystemOpsToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportSystemOpsBundle();
    const res = await fetch("/api/admin/system-ops", {
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
