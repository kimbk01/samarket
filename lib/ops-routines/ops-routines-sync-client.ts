"use client";

import type { OpsRoutinesBundleV1 } from "@/lib/ops-routines/ops-routines-state";
import {
  exportOpsRoutinesBundle,
  importOpsRoutinesBundle,
} from "@/lib/ops-routines/ops-routines-state";

export async function loadOpsRoutinesFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/ops-routines", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: OpsRoutinesBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importOpsRoutinesBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistOpsRoutinesToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportOpsRoutinesBundle();
    const res = await fetch("/api/admin/ops-routines", {
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
