"use client";

import type { OpsDocsBundleV1 } from "@/lib/ops-docs/ops-docs-state";
import { exportOpsDocsBundle, importOpsDocsBundle } from "@/lib/ops-docs/ops-docs-state";

export async function loadOpsDocsFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/ops-docs", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: OpsDocsBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importOpsDocsBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistOpsDocsToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportOpsDocsBundle();
    const res = await fetch("/api/admin/ops-docs", {
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
