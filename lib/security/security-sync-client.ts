"use client";

import type { SecurityOpsBundleV1 } from "@/lib/security/security-state";
import {
  exportSecurityOpsBundle,
  importSecurityOpsBundle,
} from "@/lib/security/security-state";

export async function loadSecurityOpsFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/security-ops", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: SecurityOpsBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importSecurityOpsBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistSecurityOpsToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportSecurityOpsBundle();
    const res = await fetch("/api/admin/security-ops", {
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
