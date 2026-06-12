"use client";

import type { OpsMaturityBundleV1 } from "@/lib/ops-maturity/ops-maturity-state";
import {
  exportOpsMaturityBundle,
  importOpsMaturityBundle,
} from "@/lib/ops-maturity/ops-maturity-state";

export async function loadOpsMaturityFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/ops-maturity", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: OpsMaturityBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importOpsMaturityBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistOpsMaturityToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportOpsMaturityBundle();
    const res = await fetch("/api/admin/ops-maturity", {
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
